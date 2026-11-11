import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { audit, notify } from '../services/platform.service.js';

export const adminRouter = Router();
adminRouter.use(requireRole('ADMIN'));

/** GET /api/admin/verifications?status=PENDING: hospital claims waiting for a decision. */
adminRouter.get('/verifications', async (req, res) => {
  const { status } = z
    .object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).default('PENDING') })
    .parse(req.query);

  const items = await prisma.hospitalStaff.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      hospital: {
        select: {
          id: true, name: true, address: true, city: true, state: true, pincode: true,
          phone: true, website: true, source: true, hasBloodBank: true, latitude: true, longitude: true,
        },
      },
    },
  });
  res.json({ items });
});

const decisionBody = z.object({ note: z.string().trim().max(500).optional() });

adminRouter.post('/verifications/:id/approve', async (req, res) => {
  const admin = req.dbUser!;
  const staff = await prisma.hospitalStaff.findUnique({ where: { id: String(req.params.id) } });
  if (!staff) throw notFound('Verification request not found');
  if (staff.status !== 'PENDING') throw conflict('This request has already been reviewed.');
  const { note } = decisionBody.parse(req.body ?? {});

  await prisma.$transaction(async (tx) => {
    await tx.hospitalStaff.update({
      where: { id: staff.id },
      data: { status: 'VERIFIED', reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note ?? null },
    });
    await tx.hospital.update({ where: { id: staff.hospitalId }, data: { status: 'VERIFIED' } });
    await tx.subscription.upsert({
      where: { hospitalId: staff.hospitalId },
      update: {},
      create: { hospitalId: staff.hospitalId, plan: 'FREE' },
    });
    await notify(staff.userId, {
      type: 'HOSPITAL_VERIFICATION',
      title: 'Your hospital is verified',
      body: 'You can now manage blood inventory and respond to requests.',
      link: '/hospital/dashboard',
    }, tx);
    await audit(admin.id, 'hospital.verified', 'Hospital', staff.hospitalId, { staffId: staff.id }, tx);
  });
  res.json({ ok: true });
});

adminRouter.post('/verifications/:id/reject', async (req, res) => {
  const admin = req.dbUser!;
  const { note } = decisionBody.parse(req.body ?? {});
  if (!note) throw badRequest('Please give a short reason so the hospital can fix it.');

  const staff = await prisma.hospitalStaff.findUnique({
    where: { id: String(req.params.id) },
    include: { hospital: { select: { source: true } } },
  });
  if (!staff) throw notFound('Verification request not found');
  if (staff.status !== 'PENDING') throw conflict('This request has already been reviewed.');

  await prisma.$transaction(async (tx) => {
    await tx.hospitalStaff.update({
      where: { id: staff.id },
      data: { status: 'REJECTED', reviewedById: admin.id, reviewedAt: new Date(), reviewNote: note },
    });
    // Imported public listings go back to the pool so the real owner can claim them later.
    await tx.hospital.update({
      where: { id: staff.hospitalId },
      data: { status: staff.hospital.source === 'osm' ? 'UNCLAIMED' : 'REJECTED' },
    });
    await notify(staff.userId, {
      type: 'HOSPITAL_VERIFICATION',
      title: 'Verification needs changes',
      body: note,
      link: '/hospital/dashboard',
    }, tx);
    await audit(admin.id, 'hospital.rejected', 'Hospital', staff.hospitalId, { staffId: staff.id, note }, tx);
  });
  res.json({ ok: true });
});

/** GET /api/admin/users */
adminRouter.get('/users', async (req, res) => {
  const f = z
    .object({
      q: z.string().trim().max(100).optional(),
      role: z.enum(['DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);

  const where: Prisma.UserWhereInput = {
    ...(f.role ? { role: f.role } : {}),
    ...(f.q
      ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q, mode: 'insensitive' } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (f.page - 1) * f.limit,
      take: f.limit,
      select: { id: true, name: true, email: true, phone: true, role: true, onboarded: true, isSuspended: true, createdAt: true, lastSeenAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  res.json({ items, total, page: f.page, limit: f.limit });
});

adminRouter.post('/users/:id/suspend', async (req, res) => {
  const admin = req.dbUser!;
  const { suspended } = z.object({ suspended: z.boolean() }).parse(req.body);
  const target = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!target) throw notFound('User not found');
  if (target.id === admin.id || target.role === 'ADMIN') throw badRequest('Admin accounts cannot be suspended here.');

  await prisma.user.update({ where: { id: target.id }, data: { isSuspended: suspended } });
  await audit(admin.id, suspended ? 'user.suspended' : 'user.reinstated', 'User', target.id);
  res.json({ ok: true });
});
