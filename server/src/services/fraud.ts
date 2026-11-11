import type { Db } from '../lib/prisma.js';
import type { FraudSeverity, Prisma } from '../generated/prisma/client.js';
import { logger } from '../lib/logger.js';
import { notifyAdmins } from './notify.js';

export const HANDSHAKE_MAX_ATTEMPTS = 5;
export const HANDSHAKE_LOCK_MS = 15 * 60_000;

interface FlagInput {
  kind: string;
  severity: FraudSeverity;
  subjectType: string;
  subjectId: string;
  userId?: string | null;
  summary: string;
  detail?: Prisma.InputJsonValue;
}

/**
 * Records a suspicious pattern once per (kind, subject). Never throws: a failing fraud check must not
 * break the request that triggered it. High severity pings the admins.
 */
export async function raiseFlag(db: Db, f: FlagInput) {
  try {
    const made = await db.fraudFlag.createManyAndReturn({
      data: [{ kind: f.kind, severity: f.severity, subjectType: f.subjectType, subjectId: f.subjectId, userId: f.userId ?? null, summary: f.summary, detail: f.detail }],
      skipDuplicates: true,
    });
    if (made.length && f.severity === 'HIGH') {
      await notifyAdmins(db, { type: 'FRAUD_ALERT', title: 'High-risk activity flagged', body: f.summary, data: { flagId: made[0]!.id } });
    }
    return made[0] ?? null;
  } catch (err) {
    logger.error({ err, kind: f.kind }, 'fraud flag failed');
    return null;
  }
}

const digits = (s: string) => s.replace(/\D/g, '').slice(-10);
export const normaliseLicence = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Run after a blood request is created. */
export async function screenRequest(db: Db, rq: { id: string; requesterId: string; hospitalId: string; patientName: string; bloodGroup: string; contactPhone: string }) {
  const day = new Date(Date.now() - 86_400_000);
  const week = new Date(Date.now() - 7 * 86_400_000);

  const recent = await db.bloodRequest.findMany({ where: { requesterId: rq.requesterId, createdAt: { gte: day } }, select: { id: true, patientName: true, bloodGroup: true, hospitalId: true } });
  const same = recent.filter((x) => x.id !== rq.id && x.patientName.trim().toLowerCase() === rq.patientName.trim().toLowerCase() && x.bloodGroup === rq.bloodGroup && x.hospitalId !== rq.hospitalId);
  if (same.length) {
    await raiseFlag(db, { kind: 'request.duplicate_patient', severity: 'MEDIUM', subjectType: 'BloodRequest', subjectId: rq.id, userId: rq.requesterId, summary: `Same patient and blood group requested at ${same.length + 1} hospitals within 24 hours.`, detail: { requestIds: [rq.id, ...same.map((x) => x.id)] } });
  }
  if (recent.length >= 5) {
    await raiseFlag(db, { kind: 'request.volume', severity: 'MEDIUM', subjectType: 'User', subjectId: rq.requesterId, userId: rq.requesterId, summary: `${recent.length} blood requests created within 24 hours by one account.` });
  }

  const phone = digits(rq.contactPhone);
  if (phone.length >= 8) {
    const users = await db.bloodRequest.findMany({ where: { contactPhone: { endsWith: phone }, createdAt: { gte: week } }, select: { requesterId: true }, distinct: ['requesterId'] });
    if (users.length >= 3) {
      await raiseFlag(db, { kind: 'request.shared_phone', severity: 'MEDIUM', subjectType: 'Phone', subjectId: phone, userId: rq.requesterId, summary: `One contact number was used by ${users.length} different accounts in 7 days.`, detail: { accounts: users.map((u) => u.requesterId) } });
    }
  }
}

/** Run after a hospital submits a licence number. The same licence on two facilities is the strongest fake-hospital signal. */
export async function screenLicence(db: Db, hospitalId: string, licenseNumber: string, actorId: string) {
  const key = normaliseLicence(licenseNumber);
  if (key.length < 4) return;
  const others = await db.hospital.findMany({ where: { id: { not: hospitalId }, licenseNumber: { not: null } }, select: { id: true, name: true, licenseNumber: true } });
  const clash = others.filter((o) => normaliseLicence(o.licenseNumber!) === key);
  if (clash.length) {
    await raiseFlag(db, { kind: 'hospital.licence_reuse', severity: 'HIGH', subjectType: 'Hospital', subjectId: hospitalId, userId: actorId, summary: `Licence ${licenseNumber} is already on file for ${clash.map((c) => c.name).join(', ')}.`, detail: { otherHospitalIds: clash.map((c) => c.id) } });
  }
}
