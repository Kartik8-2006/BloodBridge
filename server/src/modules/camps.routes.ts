import { Router, type RequestHandler } from 'express';
import type { Camp, Hospital } from '../generated/prisma/client.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { boundingBox, haversineKm } from '../lib/geo.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { FREE_ACTIVE_CAMPS, hasPro } from '../services/billing.js';
import { evaluateEligibility, healthSchema } from '../services/eligibility.js';
import { adjustStock } from '../services/inventory.js';
import { certificateNumber } from '../services/matching.js';
import { audit, notify, notifyMany } from '../services/notify.js';
import { attendanceSchema, campSchema } from './schemas.js';
import { verifiedHospitalOf } from './staff.js';

const MAX_CAMP_ALERTS = 300;
const ALERT_RADIUS_KM = 30;

type CampWithHospital = Camp & { hospital: Hospital };

function present(c: CampWithHospital, registered: number) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    venue: c.venue,
    city: c.city,
    lat: c.lat,
    lng: c.lng,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    capacity: c.capacity,
    registered,
    spotsLeft: Math.max(0, c.capacity - registered),
    status: c.status,
    hospital: { id: c.hospital.id, name: c.hospital.name, city: c.hospital.city, phone: c.hospital.phone },
  };
}

/** Camps whose end time has passed are closed lazily, so every reader sees the same truth. */
const sweepCamps = (d: Deps) => d.db.camp.updateMany({ where: { status: 'SCHEDULED', endsAt: { lt: new Date() } }, data: { status: 'COMPLETED' } });

async function registeredCounts(d: Deps, campIds: string[]) {
  if (!campIds.length) return new Map<string, number>();
  const rows = await d.db.campRegistration.groupBy({ by: ['campId'], where: { campId: { in: campIds }, status: { in: ['REGISTERED', 'ATTENDED'] } }, _count: true });
  return new Map(rows.map((x) => [x.campId, x._count]));
}

