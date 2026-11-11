import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { forbidden } from '../lib/errors.js';
import { requireUser } from '../middleware/auth.js';
import { ageFromDob, nextEligibleDate } from '../utils/eligibility.js';
import { phoneSchema } from './onboarding.js';

export const meRouter = Router();
meRouter.use(requireUser);

/** GET /api/me: the signed-in user with whichever profile their role has. */
meRouter.get('/', async (req, res) => {
  const u = req.dbUser!;
  const [donor, requester, staff] = await Promise.all([
    prisma.donorProfile.findUnique({ where: { userId: u.id } }),
    prisma.requesterProfile.findUnique({ where: { userId: u.id } }),
    prisma.hospitalStaff.findUnique({ where: { userId: u.id }, include: { hospital: true } }),
  ]);

  const unread = await prisma.notification.count({ where: { userId: u.id, readAt: null } });

  const donorExtra = donor
    ? (() => {
        const next = nextEligibleDate(donor.lastDonationAt, donor.gender);
        return {
          age: ageFromDob(donor.dateOfBirth),
          nextEligibleDate: next,
          eligibleNow: !next || next.getTime() <= Date.now(),
        };
      })()
    : null;

  res.json({
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      imageUrl: u.imageUrl,
      phone: u.phone,
      role: u.role,
      onboarded: u.onboarded,
      language: u.language,
      notifyEmail: u.notifyEmail,
      notifySms: u.notifySms,
      notifyCommunity: u.notifyCommunity,
      createdAt: u.createdAt,
    },
    donor: donor ? { ...donor, ...donorExtra } : null,
    requester,
    hospitalStaff: staff
      ? {
          id: staff.id,
          designation: staff.designation,
          licenseNumber: staff.licenseNumber,
          status: staff.status,
          reviewNote: staff.reviewNote,
          hospital: staff.hospital,
        }
      : null,
    unreadNotifications: unread,
  });
});

const accountBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phoneSchema.optional(),
});

meRouter.patch('/account', async (req, res) => {
  const data = accountBody.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.dbUser!.id }, data });
  res.json({ name: user.name, phone: user.phone });
});

const settingsBody = z.object({
  notifyEmail: z.boolean().optional(),
  notifySms: z.boolean().optional(),
  notifyCommunity: z.boolean().optional(),
  language: z.enum(['en', 'hi', 'pa']).optional(),
});

meRouter.patch('/settings', async (req, res) => {
  const data = settingsBody.parse(req.body);
  const user = await prisma.user.update({ where: { id: req.dbUser!.id }, data });
  res.json({
    notifyEmail: user.notifyEmail,
    notifySms: user.notifySms,
    notifyCommunity: user.notifyCommunity,
    language: user.language,
  });
});

const donorBody = z.object({
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  weightKg: z.number().min(30).max(250).optional(),
  isAvailable: z.boolean().optional(),
});

meRouter.patch('/donor', async (req, res) => {
  if (req.dbUser!.role !== 'DONOR') throw forbidden();
  const data = donorBody.parse(req.body);
  const donor = await prisma.donorProfile.update({ where: { userId: req.dbUser!.id }, data });
  res.json(donor);
});

const requesterBody = z.object({
  city: z.string().trim().min(2).max(80).optional(),
  state: z.string().trim().min(2).max(80).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

meRouter.patch('/requester', async (req, res) => {
  if (req.dbUser!.role !== 'REQUESTER') throw forbidden();
  const data = requesterBody.parse(req.body);
  const profile = await prisma.requesterProfile.update({ where: { userId: req.dbUser!.id }, data });
  res.json(profile);
});
