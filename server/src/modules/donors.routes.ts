import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { parse } from '../lib/validate.js';
import { ApiError } from '../lib/errors.js';
import type { Deps } from '../deps.js';
import { serializeDonor } from './presenters.js';
import { donorFields } from './schemas.js';
import { ensureAreaSynced } from '../services/osm-sync.js';
import { logger } from '../lib/logger.js';

export function donorsRouter(d: Deps) {
  const r = Router();
  r.use(requireRole('DONOR'));

  r.get('/me', async (req, res) => {
    const profile = await d.db.donorProfile.findUnique({ where: { userId: currentUser(req).id } });
    if (!profile) throw ApiError.notFound('Donor profile not found.');
    res.json(serializeDonor(profile));
  });

  r.put('/me', async (req, res) => {
    const me = currentUser(req);
    const body = parse(donorFields, req.body);
    const profile = await d.db.donorProfile.update({
      where: { userId: me.id },
      data: {
        bloodGroup: body.bloodGroup,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        weightKg: body.weightKg,
        city: body.city,
        addressLine: body.addressLine ?? null,
        lat: body.lat,
        lng: body.lng,
        lastDonationAt: body.lastDonationAt ?? null,
        health: body.health,
      },
    });
    await d.db.user.update({ where: { id: me.id }, data: { city: body.city } });
    ensureAreaSynced(d.db, d.overpass, body.lat, body.lng).catch((err) => logger.warn({ err }, 'OSM warm-up failed'));
    res.json(serializeDonor(profile));
  });

  r.patch('/me/availability', async (req, res) => {
    const { available } = parse(z.object({ available: z.boolean() }), req.body);
    const profile = await d.db.donorProfile.update({ where: { userId: currentUser(req).id }, data: { available } });
    res.json(serializeDonor(profile));
  });

  return r;
}
