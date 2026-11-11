import { Router } from 'express';
import { currentUser } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { boundingBox, haversineKm, round1 } from '../lib/geo.js';
import type { Deps } from '../deps.js';
import { serializeDonor, serializeOwnHospital, serializePublicHospital } from './presenters.js';
import { BLOOD_GROUPS } from './schemas.js';

const BANDS = [
  { label: '0–5 km', max: 5 },
  { label: '5–10 km', max: 10 },
  { label: '10–25 km', max: 25 },
];

/** Real facilities around a point, grouped by distance band for the dashboard chart. */
async function networkAround(d: Deps, lat: number, lng: number) {
  const box = boundingBox(lat, lng, 25);
  const rows = await d.db.hospital.findMany({
    where: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng }, OR: [{ source: 'OSM' }, { status: 'VERIFIED' }] },
  });
  const within = rows.map((h) => ({ h, km: haversineKm(lat, lng, h.lat, h.lng) })).filter((x) => x.km <= 25).sort((a, b) => a.km - b.km);

  const bands = BANDS.map((b, i) => {
    const min = i === 0 ? 0 : BANDS[i - 1]!.max;
    const inBand = within.filter((x) => x.km >= min && x.km < b.max);
    return { label: b.label, verified: inBand.filter((x) => x.h.status === 'VERIFIED').length, listed: inBand.filter((x) => x.h.status !== 'VERIFIED').length };
  });
  const nearest = [...within]
    .sort((a, b) => Number(b.h.status === 'VERIFIED') - Number(a.h.status === 'VERIFIED') || a.km - b.km)
    .slice(0, 5)
    .map(({ h, km }) => serializePublicHospital(h, round1(km)));

  return {
    totals: {
      verified: within.filter((x) => x.h.status === 'VERIFIED').length,
      listed: within.filter((x) => x.h.status !== 'VERIFIED').length,
      bloodBanks: within.filter((x) => x.h.type === 'BLOOD_BANK').length,
      withEmergency: within.filter((x) => x.h.hasEmergency).length,
    },
    bands,
    nearest,
  };
}

export function dashboardRouter(d: Deps) {
  const r = Router();

  r.get('/', async (req, res) => {
    const me = currentUser(req);
    const recent = await d.db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: 'desc' }, take: 5 });

    if (me.role === 'DONOR') {
      const profile = await d.db.donorProfile.findUnique({ where: { userId: me.id } });
      if (!profile) throw ApiError.notFound('Donor profile not found.');
      const [invited, accepted, donationAgg] = await Promise.all([
        d.db.donorResponse.count({ where: { donorId: me.id, status: 'INVITED', request: { status: 'OPEN', neededBy: { gt: new Date() } } } }),
        d.db.donorResponse.count({ where: { donorId: me.id, status: 'ACCEPTED', request: { status: 'OPEN', neededBy: { gt: new Date() } } } }),
        d.db.donation.aggregate({ where: { donorId: me.id }, _count: { _all: true }, _sum: { units: true } }),
      ]);
      const units = donationAgg._sum.units ?? 0;
      const activity = { invitations: invited, accepted, donations: donationAgg._count._all, livesImpacted: units * 3 };
      res.json({ role: 'DONOR', ...serializeDonor(profile), activity, network: await networkAround(d, profile.lat, profile.lng), recent });
      return;
    }

    if (me.role === 'REQUESTER') {
      if (me.lat === null || me.lng === null) throw ApiError.badRequest('Add your location in Profile to see hospitals near you.');
      const [active, fulfilled] = await Promise.all([
        d.db.bloodRequest.count({ where: { requesterId: me.id, status: 'OPEN', neededBy: { gt: new Date() } } }),
        d.db.bloodRequest.count({ where: { requesterId: me.id, status: 'FULFILLED' } }),
      ]);
      res.json({ role: 'REQUESTER', city: me.city, requests: { active, fulfilled }, network: await networkAround(d, me.lat, me.lng), recent });
      return;
    }

    if (me.role === 'HOSPITAL') {
      if (!me.hospitalId) {
        res.json({ role: 'HOSPITAL', hospital: null, recent });
        return;
      }
      const h = await d.db.hospital.findUniqueOrThrow({ where: { id: me.hospitalId }, include: { _count: { select: { staff: true } } } });
      let donorsByGroup: { bloodGroup: string; count: number }[] | null = null;
      let donorsNearby = 0;
      if (h.status === 'VERIFIED') {
        // Aggregates only. Hospitals never see individual donor identities before a request is accepted.
        const box = boundingBox(h.lat, h.lng, 25);
        const donors = await d.db.donorProfile.findMany({
          where: { available: true, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
          select: { bloodGroup: true, lat: true, lng: true },
        });
        const near = donors.filter((x) => haversineKm(h.lat, h.lng, x.lat, x.lng) <= 25);
        donorsNearby = near.length;
        donorsByGroup = BLOOD_GROUPS.map((g) => ({ bloodGroup: g, count: near.filter((x) => x.bloodGroup === g).length }));
      }
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const [open, donatedThisMonth] = await Promise.all([
        d.db.bloodRequest.count({ where: { hospitalId: h.id, status: 'OPEN', neededBy: { gt: new Date() } } }),
        d.db.donation.count({ where: { hospitalId: h.id, donatedAt: { gte: monthStart } } }),
      ]);
      res.json({ role: 'HOSPITAL', hospital: serializeOwnHospital(h), donorsNearby, donorsByGroup, requests: { open, donatedThisMonth }, recent });
      return;
    }

    res.json({ role: me.role, recent });
  });

  return r;
}
