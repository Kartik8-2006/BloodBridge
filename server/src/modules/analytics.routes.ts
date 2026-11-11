import { Router } from 'express';
import { currentUser, requireRole } from '../middleware/auth.js';
import type { Deps } from '../deps.js';
import { requirePro } from '../services/billing.js';
import { FORECAST_WEEKS, WEEK_MS, forecastFor } from '../services/forecast.js';
import { BLOOD_GROUPS } from './schemas.js';
import { verifiedHospitalOf } from './staff.js';

const DAY = 86_400_000;
const MONTHS = 6;

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function lastMonths(now: Date) {
  return Array.from({ length: MONTHS }, (_, i) => {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1 - i), 1));
    return monthKey(m);
  });
}

function lastWeeks(now: Date) {
  const start = weekStart(now).getTime();
  return Array.from({ length: FORECAST_WEEKS }, (_, i) => new Date(start - (FORECAST_WEEKS - 1 - i) * WEEK_MS));
}

export function analyticsRouter(d: Deps) {
  const r = Router();

  r.get('/hospital', requireRole('HOSPITAL'), async (req, res) => {
    const h = await verifiedHospitalOf(d, currentUser(req));
    await requirePro(d, h.id, 'Analytics');
    const now = new Date();
    const weeks = lastWeeks(now);
    const since = weeks[0]!;
    const monthsList = lastMonths(now);
    const monthsSince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1));

    const [requests, donations, logs, camps] = await Promise.all([
      d.db.bloodRequest.findMany({ where: { hospitalId: h.id, createdAt: { gte: since } }, select: { id: true, bloodGroup: true, unitsNeeded: true, unitsFulfilled: true, status: true, createdAt: true, donations: { select: { donatedAt: true } } } }),
      d.db.donation.findMany({ where: { hospitalId: h.id, donatedAt: { gte: monthsSince } }, select: { donatedAt: true, requestId: true } }),
      d.db.inventoryLog.findMany({ where: { hospitalId: h.id, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, select: { delta: true, reason: true } }),
      d.db.camp.findMany({ where: { hospitalId: h.id }, select: { status: true, _count: { select: { registrations: { where: { status: 'ATTENDED' } } } } } }),
    ]);

    const weekly = weeks.map((w) => {
      const inWeek = requests.filter((q) => q.createdAt >= w && q.createdAt < new Date(w.getTime() + WEEK_MS));
      return { week: w.toISOString().slice(0, 10), requests: inWeek.length, fulfilled: inWeek.filter((q) => q.status === 'FULFILLED').length };
    });

    const demandByGroup = BLOOD_GROUPS.map((bloodGroup) => ({
      bloodGroup,
      unitsRequested: requests.filter((q) => q.bloodGroup === bloodGroup).reduce((s, q) => s + q.unitsNeeded, 0),
    }));

    const closed = requests.filter((q) => q.status === 'FULFILLED' || q.status === 'EXPIRED');
    const fulfilled = requests.filter((q) => q.status === 'FULFILLED');
    const hours = fulfilled
      .map((q) => {
        const last = q.donations.reduce<Date | null>((m, x) => (!m || x.donatedAt > m ? x.donatedAt : m), null);
        return last ? (last.getTime() - q.createdAt.getTime()) / 3_600_000 : null;
      })
      .filter((x): x is number => x !== null);

    const donationsByMonth = monthsList.map((m) => ({ month: m, donations: donations.filter((x) => monthKey(x.donatedAt) === m).length }));

    res.json({
      range: { weeks: FORECAST_WEEKS, months: MONTHS },
      summary: {
        requests: requests.length,
        fulfilmentRate: closed.length ? Math.round((fulfilled.length / closed.length) * 100) : null,
        avgHoursToFulfil: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
        donationsLast6Months: donations.length,
        unitsReceived30d: logs.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0),
        unitsIssued30d: Math.abs(logs.filter((l) => l.reason === 'ISSUED').reduce((s, l) => s + l.delta, 0)),
        campsHeld: camps.filter((c) => c.status === 'COMPLETED').length,
        campDonors: camps.reduce((s, c) => s + c._count.registrations, 0),
      },
      weekly,
      demandByGroup,
      donationsByMonth,
    });
  });

  r.get('/forecast', requireRole('HOSPITAL'), async (req, res) => {
    const h = await verifiedHospitalOf(d, currentUser(req));
    await requirePro(d, h.id, 'The stock forecast');
    res.json({ generatedAt: new Date(), groups: await forecastFor(d.db, h) });
  });

  r.get('/admin', requireRole('ADMIN'), async (_req, res) => {
    const now = new Date();
    const weeks = lastWeeks(now);
    const since = weeks[0]!;
    const [requests, donations, byStatus, hospitalsByCity, users] = await Promise.all([
      d.db.bloodRequest.findMany({ where: { createdAt: { gte: since } }, select: { bloodGroup: true, status: true, urgency: true, createdAt: true } }),
      d.db.donation.count(),
      d.db.bloodRequest.groupBy({ by: ['status'], _count: true }),
      d.db.hospital.groupBy({ by: ['city'], where: { status: 'VERIFIED' }, _count: true, orderBy: { _count: { city: 'desc' } }, take: 8 }),
      d.db.user.groupBy({ by: ['role'], _count: true }),
    ]);
    res.json({
      weekly: weeks.map((w) => ({ week: w.toISOString().slice(0, 10), requests: requests.filter((q) => q.createdAt >= w && q.createdAt < new Date(w.getTime() + WEEK_MS)).length })),
      demandByGroup: BLOOD_GROUPS.map((bloodGroup) => ({ bloodGroup, requests: requests.filter((q) => q.bloodGroup === bloodGroup).length })),
      urgency: (['CRITICAL', 'URGENT', 'PLANNED'] as const).map((u) => ({ urgency: u, requests: requests.filter((q) => q.urgency === u).length })),
      requestsByStatus: byStatus.map((x) => ({ status: x.status, count: x._count })),
      verifiedHospitalsByCity: hospitalsByCity.filter((x) => x.city).map((x) => ({ city: x.city as string, count: x._count })),
      usersByRole: users.filter((x) => x.role).map((x) => ({ role: x.role as string, count: x._count })),
      totalDonations: donations,
    });
  });

  return r;
}
