import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../lib/validate.js';
import { ApiError } from '../lib/errors.js';
import type { Deps } from '../deps.js';

export function publicRouter(d: Deps) {
  const r = Router();

  r.get('/health', async (_req, res) => {
    await d.db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  /** Real counts for the landing page. */
  r.get('/public/stats', async (_req, res) => {
    const [donors, verified, listed, cities, donations] = await Promise.all([
      d.db.donorProfile.count(),
      d.db.hospital.count({ where: { status: 'VERIFIED' } }),
      d.db.hospital.count({ where: { OR: [{ source: 'OSM' }, { status: 'VERIFIED' }] } }),
      d.db.donorProfile.groupBy({ by: ['city'] }).then((rows) => rows.length),
      d.db.donation.count(),
    ]);
    res.json({ donors, verifiedHospitals: verified, listedFacilities: listed, cities, donations });
  });

  /** Latest verified facilities, shown on the home page. Only public fields. */
  r.get('/public/network', async (_req, res) => {
    const rows = await d.db.hospital.findMany({
      where: { status: 'VERIFIED' },
      orderBy: { verifiedAt: 'desc' },
      take: 4,
      select: { id: true, name: true, city: true, state: true, type: true, hasEmergency: true, verifiedAt: true },
    });
    res.json({ items: rows });
  });

  const subscribeSchema = z.object({
    email: z.string().trim().max(160).toLowerCase().pipe(z.email('Enter a valid email address')),
    name: z.string().trim().max(80).optional(),
    city: z.string().trim().max(80).optional(),
  });
  r.post('/public/subscribe', async (req, res) => {
    const body = parse(subscribeSchema, req.body);
    // Upsert keeps this idempotent and avoids revealing whether an address was already subscribed.
    await d.db.subscriber.upsert({ where: { email: body.email }, create: body, update: {} });
    res.status(201).json({ ok: true });
  });

  /** Anyone holding a certificate can check it is genuine. Only a first name and surname initial are revealed. */
  r.get('/public/certificates/:no', async (req, res) => {
    const no = String(req.params.no).trim().toUpperCase();
    if (!/^BB-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(no)) throw ApiError.notFound('No certificate with that number.');
    const x = await d.db.donation.findUnique({ where: { certificateNo: no }, include: { donor: { select: { name: true } }, hospital: { select: { name: true, city: true } } } });
    if (!x) throw ApiError.notFound('No certificate with that number.');
    const parts = x.donor.name.trim().split(/\s+/);
    const donor = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : parts[0];
    res.json({ valid: true, certificateNo: x.certificateNo, donor, bloodGroup: x.bloodGroup, units: x.units, donatedAt: x.donatedAt, hospital: x.hospital.name, city: x.hospital.city });
  });

  return r;
}
