import { Router } from 'express';
import type { BloodGroup } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { forbidden } from '../lib/errors.js';
import { requireUser } from '../middleware/auth.js';
import { BLOOD_GROUPS, canDonateTo } from '../utils/blood.js';
import { nextEligibleDate } from '../utils/eligibility.js';
import { lastSevenDays, lastSixMonths, sixMonthsAgo } from '../utils/series.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireUser);

const LOW_STOCK_THRESHOLD = 5;

type Stat = { key: string; label: string; value: number; hint?: string; tone?: 'neutral' | 'good' | 'warn' };
type Recent = { id: string; title: string; subtitle: string; status?: string; at: Date; kind: string };

/**
 * GET /api/dashboard: one endpoint, shaped per role. Every number is computed from the database;
 * a brand-new account simply shows zeros and empty lists.
 */
dashboardRouter.get('/', async (req, res) => {
  const user = req.dbUser!;
  if (!user.onboarded || !user.role) throw forbidden('Please finish onboarding first.');
  const since = sixMonthsAgo();

  switch (user.role) {
    case 'DONOR': {
      const donor = await prisma.donorProfile.findUniqueOrThrow({ where: { userId: user.id } });
      const [donations, notes, nearbyOpen, pendingResponses] = await Promise.all([
        prisma.donation.findMany({
          where: { donorId: user.id, status: 'COMPLETED', donatedAt: { gte: since } },
          select: { donatedAt: true },
        }),
        prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.bloodRequest.count({
          where: {
            status: 'OPEN',
            state: { equals: donor.state, mode: 'insensitive' },
            bloodGroup: { in: canDonateTo(donor.bloodGroup) },
            neededBy: { gt: new Date() },
            requesterId: { not: user.id },
          },
        }),
        prisma.donorResponse.count({ where: { donorId: user.id, status: 'NOTIFIED' } }),
      ]);

      const dates = donations.flatMap((d) => (d.donatedAt ? [d.donatedAt] : []));
      const next = nextEligibleDate(donor.lastDonationAt, donor.gender);
      const stats: Stat[] = [
        { key: 'donations', label: 'Total donations', value: donor.totalDonations, hint: `${donor.points} reward points` },
        { key: 'lives', label: 'Lives impacted', value: donor.totalDonations * 3, hint: 'One donation can help up to 3 patients' },
        { key: 'nearby', label: 'Open requests for you', value: nearbyOpen, hint: `${pendingResponses} awaiting your reply`, tone: nearbyOpen ? 'warn' : 'neutral' },
      ];
      const recent: Recent[] = notes.map((n) => ({
        id: n.id,
        title: n.title,
        subtitle: n.body,
        status: n.readAt ? undefined : 'NEW',
        at: n.createdAt,
        kind: n.type,
      }));

      res.json({
        role: user.role,
        stats,
        series: { title: 'Your donations', weekly: lastSevenDays(dates), monthly: lastSixMonths(dates) },
        recent,
        extras: {
          bloodGroup: donor.bloodGroup,
          isAvailable: donor.isAvailable,
          eligibleNow: !next || next.getTime() <= Date.now(),
          nextEligibleDate: next,
          lastDonationAt: donor.lastDonationAt,
        },
      });
      return;
    }

    case 'REQUESTER': {
      const [requests, all] = await Promise.all([
        prisma.bloodRequest.findMany({
          where: { requesterId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, code: true, bloodGroup: true, unitsNeeded: true, status: true, createdAt: true, patientName: true },
        }),
        prisma.bloodRequest.findMany({
          where: { requesterId: user.id },
          select: { status: true, unitsFulfilled: true, createdAt: true },
        }),
      ]);
      const active = all.filter((r) => ['PENDING_REVIEW', 'OPEN', 'MATCHED'].includes(r.status)).length;
      const unitsReceived = all.reduce((sum, r) => sum + r.unitsFulfilled, 0);
      const dates = all.filter((r) => r.createdAt >= since).map((r) => r.createdAt);

      res.json({
        role: user.role,
        stats: [
          { key: 'total', label: 'Requests raised', value: all.length },
          { key: 'active', label: 'Active requests', value: active, tone: active ? 'warn' : 'neutral' },
          { key: 'units', label: 'Units received', value: unitsReceived, tone: 'good' },
        ] satisfies Stat[],
        series: { title: 'Your requests', weekly: lastSevenDays(dates), monthly: lastSixMonths(dates) },
        recent: requests.map<Recent>((r) => ({
          id: r.id,
          title: `${r.code} · ${r.unitsNeeded} unit(s) for ${r.patientName}`,
          subtitle: `Blood group ${r.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}`,
          status: r.status,
          at: r.createdAt,
          kind: 'request',
        })),
        extras: {},
      });
      return;
    }

    case 'HOSPITAL': {
      const staff = await prisma.hospitalStaff.findUniqueOrThrow({
        where: { userId: user.id },
        include: { hospital: true },
      });
      const hospitalId = staff.hospitalId;
      const verified = staff.status === 'VERIFIED';

      const [inventory, openRequests, donationsDone, completed, recentRequests] = await Promise.all([
        prisma.bloodInventory.findMany({ where: { hospitalId } }),
        prisma.bloodRequest.count({ where: { hospitalId, status: { in: ['OPEN', 'MATCHED'] } } }),
        prisma.donation.count({ where: { hospitalId, status: 'COMPLETED' } }),
        prisma.donation.findMany({
          where: { hospitalId, status: 'COMPLETED', donatedAt: { gte: since } },
          select: { donatedAt: true },
        }),
        prisma.bloodRequest.findMany({
          where: { hospitalId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, code: true, bloodGroup: true, unitsNeeded: true, status: true, createdAt: true, urgency: true },
        }),
      ]);

      const byGroup = new Map<BloodGroup, number>(inventory.map((i) => [i.bloodGroup, i.unitsTotal - i.unitsReserved]));
      const stock = BLOOD_GROUPS.map((g) => ({ bloodGroup: g, units: byGroup.get(g) ?? 0 }));
      const dates = completed.flatMap((d) => (d.donatedAt ? [d.donatedAt] : []));

      res.json({
        role: user.role,
        stats: [
          { key: 'stock', label: 'Units in stock', value: stock.reduce((s, x) => s + x.units, 0) },
          { key: 'open', label: 'Open requests', value: openRequests, tone: openRequests ? 'warn' : 'neutral' },
          { key: 'donations', label: 'Donations received', value: donationsDone, tone: 'good' },
        ] satisfies Stat[],
        series: { title: 'Donations received', weekly: lastSevenDays(dates), monthly: lastSixMonths(dates) },
        recent: recentRequests.map<Recent>((r) => ({
          id: r.id,
          title: `${r.code} · ${r.unitsNeeded} unit(s) · ${r.urgency}`,
          subtitle: `Blood group ${r.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}`,
          status: r.status,
          at: r.createdAt,
          kind: 'request',
        })),
        extras: {
          verification: { status: staff.status, note: staff.reviewNote },
          hospital: { id: staff.hospital.id, name: staff.hospital.name, city: staff.hospital.city, state: staff.hospital.state },
          stock,
          lowStock: verified ? stock.filter((s) => s.units < LOW_STOCK_THRESHOLD).map((s) => s.bloodGroup) : [],
          lowStockThreshold: LOW_STOCK_THRESHOLD,
        },
      });
      return;
    }

    case 'ADMIN': {
      const [totalUsers, byRole, pendingClaims, openRequests, hospitalCounts, newUsers, logs] = await Promise.all([
        prisma.user.count(),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        prisma.hospitalStaff.count({ where: { status: 'PENDING' } }),
        prisma.bloodRequest.count({ where: { status: { in: ['OPEN', 'MATCHED', 'PENDING_REVIEW'] } } }),
        prisma.hospital.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
        prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { name: true } } } }),
      ]);
      const dates = newUsers.map((u) => u.createdAt);
      const hc = Object.fromEntries(hospitalCounts.map((h) => [h.status, h._count._all]));

      res.json({
        role: user.role,
        stats: [
          { key: 'users', label: 'Total users', value: totalUsers },
          { key: 'claims', label: 'Pending verifications', value: pendingClaims, tone: pendingClaims ? 'warn' : 'neutral' },
          { key: 'requests', label: 'Live requests', value: openRequests },
        ] satisfies Stat[],
        series: { title: 'New sign-ups', weekly: lastSevenDays(dates), monthly: lastSixMonths(dates) },
        recent: logs.map<Recent>((l) => ({
          id: l.id,
          title: l.action,
          subtitle: `${l.actor?.name ?? 'System'} · ${l.entity}`,
          at: l.createdAt,
          kind: 'audit',
        })),
        extras: {
          usersByRole: Object.fromEntries(byRole.map((r) => [r.role ?? 'UNASSIGNED', r._count._all])),
          hospitals: {
            total: Object.values(hc).reduce((a, b) => a + b, 0),
            verified: hc.VERIFIED ?? 0,
            pending: hc.PENDING ?? 0,
            unclaimed: hc.UNCLAIMED ?? 0,
          },
        },
      });
      return;
    }
  }
});