export function campsRouter(d: Deps, authed: RequestHandler[]) {
  const r = Router();

  /* ------------------------------------------------------------ public list */
  r.get('/', async (req, res) => {
    await sweepCamps(d);
    const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0, 80) : '';
    const camps = await d.db.camp.findMany({
      where: { status: 'SCHEDULED', endsAt: { gt: new Date() }, hospital: { status: 'VERIFIED' }, ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}) },
      include: { hospital: true },
      orderBy: { startsAt: 'asc' },
      take: 60,
    });
    const counts = await registeredCounts(d, camps.map((c) => c.id));
    res.json({ camps: camps.map((c) => present(c, counts.get(c.id) ?? 0)) });
  });

  /* ------------------------------------------------- donor: my registrations */
  r.get('/mine', ...authed, requireRole('DONOR'), async (req, res) => {
    await sweepCamps(d);
    const me = currentUser(req);
    const regs = await d.db.campRegistration.findMany({ where: { donorId: me.id }, include: { camp: { include: { hospital: true } } }, orderBy: { camp: { startsAt: 'desc' } }, take: 50 });
    const counts = await registeredCounts(d, regs.map((x) => x.campId));
    res.json({ registrations: regs.map((x) => ({ id: x.id, status: x.status, camp: present(x.camp, counts.get(x.campId) ?? 0) })) });
  });

  /* ----------------------------------------------- hospital: managed camps */
  r.get('/managed', ...authed, requireRole('HOSPITAL'), async (req, res) => {
    await sweepCamps(d);
    const h = await verifiedHospitalOf(d, currentUser(req));
    const camps = await d.db.camp.findMany({ where: { hospitalId: h.id }, include: { hospital: true }, orderBy: { startsAt: 'desc' }, take: 50 });
    const counts = await registeredCounts(d, camps.map((c) => c.id));
    res.json({ camps: camps.map((c) => present(c, counts.get(c.id) ?? 0)) });
  });

  r.post('/', ...authed, requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    const body = parse(campSchema, req.body);
    if (!(await hasPro(d, h.id))) {
      const active = await d.db.camp.count({ where: { hospitalId: h.id, status: 'SCHEDULED', endsAt: { gt: new Date() } } });
      if (active >= FREE_ACTIVE_CAMPS) throw new ApiError(402, 'plan_required', `The free plan allows ${FREE_ACTIVE_CAMPS} active camps at a time. Upgrade to Pro for unlimited camps.`);
    }
    const lat = body.lat ?? h.lat;
    const lng = body.lng ?? h.lng;
    const city = body.city ?? h.city ?? 'Unknown';
    const camp = await d.db.camp.create({
      data: { hospitalId: h.id, createdById: me.id, title: body.title, description: body.description ?? null, venue: body.venue, city, lat, lng, startsAt: body.startsAt, endsAt: body.endsAt, capacity: body.capacity },
      include: { hospital: true },
    });
    await audit(d.db, me.id, 'camp.create', 'Camp', camp.id);

    // Tell nearby donors. Only people who keep alerts on, never more than the cap.
    const box = boundingBox(lat, lng, ALERT_RADIUS_KM);
    const nearby = await d.db.donorProfile.findMany({
      where: { available: true, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng }, user: { status: 'ACTIVE' } },
      select: { userId: true, lat: true, lng: true },
    });
    const ids = nearby.filter((x) => haversineKm(lat, lng, x.lat, x.lng) <= ALERT_RADIUS_KM).slice(0, MAX_CAMP_ALERTS).map((x) => x.userId);
    await notifyMany(d.db, ids, {
      type: 'CAMP_NEW',
      title: 'Blood donation camp near you',
      body: `${camp.title} at ${camp.venue}, ${camp.city}. Register to reserve your spot.`,
      data: { campId: camp.id },
    });
    res.status(201).json({ camp: present(camp, 0), alerted: ids.length });
  });

  /* ------------------------------------------------------------- one camp */
  r.get('/:id', async (req, res) => {
    await sweepCamps(d);
    const c = await d.db.camp.findUnique({ where: { id: String(req.params.id) }, include: { hospital: true } });
    if (!c || c.hospital.status !== 'VERIFIED') throw ApiError.notFound('Camp not found.');
    const counts = await registeredCounts(d, [c.id]);
    res.json({ camp: present(c, counts.get(c.id) ?? 0) });
  });

  r.post('/:id/cancel', ...authed, requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const camp = await d.db.camp.findUnique({ where: { id: String(req.params.id) } });
    if (!camp || camp.hospitalId !== me.hospitalId) throw ApiError.notFound('Camp not found.');
    if (camp.status !== 'SCHEDULED') throw ApiError.conflict('Only a scheduled camp can be cancelled.');
    await d.db.camp.update({ where: { id: camp.id }, data: { status: 'CANCELLED' } });
    const regs = await d.db.campRegistration.findMany({ where: { campId: camp.id, status: 'REGISTERED' }, select: { donorId: true } });
    await notifyMany(d.db, regs.map((x) => x.donorId), { type: 'CAMP_UPDATE', title: 'Camp cancelled', body: `${camp.title} has been cancelled by the organiser.`, data: { campId: camp.id } });
    await audit(d.db, me.id, 'camp.cancel', 'Camp', camp.id);
    res.json({ ok: true });
  });

  r.get('/:id/registrations', ...authed, requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const camp = await d.db.camp.findUnique({ where: { id: String(req.params.id) } });
    if (!camp || camp.hospitalId !== me.hospitalId) throw ApiError.notFound('Camp not found.');
    const regs = await d.db.campRegistration.findMany({
      where: { campId: camp.id, status: { not: 'CANCELLED' } },
      include: { donor: { include: { donorProfile: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Donor phone numbers stay private; the hospital contacts donors through the app.
    res.json({ registrations: regs.map((x) => ({ id: x.id, status: x.status, donorName: x.donor.name, bloodGroup: x.donor.donorProfile?.bloodGroup ?? null, registeredAt: x.createdAt })) });
  });

  /** Marks a registered donor as attended or absent. Attending issues a certificate and adds the unit to stock. */
  r.post('/:id/registrations/:regId/attendance', ...authed, requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const { status } = parse(attendanceSchema, req.body);
    const camp = await d.db.camp.findUnique({ where: { id: String(req.params.id) } });
    if (!camp || camp.hospitalId !== me.hospitalId) throw ApiError.notFound('Camp not found.');
    if (camp.status === 'CANCELLED') throw ApiError.conflict('This camp was cancelled.');
    if (camp.startsAt.getTime() > Date.now()) throw ApiError.conflict('Attendance can be recorded once the camp has started.');
    const reg = await d.db.campRegistration.findUnique({ where: { id: String(req.params.regId) }, include: { donor: { include: { donorProfile: true } } } });
    if (!reg || reg.campId !== camp.id) throw ApiError.notFound('Registration not found.');
    if (reg.status !== 'REGISTERED') throw ApiError.conflict('Attendance was already recorded for this donor.');

    if (status === 'NO_SHOW') {
      await d.db.campRegistration.update({ where: { id: reg.id }, data: { status: 'NO_SHOW' } });
      return void res.json({ status: 'NO_SHOW' });
    }
    const profile = reg.donor.donorProfile;
    if (!profile) throw ApiError.badRequest('This donor has no donor profile.');
    const now = new Date();
    const donation = await d.db.$transaction(async (tx) => {
      await tx.campRegistration.update({ where: { id: reg.id }, data: { status: 'ATTENDED' } });
      await tx.donorProfile.update({ where: { id: profile.id }, data: { lastDonationAt: now } });
      return tx.donation.create({ data: { certificateNo: certificateNumber(now), donorId: reg.donorId, hospitalId: camp.hospitalId, bloodGroup: profile.bloodGroup, units: 1, donatedAt: now, verifiedById: me.id } });
    });
    await adjustStock(d.db, { hospitalId: camp.hospitalId, bloodGroup: profile.bloodGroup, delta: 1, reason: 'RECEIVED', note: `Camp: ${camp.title}`, actorId: me.id });
    await notify(d.db, reg.donorId, { type: 'DONATION_COMPLETE', title: 'Thank you for donating', body: `Your donation at ${camp.title} is recorded. Certificate ${donation.certificateNo}.`, data: { donationId: donation.id } });
    await audit(d.db, me.id, 'camp.attendance', 'CampRegistration', reg.id, { certificateNo: donation.certificateNo });
    res.json({ status: 'ATTENDED', certificateNo: donation.certificateNo });
  });

  /* ------------------------------------------------------- donor: register */
  r.post('/:id/register', ...authed, requireRole('DONOR'), async (req, res) => {
    const me = currentUser(req);
    await sweepCamps(d);
    const camp = await d.db.camp.findUnique({ where: { id: String(req.params.id) }, include: { hospital: true } });
    if (!camp || camp.hospital.status !== 'VERIFIED') throw ApiError.notFound('Camp not found.');
    if (camp.status !== 'SCHEDULED' || camp.endsAt.getTime() < Date.now()) throw ApiError.conflict('Registration for this camp is closed.');

    const profile = await d.db.donorProfile.findUnique({ where: { userId: me.id } });
    if (!profile) throw ApiError.badRequest('Complete your donor profile first.');
    const health = healthSchema.safeParse(profile.health);
    const eligibility = evaluateEligibility(
      { dateOfBirth: profile.dateOfBirth, gender: profile.gender, weightKg: profile.weightKg, lastDonationAt: profile.lastDonationAt, health: health.success ? health.data : healthSchema.parse({}) },
      camp.startsAt, // eligibility on the day of the camp, not today
    );
    if (!health.success || !eligibility.eligible) throw new ApiError(409, 'not_eligible', eligibility.reasons[0] ?? 'You will not be eligible to donate on that date.');

    const existing = await d.db.campRegistration.findUnique({ where: { campId_donorId: { campId: camp.id, donorId: me.id } } });
    if (existing && existing.status !== 'CANCELLED') throw ApiError.conflict('You are already registered for this camp.', 'already_registered');

    const out = await d.db.$transaction(async (tx) => {
      const taken = await tx.campRegistration.count({ where: { campId: camp.id, status: { in: ['REGISTERED', 'ATTENDED'] } } });
      if (taken >= camp.capacity) throw ApiError.conflict('This camp is full.', 'camp_full');
      return existing
        ? tx.campRegistration.update({ where: { id: existing.id }, data: { status: 'REGISTERED' } })
        : tx.campRegistration.create({ data: { campId: camp.id, donorId: me.id } });
    });
    res.status(201).json({ registration: { id: out.id, status: out.status } });
  });

  r.delete('/:id/register', ...authed, requireRole('DONOR'), async (req, res) => {
    const me = currentUser(req);
    const reg = await d.db.campRegistration.findUnique({ where: { campId_donorId: { campId: String(req.params.id), donorId: me.id } } });
    if (!reg || reg.status !== 'REGISTERED') throw ApiError.notFound('You are not registered for this camp.');
    await d.db.campRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED' } });
    res.json({ ok: true });
  });

  return r;
}
