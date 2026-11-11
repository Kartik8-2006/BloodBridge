import { runJobs } from '../services/jobs.js';
import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import type { HospitalStatus, Prisma } from '../generated/prisma/client.js';
import { serializeOwnHospital } from './presenters.js';
import { latSchema, lngSchema, pageSchema } from './schemas.js';
import { audit, notifyMany } from '../services/notify.js';
import { ensureAreaSynced } from '../services/osm-sync.js';

const HOSPITAL_STATUSES = ['UNCLAIMED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const;

const reviewSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REINSTATE']), note: z.string().trim().max(500).optional() })
  .refine((v) => v.decision === 'APPROVE' || v.decision === 'REINSTATE' || (v.note && v.note.length >= 10), {
    path: ['note'],
    message: 'Explain the reason in at least 10 characters so the hospital knows what to fix',
  });

/** Allowed review transitions: from status → decision → new status. */
const TRANSITIONS: Record<string, Partial<Record<string, HospitalStatus>>> = {
  PENDING: { APPROVE: 'VERIFIED', REJECT: 'REJECTED' },
  VERIFIED: { SUSPEND: 'SUSPENDED' },
  SUSPENDED: { REINSTATE: 'VERIFIED' },
};

export function adminRouter(d: Deps) {
  const r = Router();
  r.use(requireRole('ADMIN'));

  r.get('/overview', async (_req, res) => {
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCMonth(since.getUTCMonth() - 5);
    since.setUTCHours(0, 0, 0, 0);

    const [roles, hospitalStatus, donorsAvailable, osmAreas, pending, recent, signupRows, requestStatus, donationCount, fraudOpen] = await Promise.all([
      d.db.user.groupBy({ by: ['role'], _count: { _all: true } }),
      d.db.hospital.groupBy({ by: ['status'], _count: { _all: true } }),
      d.db.donorProfile.count({ where: { available: true } }),
      d.db.osmSyncArea.aggregate({ _count: { _all: true }, _sum: { hospitalsFound: true } }),
      d.db.hospital.findMany({
        where: { status: 'PENDING' },
        orderBy: { submittedAt: 'asc' },
        take: 5,
        select: { id: true, name: true, city: true, type: true, submittedAt: true, licenseNumber: true },
      }),
      d.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { actor: { select: { name: true } } } }),
      d.db.$queryRaw<{ month: string; role: string | null; count: bigint }[]>`
        SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month, "role"::text AS role, COUNT(*)::bigint AS count
        FROM "User" WHERE "createdAt" >= ${since} GROUP BY 1, 2 ORDER BY 1`,
      d.db.bloodRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      d.db.donation.count(),
      d.db.fraudFlag.count({ where: { status: 'OPEN' } }),
    ]);

    const months: string[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + i, 1));
      months.push(`${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    const signups = months.map((month) => {
      const row = { month, DONOR: 0, REQUESTER: 0, HOSPITAL: 0 };
      for (const s of signupRows) {
        if (s.month === month && (s.role === 'DONOR' || s.role === 'REQUESTER' || s.role === 'HOSPITAL')) row[s.role] = Number(s.count);
      }
      return row;
    });

    const count = (rows: { _count: { _all: number } }[], pick: (i: number) => boolean) => rows.reduce((n, row, i) => (pick(i) ? n + row._count._all : n), 0);
    const byRole = Object.fromEntries(roles.map((x) => [x.role ?? 'UNONBOARDED', x._count._all]));
    const byStatus = Object.fromEntries(hospitalStatus.map((x) => [x.status, x._count._all]));
    void count;

    res.json({
      users: {
        total: roles.reduce((n, x) => n + x._count._all, 0),
        donors: byRole.DONOR ?? 0,
        requesters: byRole.REQUESTER ?? 0,
        hospitalStaff: byRole.HOSPITAL ?? 0,
        admins: byRole.ADMIN ?? 0,
        notOnboarded: byRole.UNONBOARDED ?? 0,
        donorsAvailable,
      },
      hospitals: {
        verified: byStatus.VERIFIED ?? 0,
        pending: byStatus.PENDING ?? 0,
        rejected: byStatus.REJECTED ?? 0,
        suspended: byStatus.SUSPENDED ?? 0,
        unclaimed: byStatus.UNCLAIMED ?? 0,
        total: hospitalStatus.reduce((n, x) => n + x._count._all, 0),
      },
      requests: {
        open: requestStatus.find((x) => x.status === 'OPEN')?._count._all ?? 0,
        fulfilled: requestStatus.find((x) => x.status === 'FULFILLED')?._count._all ?? 0,
        total: requestStatus.reduce((n, x) => n + x._count._all, 0),
        donations: donationCount,
      },
      fraudOpen,
      osm: { areasSynced: osmAreas._count._all, facilitiesSeen: osmAreas._sum.hospitalsFound ?? 0 },
      signups,
      pendingQueue: pending,
      recentActivity: recent.map((a) => ({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, actor: a.actor?.name ?? 'System', createdAt: a.createdAt, meta: a.meta })),
    });
  });

  r.get('/hospitals', async (req, res) => {
    const { page, pageSize } = parse(pageSchema, req.query);
    const { status, q } = parse(
      z.object({ status: z.enum(HOSPITAL_STATUSES).optional(), q: z.string().trim().max(80).optional() }),
      req.query,
    );
    const where: Prisma.HospitalWhereInput = {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { city: { contains: q, mode: 'insensitive' } }, { licenseNumber: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      d.db.hospital.count({ where }),
      d.db.hospital.findMany({
        where,
        orderBy: [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { claimedBy: { select: { name: true, email: true, phone: true } }, _count: { select: { staff: true } } },
      }),
    ]);
    res.json({
      total,
      page,
      pageSize,
      items: rows.map((h) => ({ ...serializeOwnHospital(h), source: h.source, claimedBy: h.claimedBy })),
    });
  });

  r.get('/hospitals/:id', async (req, res) => {
    const h = await d.db.hospital.findUnique({
      where: { id: String(req.params.id) },
      include: { claimedBy: { select: { name: true, email: true, phone: true } }, reviewedBy: { select: { name: true } }, _count: { select: { staff: true } } },
    });
    if (!h) throw ApiError.notFound('Hospital not found.');
    const documentUrl = h.licenseDocPath ? await d.storage.signedUrl(h.licenseDocPath, 600).catch(() => null) : null;
    res.json({ hospital: { ...serializeOwnHospital(h), claimedBy: h.claimedBy, reviewedBy: h.reviewedBy?.name ?? null }, documentUrl });
  });

  r.post('/hospitals/:id/review', async (req, res) => {
    const admin = currentUser(req);
    const { decision, note } = parse(reviewSchema, req.body);
    const hospital = await d.db.hospital.findUnique({ where: { id: String(req.params.id) }, include: { staff: { select: { id: true } } } });
    if (!hospital) throw ApiError.notFound('Hospital not found.');
    const next = TRANSITIONS[hospital.status]?.[decision];
    if (!next) throw ApiError.conflict(`A ${hospital.status.toLowerCase()} hospital cannot be ${decision.toLowerCase()}d.`, 'invalid_transition');

    const result = await d.db.hospital.updateMany({
      where: { id: hospital.id, status: hospital.status },
      data: {
        status: next,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        reviewNote: note ?? null,
        verifiedAt: next === 'VERIFIED' ? new Date() : undefined,
      },
    });
    if (result.count === 0) throw ApiError.conflict('Someone else already reviewed this hospital. Refresh to see the latest status.', 'stale_review');

    const messages = {
      VERIFIED: { type: 'HOSPITAL_APPROVED', title: 'Hospital verified', body: `${hospital.name} is verified. You can now use the full hospital workspace.` },
      REJECTED: { type: 'HOSPITAL_REJECTED', title: 'Submission needs changes', body: `${hospital.name} was not approved: ${note}` },
      SUSPENDED: { type: 'HOSPITAL_SUSPENDED', title: 'Hospital suspended', body: `${hospital.name} was suspended: ${note}` },
    } as const;
    const msg = messages[next as keyof typeof messages];
    await Promise.all([
      notifyMany(d.db, hospital.staff.map((s) => s.id), msg),
      audit(d.db, admin.id, `hospital.${decision.toLowerCase()}`, 'Hospital', hospital.id, { from: hospital.status, to: next, note: note ?? null }),
    ]);
    const updated = await d.db.hospital.findUniqueOrThrow({ where: { id: hospital.id }, include: { _count: { select: { staff: true } } } });
    res.json({ hospital: serializeOwnHospital(updated) });
  });

  r.get('/users', async (req, res) => {
    const { page, pageSize } = parse(pageSchema, req.query);
    const { role, status, q } = parse(
      z.object({
        role: z.enum(['DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN']).optional(),
        status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
        q: z.string().trim().max(80).optional(),
      }),
      req.query,
    );
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      d.db.user.count({ where }),
      d.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { donorProfile: { select: { bloodGroup: true, city: true } }, hospital: { select: { name: true } } },
      }),
    ]);
    res.json({
      total,
      page,
      pageSize,
      items: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        city: u.city,
        bloodGroup: u.donorProfile?.bloodGroup ?? null,
        hospitalName: u.hospital?.name ?? null,
        createdAt: u.createdAt,
      })),
    });
  });

  r.post('/users/:id/status', async (req, res) => {
    const admin = currentUser(req);
    const { status, reason } = parse(
      z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: z.string().trim().min(5, 'Give a short reason').max(300) }),
      req.body,
    );
    const target = await d.db.user.findUnique({ where: { id: String(req.params.id) } });
    if (!target) throw ApiError.notFound('User not found.');
    if (target.id === admin.id) throw ApiError.conflict('You cannot change your own status.', 'self_action');
    if (target.role === 'ADMIN') throw ApiError.forbidden('Admin accounts cannot be suspended from here.');
    const updated = await d.db.user.update({ where: { id: target.id }, data: { status } });
    await audit(d.db, admin.id, status === 'SUSPENDED' ? 'user.suspended' : 'user.reinstated', 'User', target.id, { reason });
    res.json({ id: updated.id, status: updated.status });
  });

  /* ------------------------------------------------------------ fraud review */
  /** Runs the reminder and expiry sweep now. The server also runs it every 30 minutes. */
  r.post('/jobs/run', async (_req, res) => {
    res.json(await runJobs(d.db));
  });

  r.get('/fraud', async (req, res) => {
    const status = z.enum(['OPEN', 'DISMISSED', 'CONFIRMED']).catch('OPEN').parse(req.query.status);
    const flags = await d.db.fraudFlag.findMany({ where: { status }, orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], take: 100 });
    const users = await d.db.user.findMany({ where: { id: { in: flags.map((f) => f.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true, role: true, status: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({ flags: flags.map((f) => ({ id: f.id, kind: f.kind, severity: f.severity, status: f.status, subjectType: f.subjectType, subjectId: f.subjectId, summary: f.summary, note: f.note, createdAt: f.createdAt, reviewedAt: f.reviewedAt, user: f.userId ? (byId.get(f.userId) ?? null) : null })) });
  });

  r.post('/fraud/:id/review', async (req, res) => {
    const admin = currentUser(req);
    const body = parse(z.object({ decision: z.enum(['DISMISSED', 'CONFIRMED']), note: z.string().trim().min(3, 'Add a short note').max(300), suspendUser: z.boolean().optional() }), req.body);
    const flag = await d.db.fraudFlag.findUnique({ where: { id: String(req.params.id) } });
    if (!flag) throw ApiError.notFound('Flag not found.');
    if (flag.status !== 'OPEN') throw ApiError.conflict('This flag was already reviewed.', 'already_reviewed');
    let suspended = false;
    if (body.decision === 'CONFIRMED' && body.suspendUser && flag.userId) {
      const target = await d.db.user.findUnique({ where: { id: flag.userId } });
      if (target && target.role !== 'ADMIN' && target.id !== admin.id) {
        await d.db.user.update({ where: { id: target.id }, data: { status: 'SUSPENDED' } });
        await audit(d.db, admin.id, 'user.suspended', 'User', target.id, { reason: `Fraud flag ${flag.kind}: ${body.note}` });
        suspended = true;
      }
    }
    await d.db.fraudFlag.update({ where: { id: flag.id }, data: { status: body.decision, note: body.note, reviewedById: admin.id, reviewedAt: new Date() } });
    await audit(d.db, admin.id, `fraud.${body.decision.toLowerCase()}`, 'FraudFlag', flag.id, { kind: flag.kind, suspended });
    res.json({ status: body.decision, suspended });
  });

  /* --------------------------------------------------------------- audit log */
  r.get('/audit', async (req, res) => {
    const q = z.object({ action: z.string().trim().max(60).optional(), cursor: z.string().max(40).optional() }).parse(req.query);
    const rows = await d.db.auditLog.findMany({
      where: q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { actor: { select: { name: true, email: true } } },
    });
    const page = rows.slice(0, 50);
    res.json({
      entries: page.map((a) => ({ id: a.id, action: a.action, entity: a.entity, entityId: a.entityId, meta: a.meta, createdAt: a.createdAt, actor: a.actor ? { name: a.actor.name, email: a.actor.email } : null })),
      nextCursor: rows.length > 50 ? page[page.length - 1]!.id : null,
    });
  });

  r.get('/billing', async (_req, res) => {
    const now = new Date();
    const [paid, active, recent] = await Promise.all([
      d.db.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true }, _count: true }),
      d.db.subscription.count({ where: { status: 'ACTIVE', currentPeriodEnd: { gt: now } } }),
      d.db.payment.findMany({ where: { status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 20, include: { hospital: { select: { name: true, city: true } } } }),
    ]);
    res.json({
      billingEnabled: d.payments.enabled,
      revenuePaise: paid._sum.amount ?? 0,
      paidCount: paid._count,
      activeSubscriptions: active,
      recent: recent.map((p) => ({ id: p.id, hospital: p.hospital.name, city: p.hospital.city, amount: p.amount, interval: p.interval, paidAt: p.paidAt })),
    });
  });

  r.post('/osm/sync', async (req, res) => {
    const { lat, lng } = parse(z.object({ lat: latSchema, lng: lngSchema }), req.body);
    const result = await ensureAreaSynced(d.db, d.overpass, lat, lng, { force: true });
    await audit(d.db, currentUser(req).id, 'osm.sync', 'OsmSyncArea', `${lat},${lng}`, { ...result });
    if (result.status === 'failed') throw new ApiError(502, 'osm_unavailable', 'OpenStreetMap did not respond. Try again in a minute.');
    res.json(result);
  });

  return r;
}
