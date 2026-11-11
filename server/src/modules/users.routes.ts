import { Router } from 'express';
import { currentUser } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { serializeDonor, serializeUser } from './presenters.js';
import { DEFAULT_PREFS, onboardSchema, profilePatchSchema } from './schemas.js';
import { notify } from '../services/notify.js';
import { ensureAreaSynced } from '../services/osm-sync.js';
import { logger } from '../lib/logger.js';

export function usersRouter(d: Deps) {
  const r = Router();

  r.get('/me', async (req, res) => {
    const me = currentUser(req);
    const [full, unread] = await Promise.all([
      d.db.user.findUniqueOrThrow({
        where: { id: me.id },
        include: { donorProfile: true, hospital: { select: { id: true, name: true, status: true, type: true } } },
      }),
      d.db.notification.count({ where: { userId: me.id, readAt: null } }),
    ]);
    res.json({
      user: serializeUser(full),
      ...(full.donorProfile ? serializeDonor(full.donorProfile) : {}),
      hospital: full.hospital,
      unreadNotifications: unread,
    });
  });

  r.post('/onboard', async (req, res) => {
    const me = currentUser(req);
    if (me.onboardedAt) throw ApiError.conflict('Your account is already set up.', 'already_onboarded');
    const body = parse(onboardSchema, req.body);

    await d.db.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: me.id, onboardedAt: null },
        data: {
          role: body.role,
          name: body.name ?? me.name,
          phone: body.phone,
          city: 'city' in body ? body.city : undefined,
          lat: body.role === 'REQUESTER' ? body.lat : undefined,
          lng: body.role === 'REQUESTER' ? body.lng : undefined,
          onboardedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw ApiError.conflict('Your account is already set up.', 'already_onboarded');
      if (body.role === 'DONOR') {
        await tx.donorProfile.create({
          data: {
            userId: me.id,
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
      }
    });

    const welcome = {
      DONOR: 'You are on the donor network. Keep your availability on so hospitals can reach you when it matters.',
      REQUESTER: 'Your account is ready. Find verified hospitals and blood banks near you.',
      HOSPITAL: 'Next step: find your hospital and submit its license for verification.',
    }[body.role];
    await notify(d.db, me.id, { type: 'WELCOME', title: 'Welcome to BloodBridge', body: welcome });

    // Warm the hospital directory around the new user. Failures are fine: the directory retries on demand.
    if (body.role === 'DONOR' || body.role === 'REQUESTER') {
      ensureAreaSynced(d.db, d.overpass, body.lat, body.lng).catch((err) => logger.warn({ err }, 'OSM warm-up failed'));
    }

    const fresh = await d.db.user.findUniqueOrThrow({ where: { id: me.id } });
    res.status(201).json({ user: serializeUser(fresh) });
  });

  r.patch('/me', async (req, res) => {
    const me = currentUser(req);
    const { prefs, ...rest } = parse(profilePatchSchema, req.body);
    const merged = prefs ? { ...DEFAULT_PREFS, ...((me.prefs as object | null) ?? {}), ...prefs } : undefined;
    const updated = await d.db.user.update({ where: { id: me.id }, data: { ...rest, ...(merged ? { prefs: merged } : {}) } });
    res.json({ user: serializeUser(updated) });
  });

  return r;
}
