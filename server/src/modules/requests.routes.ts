import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { BloodRequest, DonorResponse, Hospital, Prisma, User } from '../generated/prisma/client.js';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import { HANDSHAKE_LOCK_MS, HANDSHAKE_MAX_ATTEMPTS, raiseFlag, screenRequest } from '../services/fraud.js';
import { audit, notify, notifyMany } from '../services/notify.js';
import { evaluateEligibility, healthSchema } from '../services/eligibility.js';
import {
  CODE_TTL_MS,
  ESCALATION_FACTOR,
  MAX_RADIUS_KM,
  RADIUS_KM,
  certificateNumber,
  findMatches,
  generateCode,
  hashCode,
} from '../services/matching.js';
import { codeSchema, createRequestSchema } from './schemas.js';

const MAX_OPEN_PER_REQUESTER = 3;
/** A blood bank may need several groups at once. */
const MAX_OPEN_PER_HOSPITAL_USER = 12;
/** Hospitals calling donors to refill their own blood bank use this label instead of a patient name. */
export const RESTOCK_LABEL = 'Blood bank restock';
const firstName = (n: string) => (n.trim() === RESTOCK_LABEL ? 'Blood bank' : n.trim().split(/\s+/)[0] ?? n);
const initialName = (n: string) => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]![0]}.` : p[0] ?? n;
};

type RequestFull = BloodRequest & { hospital: Hospital; requester: User };

const hospitalBrief = (h: Hospital) => ({ id: h.id, name: h.name, city: h.city, addressLine: h.addressLine, phone: h.phone, lat: h.lat, lng: h.lng });

function summary(r: BloodRequest & { hospital: Hospital }, counts?: Record<string, number>) {
  return {
    id: r.id,
    patientName: r.patientName,
    bloodGroup: r.bloodGroup,
    unitsNeeded: r.unitsNeeded,
    unitsFulfilled: r.unitsFulfilled,
    urgency: r.urgency,
    neededBy: r.neededBy,
    status: r.status,
    matchedCount: r.matchedCount,
    radiusKm: r.radiusKm,
    createdAt: r.createdAt,
    hospital: hospitalBrief(r.hospital),
    accepted: counts?.ACCEPTED ?? 0,
    declined: counts?.DECLINED ?? 0,
  };
}

async function countsFor(d: Deps, requestIds: string[]) {
  const rows = requestIds.length
    ? await d.db.donorResponse.groupBy({ by: ['requestId', 'status'], where: { requestId: { in: requestIds } }, _count: true })
    : [];
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) map.set(row.requestId, { ...(map.get(row.requestId) ?? {}), [row.status]: row._count });
  return map;
}

/** Flips overdue open requests to EXPIRED so every reader sees one truth. */
const sweepExpired = (d: Deps) => d.db.bloodRequest.updateMany({ where: { status: 'OPEN', neededBy: { lt: new Date() } }, data: { status: 'EXPIRED' } });

async function hospitalStaffIds(d: Deps, hospitalId: string) {
  const staff = await d.db.user.findMany({ where: { hospitalId, status: 'ACTIVE' }, select: { id: true } });
  return staff.map((s) => s.id);
}

const canManage = (u: User, r: { requesterId: string; hospitalId: string }) =>
  u.role === 'ADMIN' || u.id === r.requesterId || (u.role === 'HOSPITAL' && u.hospitalId === r.hospitalId);

async function loadRequest(d: Deps, id: string): Promise<RequestFull> {
  const r = await d.db.bloodRequest.findUnique({ where: { id }, include: { hospital: true, requester: true } });
  if (!r) throw ApiError.notFound('Request not found.');
  return r;
}

/** Invites matched donors and notifies them. Shared by create and escalate. */
async function inviteDonors(d: Deps, r: RequestFull, radiusKm: number) {
  const matches = await findMatches(d.db, {
    requestId: r.id,
    requesterId: r.requesterId,
    bloodGroup: r.bloodGroup,
    lat: r.hospital.lat,
    lng: r.hospital.lng,
    radiusKm,
  });
  if (matches.length) {
    await d.db.donorResponse.createMany({
      data: matches.map((m) => ({ requestId: r.id, donorId: m.userId, distanceKm: m.distanceKm })),
      skipDuplicates: true,
    });
    await notifyMany(d.db, matches.map((m) => m.userId), {
      type: 'REQUEST_MATCH',
      title: r.urgency === 'CRITICAL' ? 'Critical: blood needed near you' : 'Someone near you needs blood',
      body: `${r.bloodGroup.replace('_POS', '+').replace('_NEG', '−')} needed at ${r.hospital.name}${r.hospital.city ? `, ${r.hospital.city}` : ''}. Open BloodBridge to respond.`,
      data: { requestId: r.id },
    });
  }
  return matches.length;
}

export function requestsRouter(d: Deps) {
  const r = Router();

  /* ------------------------------------------------------------------ create */
  r.post('/', requireRole('REQUESTER', 'HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const body = parse(createRequestSchema, req.body);
    const now = Date.now();
    if (body.neededBy.getTime() < now - 5 * 60_000) throw ApiError.badRequest('The needed-by time is in the past.');
    if (body.neededBy.getTime() > now + 30 * 86_400_000) throw ApiError.badRequest('Requests can be at most 30 days ahead.');

    const hospitalId = me.role === 'HOSPITAL' ? me.hospitalId : body.hospitalId;
    if (!hospitalId) throw ApiError.badRequest('Link your hospital first.');
    const hospital = await d.db.hospital.findUnique({ where: { id: hospitalId } });
    if (!hospital || hospital.status !== 'VERIFIED') {
      throw ApiError.badRequest('Blood requests can only be sent to verified hospitals, so donors always arrive somewhere that can receive them.');
    }
    const contactPhone = body.contactPhone ?? me.phone;
    if (!contactPhone) throw ApiError.badRequest('Add a contact phone number.');

    const open = await d.db.bloodRequest.count({ where: { requesterId: me.id, status: 'OPEN' } });
    const cap = me.role === 'HOSPITAL' ? MAX_OPEN_PER_HOSPITAL_USER : MAX_OPEN_PER_REQUESTER;
    if (open >= cap) {
      throw ApiError.conflict(`You already have ${cap} open requests. Cancel or complete one before creating another.`, 'too_many_open');
    }

    const created = await d.db.bloodRequest.create({
      data: {
        requesterId: me.id,
        hospitalId,
        patientName: body.patientName,
        bloodGroup: body.bloodGroup,
        unitsNeeded: body.unitsNeeded,
        urgency: body.urgency,
        neededBy: body.neededBy,
        contactPhone,
        note: body.note || null,
        radiusKm: RADIUS_KM[body.urgency],
      },
      include: { hospital: true, requester: true },
    });
    const alerted = await inviteDonors(d, created, created.radiusKm);
    await d.db.bloodRequest.update({ where: { id: created.id }, data: { matchedCount: alerted } });
    // Verified hospitals calling donors in bulk is normal; their licence is screened separately.
    if (me.role !== 'HOSPITAL') await screenRequest(d.db, { id: created.id, requesterId: me.id, hospitalId, patientName: body.patientName, bloodGroup: body.bloodGroup, contactPhone });

    if (me.role !== 'HOSPITAL') {
      await notifyMany(d.db, await hospitalStaffIds(d, hospitalId), {
        type: 'REQUEST_UPDATE',
        title: 'New blood request for your hospital',
        body: `${body.unitsNeeded} unit(s) of ${body.bloodGroup.replace('_POS', '+').replace('_NEG', '−')} for ${firstName(body.patientName)}. ${alerted} donor(s) alerted.`,
        data: { requestId: created.id },
      });
    }
    await audit(d.db, me.id, 'request.create', 'BloodRequest', created.id, { alerted });
    res.status(201).json({ id: created.id, alerted, radiusKm: created.radiusKm });
  });

  /* -------------------------------------------------------------- donor inbox */
  r.get('/inbox', requireRole('DONOR'), async (req, res) => {
    const me = currentUser(req);
    await sweepExpired(d);
    const rows = await d.db.donorResponse.findMany({
      where: { donorId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { request: { include: { hospital: true } } },
    });
    const now = Date.now();
    const shape = (x: (typeof rows)[number]) => ({
      responseId: x.id,
      status: x.status,
      distanceKm: x.distanceKm,
      codeExpiresAt: x.status === 'ACCEPTED' ? x.codeExpiresAt : null,
      request: {
        id: x.request.id,
        patientName: firstName(x.request.patientName),
        bloodGroup: x.request.bloodGroup,
        unitsNeeded: x.request.unitsNeeded,
        urgency: x.request.urgency,
        neededBy: x.request.neededBy,
        status: x.request.status,
        hospital: hospitalBrief(x.request.hospital),
      },
    });
    const live = (x: (typeof rows)[number]) =>
      x.request.status === 'OPEN' && x.request.neededBy.getTime() > now && (x.status === 'INVITED' || x.status === 'ACCEPTED');
    const urgencyRank = { CRITICAL: 0, URGENT: 1, PLANNED: 2 } as const;
    res.json({
      active: rows
        .filter(live)
        .sort((a, b) => Number(b.status === 'ACCEPTED') - Number(a.status === 'ACCEPTED') || urgencyRank[a.request.urgency] - urgencyRank[b.request.urgency] || a.distanceKm - b.distanceKm)
        .map(shape),
      history: rows.filter((x) => !live(x)).slice(0, 20).map(shape),
    });
  });

  /* ------------------------------------------------------ requester / hospital */
  r.get('/mine', requireRole('REQUESTER', 'HOSPITAL', 'ADMIN'), async (req, res) => {
    const me = currentUser(req);
    await sweepExpired(d);
    const where: Prisma.BloodRequestWhereInput =
      me.role === 'ADMIN' ? {} : me.role === 'HOSPITAL' ? { hospitalId: me.hospitalId ?? '__none__' } : { requesterId: me.id };
    const filter = req.query.status;
    if (filter === 'active') where.status = 'OPEN';
    else if (filter === 'closed') where.status = { not: 'OPEN' };
    const rows = await d.db.bloodRequest.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50, include: { hospital: true } });
    const counts = await countsFor(d, rows.map((x) => x.id));
    res.json({ items: rows.map((x) => summary(x, counts.get(x.id))) });
  });

  /* ------------------------------------------------------------------ detail */
  r.get('/:id', async (req, res) => {
    const me = currentUser(req);
    await sweepExpired(d);
    const rq = await loadRequest(d, String(req.params.id));

    if (canManage(me, rq)) {
      const responses = await d.db.donorResponse.findMany({
        where: { requestId: rq.id },
        orderBy: { updatedAt: 'desc' },
        include: { donor: { include: { donorProfile: true } } },
      });
      const counts: Record<string, number> = {};
      for (const x of responses) counts[x.status] = (counts[x.status] ?? 0) + 1;
      const committed = responses.filter((x) => x.status === 'ACCEPTED' || x.status === 'DONATED');
      res.json({
        viewer: me.role === 'HOSPITAL' ? 'HOSPITAL' : me.role === 'ADMIN' ? 'ADMIN' : 'OWNER',
        ...summary(rq, counts),
        note: rq.note,
        contactPhone: rq.contactPhone,
        requester: { name: rq.requester.name, phone: rq.requester.phone },
        invited: counts.INVITED ?? 0,
        donors: committed.map((x) => ({
          id: x.id,
          status: x.status,
          name: firstName(x.donor.name),
          phone: x.donor.phone,
          bloodGroup: x.donor.donorProfile?.bloodGroup ?? null,
          distanceKm: x.distanceKm,
          acceptedAt: x.respondedAt,
          completedAt: x.completedAt,
        })),
      });
      return;
    }

    const mine = await d.db.donorResponse.findUnique({ where: { requestId_donorId: { requestId: rq.id, donorId: me.id } } });
    if (!mine) throw ApiError.notFound('Request not found.');
    res.json({
      viewer: 'DONOR',
      ...summary(rq),
      patientName: firstName(rq.patientName),
      note: rq.note,
      contactPhone: mine.status === 'ACCEPTED' || mine.status === 'DONATED' ? rq.contactPhone : null,
      response: { id: mine.id, status: mine.status, distanceKm: mine.distanceKm, codeExpiresAt: mine.status === 'ACCEPTED' ? mine.codeExpiresAt : null },
    });
  });

  /* ------------------------------------------------------------------ cancel */
  r.post('/:id/cancel', async (req, res) => {
    const me = currentUser(req);
    const rq = await loadRequest(d, String(req.params.id));
    if (!canManage(me, rq)) throw ApiError.forbidden();
    if (rq.status !== 'OPEN') throw ApiError.conflict('Only open requests can be cancelled.', 'not_open');

    const pending = await d.db.donorResponse.findMany({ where: { requestId: rq.id, status: { in: ['INVITED', 'ACCEPTED'] } }, select: { donorId: true } });
    await d.db.$transaction([
      d.db.bloodRequest.update({ where: { id: rq.id }, data: { status: 'CANCELLED' } }),
      d.db.donorResponse.updateMany({ where: { requestId: rq.id, status: { in: ['INVITED', 'ACCEPTED'] } }, data: { status: 'CANCELLED', codeHash: null, codeExpiresAt: null } }),
    ]);
    await notifyMany(d.db, pending.map((p) => p.donorId), {
      type: 'REQUEST_CANCELLED',
      title: 'Request closed',
      body: `The request at ${rq.hospital.name} was cancelled. Thank you for being ready to help.`,
      data: { requestId: rq.id },
    });
    if (me.id !== rq.requesterId) {
      await notify(d.db, rq.requesterId, { type: 'REQUEST_CANCELLED', title: 'Your request was cancelled', body: `${rq.hospital.name} cancelled the request for ${firstName(rq.patientName)}.`, data: { requestId: rq.id } });
    }
    await audit(d.db, me.id, 'request.cancel', 'BloodRequest', rq.id);
    res.json({ ok: true });
  });

  /* ---------------------------------------------------------------- escalate */
  r.post('/:id/escalate', async (req, res) => {
    const me = currentUser(req);
    const rq = await loadRequest(d, String(req.params.id));
    if (!canManage(me, rq)) throw ApiError.forbidden();
    if (rq.status !== 'OPEN') throw ApiError.conflict('Only open requests can be widened.', 'not_open');
    const radiusKm = Math.min(MAX_RADIUS_KM, Math.ceil(rq.radiusKm * ESCALATION_FACTOR));
    if (radiusKm <= rq.radiusKm) throw ApiError.conflict('This request already covers the widest search area.', 'max_radius');

    const alerted = await inviteDonors(d, rq, radiusKm);
    await d.db.bloodRequest.update({ where: { id: rq.id }, data: { radiusKm, matchedCount: { increment: alerted } } });
    await audit(d.db, me.id, 'request.escalate', 'BloodRequest', rq.id, { radiusKm, alerted });
    res.json({ alerted, radiusKm });
  });

  /* --------------------------------------------------- hospital desk handshake */
  r.post('/:id/handshake', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const { code } = parse(codeSchema, req.body);
    const rq = await loadRequest(d, String(req.params.id));
    if (!me.hospitalId || me.hospitalId !== rq.hospitalId) throw ApiError.forbidden('This request belongs to another hospital.');
    if (rq.hospital.status !== 'VERIFIED') throw ApiError.forbidden('Your hospital is not verified.');
    if (rq.status !== 'OPEN') throw ApiError.conflict('This request is no longer open.', 'not_open');

    const now = new Date();
    if (rq.codeLockedUntil && rq.codeLockedUntil > now) {
      const mins = Math.ceil((rq.codeLockedUntil.getTime() - now.getTime()) / 60_000);
      throw new ApiError(429, 'too_many_attempts', `Too many wrong codes. Entry is locked for ${mins} more minute${mins === 1 ? '' : 's'}. Ask the donor to open their app and confirm the code.`);
    }
    const candidates = await d.db.donorResponse.findMany({
      where: { requestId: rq.id, status: 'ACCEPTED', codeHash: { not: null }, codeExpiresAt: { gt: now } },
      include: { donor: { include: { donorProfile: true } } },
    });
    const match = candidates.find((c) => {
      const a = Buffer.from(hashCode(c.id, code));
      const b = Buffer.from(c.codeHash!);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (!match) {
      // Six digits are only safe if guessing is expensive: five misses lock the request's desk entry for 15 minutes.
      const bumped = await d.db.bloodRequest.update({ where: { id: rq.id }, data: { codeAttempts: { increment: 1 } }, select: { codeAttempts: true } });
      if (bumped.codeAttempts >= HANDSHAKE_MAX_ATTEMPTS) {
        await d.db.bloodRequest.update({ where: { id: rq.id }, data: { codeAttempts: 0, codeLockedUntil: new Date(now.getTime() + HANDSHAKE_LOCK_MS) } });
        await raiseFlag(d.db, { kind: 'handshake.bruteforce', severity: 'HIGH', subjectType: 'BloodRequest', subjectId: rq.id, userId: me.id, summary: `${HANDSHAKE_MAX_ATTEMPTS} wrong donation codes in a row at ${rq.hospital.name}. Desk entry locked for 15 minutes.` });
        throw new ApiError(429, 'too_many_attempts', 'Too many wrong codes. Entry is locked for 15 minutes.');
      }
      throw new ApiError(400, 'invalid_code', 'That code is not valid for this request. Ask the donor to check the code in their app.');
    }
    await d.db.bloodRequest.update({ where: { id: rq.id }, data: { codeAttempts: 0 } });

    const result = await d.db.$transaction(async (tx) => {
      const flipped = await tx.donorResponse.updateMany({
        where: { id: match.id, status: 'ACCEPTED' },
        data: { status: 'DONATED', completedAt: now, codeHash: null, codeExpiresAt: null },
      });
      if (flipped.count === 0) throw ApiError.conflict('This code was already used.', 'code_used');

      const donation = await tx.donation.create({
        data: {
          certificateNo: certificateNumber(now),
          donorId: match.donorId,
          hospitalId: rq.hospitalId,
          requestId: rq.id,
          responseId: match.id,
          bloodGroup: match.donor.donorProfile?.bloodGroup ?? rq.bloodGroup,
          donatedAt: now,
          verifiedById: me.id,
        },
      });
      await tx.donorProfile.updateMany({ where: { userId: match.donorId }, data: { lastDonationAt: now } });
      const updated = await tx.bloodRequest.update({ where: { id: rq.id }, data: { unitsFulfilled: { increment: 1 } } });

      let released: string[] = [];
      if (updated.unitsFulfilled >= updated.unitsNeeded) {
        const left = await tx.donorResponse.findMany({ where: { requestId: rq.id, status: { in: ['INVITED', 'ACCEPTED'] } }, select: { donorId: true } });
        released = left.map((l) => l.donorId);
        await tx.donorResponse.updateMany({ where: { requestId: rq.id, status: { in: ['INVITED', 'ACCEPTED'] } }, data: { status: 'CANCELLED', codeHash: null, codeExpiresAt: null } });
        await tx.bloodRequest.update({ where: { id: rq.id }, data: { status: 'FULFILLED' } });
      }
      return { donation, unitsFulfilled: updated.unitsFulfilled, fulfilled: updated.unitsFulfilled >= updated.unitsNeeded, released };
    });

    await notify(d.db, match.donorId, {
      type: 'DONATION_COMPLETE',
      title: 'Thank you for donating',
      body: `${rq.hospital.name} confirmed your donation. Your certificate ${result.donation.certificateNo} is ready.`,
      data: { donationId: result.donation.id, requestId: rq.id },
    });
    await notify(d.db, rq.requesterId, {
      type: 'REQUEST_UPDATE',
      title: result.fulfilled ? 'Your request is fulfilled' : 'A donor has donated',
      body: `${result.unitsFulfilled} of ${rq.unitsNeeded} unit(s) received at ${rq.hospital.name}.`,
      data: { requestId: rq.id },
    });
    if (result.released.length) {
      await notifyMany(d.db, result.released, {
        type: 'REQUEST_CANCELLED',
        title: 'Request fulfilled',
        body: `The request at ${rq.hospital.name} has all the units it needed. Thank you for being ready.`,
        data: { requestId: rq.id },
      });
    }
    await audit(d.db, me.id, 'donation.verify', 'Donation', result.donation.id, { requestId: rq.id });
    res.json({
      donation: { id: result.donation.id, certificateNo: result.donation.certificateNo, donor: initialName(match.donor.name), bloodGroup: result.donation.bloodGroup },
      unitsFulfilled: result.unitsFulfilled,
      status: result.fulfilled ? 'FULFILLED' : 'OPEN',
    });
  });

  return r;
}

/* ====================================================================== */
/* Donor responses                                                         */
/* ====================================================================== */

export function responsesRouter(d: Deps) {
  const r = Router();
  r.use(requireRole('DONOR'));

  async function load(req: { params: Record<string, unknown> }, me: User) {
    const resp = await d.db.donorResponse.findUnique({ where: { id: String(req.params.id) }, include: { request: { include: { hospital: true } } } });
    if (!resp || resp.donorId !== me.id) throw ApiError.notFound('Invitation not found.');
    return resp;
  }

  const ensureLive = (resp: DonorResponse & { request: BloodRequest }) => {
    if (resp.request.status !== 'OPEN' || resp.request.neededBy.getTime() <= Date.now()) {
      throw ApiError.conflict('This request is no longer open.', 'request_closed');
    }
  };

  async function issueCode(responseId: string) {
    const code = generateCode();
    const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS);
    await d.db.donorResponse.update({ where: { id: responseId }, data: { codeHash: hashCode(responseId, code), codeExpiresAt } });
    return { code, codeExpiresAt };
  }

  r.post('/:id/accept', async (req, res) => {
    const me = currentUser(req);
    const resp = await load(req, me);
    if (resp.status === 'ACCEPTED') throw ApiError.conflict('You already accepted this request.', 'already_accepted');
    if (resp.status !== 'INVITED' && resp.status !== 'DECLINED') throw ApiError.conflict('This invitation can no longer be accepted.', 'not_pending');
    ensureLive(resp);

    const profile = await d.db.donorProfile.findUnique({ where: { userId: me.id } });
    if (!profile) throw ApiError.badRequest('Complete your donor profile first.');
    const health = healthSchema.safeParse(profile.health);
    const eligibility = evaluateEligibility(
      { dateOfBirth: profile.dateOfBirth, gender: profile.gender, weightKg: profile.weightKg, lastDonationAt: profile.lastDonationAt, health: health.success ? health.data : healthSchema.parse({}) },
      new Date(),
    );
    if (!health.success || !eligibility.eligible) {
      throw new ApiError(409, 'not_eligible', eligibility.reasons[0] ?? 'You are not eligible to donate right now.');
    }

    const elsewhere = await d.db.donorResponse.findFirst({
      where: { donorId: me.id, status: 'ACCEPTED', id: { not: resp.id }, request: { status: 'OPEN', neededBy: { gt: new Date() } } },
    });
    if (elsewhere) throw ApiError.conflict('You already committed to another request. Finish or withdraw from it first.', 'already_committed');

    const committed = await d.db.donorResponse.count({ where: { requestId: resp.requestId, status: { in: ['ACCEPTED', 'DONATED'] } } });
    if (committed >= resp.request.unitsNeeded) throw ApiError.conflict('Enough donors have already committed to this request. Thank you for stepping up.', 'enough_donors');

    await d.db.donorResponse.update({ where: { id: resp.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
    const issued = await issueCode(resp.id);

    await notify(d.db, resp.request.requesterId, {
      type: 'REQUEST_ACCEPTED',
      title: 'A donor accepted your request',
      body: `${firstName(me.name)} is on the way to ${resp.request.hospital.name}.`,
      data: { requestId: resp.requestId },
    });
    await notifyMany(d.db, await hospitalStaffIds(d, resp.request.hospitalId), {
      type: 'REQUEST_ACCEPTED',
      title: 'A donor is coming',
      body: `${firstName(me.name)} accepted the request for ${firstName(resp.request.patientName)}. Ask for their 6 digit code at the desk.`,
      data: { requestId: resp.requestId },
    });
    res.json({ status: 'ACCEPTED', ...issued });
  });

  r.post('/:id/code', async (req, res) => {
    const resp = await load(req, currentUser(req));
    if (resp.status !== 'ACCEPTED') throw ApiError.conflict('You have not accepted this request.', 'not_accepted');
    ensureLive(resp);
    res.json(await issueCode(resp.id));
  });

  r.post('/:id/decline', async (req, res) => {
    const resp = await load(req, currentUser(req));
    if (resp.status !== 'INVITED') throw ApiError.conflict('Only a pending invitation can be declined.', 'not_pending');
    await d.db.donorResponse.update({ where: { id: resp.id }, data: { status: 'DECLINED', respondedAt: new Date() } });
    res.json({ status: 'DECLINED' });
  });

  r.post('/:id/withdraw', async (req, res) => {
    const me = currentUser(req);
    const resp = await load(req, me);
    if (resp.status !== 'ACCEPTED') throw ApiError.conflict('You have not accepted this request.', 'not_accepted');
    await d.db.donorResponse.update({ where: { id: resp.id }, data: { status: 'CANCELLED', codeHash: null, codeExpiresAt: null } });
    await notify(d.db, resp.request.requesterId, {
      type: 'REQUEST_UPDATE',
      title: 'A donor withdrew',
      body: `${firstName(me.name)} can no longer make it. We are keeping the request open for other donors.`,
      data: { requestId: resp.requestId },
    });
    res.json({ status: 'CANCELLED' });
  });

  return r;
}

/* ====================================================================== */
/* Donations and certificates                                              */
/* ====================================================================== */

export function donationsRouter(d: Deps) {
  const r = Router();
  r.use(requireRole('DONOR'));

  const shape = (x: { id: string; certificateNo: string; bloodGroup: string; units: number; donatedAt: Date; hospital: Hospital }, donorName: string) => ({
    id: x.id,
    certificateNo: x.certificateNo,
    bloodGroup: x.bloodGroup,
    units: x.units,
    donatedAt: x.donatedAt,
    donorName,
    hospital: { name: x.hospital.name, city: x.hospital.city, state: x.hospital.state },
  });

  r.get('/', async (req, res) => {
    const me = currentUser(req);
    const rows = await d.db.donation.findMany({ where: { donorId: me.id }, orderBy: { donatedAt: 'desc' }, include: { hospital: true } });
    const units = rows.reduce((s, x) => s + x.units, 0);
    res.json({ totals: { donations: rows.length, units, livesImpacted: units * 3 }, items: rows.map((x) => shape(x, me.name)) });
  });

  r.get('/:id', async (req, res) => {
    const me = currentUser(req);
    const x = await d.db.donation.findUnique({ where: { id: String(req.params.id) }, include: { hospital: true } });
    if (!x || x.donorId !== me.id) throw ApiError.notFound('Certificate not found.');
    res.json(shape(x, me.name));
  });

  return r;
}
