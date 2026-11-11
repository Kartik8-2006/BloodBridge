import type { Db } from '../lib/prisma.js';
import { GAP_DAYS, evaluateEligibility, healthSchema } from './eligibility.js';
import { notify, notifyMany } from './notify.js';
import { logger } from '../lib/logger.js';

const DAY = 86_400_000;

export interface JobReport { expiredRequests: number; eligibleAgain: number; campReminders: number; proExpiring: number }

/** Every reminder carries a key, so running the sweep twice (or from two servers) never notifies someone twice. */
async function alreadySent(db: Db, userIds: string[], keyOf: (userId: string) => string): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db.notification.findMany({ where: { userId: { in: userIds }, type: 'REMINDER' }, select: { userId: true, data: true } });
  const sent = new Set<string>();
  for (const r of rows) {
    const key = (r.data as { key?: string } | null)?.key;
    if (key) sent.add(`${r.userId}|${key}`);
  }
  const wanted = new Set(userIds.map((u) => `${u}|${keyOf(u)}`));
  return new Set([...sent].filter((k) => wanted.has(k)));
}

async function send(db: Db, targets: { userId: string; key: string; title: string; body: string; link: string }[]): Promise<number> {
  for (const t of targets) await notify(db, t.userId, { type: 'REMINDER', title: t.title, body: t.body, data: { key: t.key, link: t.link } });
  return targets.length;
}

/** Donors whose waiting period ended in the last 7 days and who are available and healthy get one "you can donate again" note. */
export async function remindEligibleAgain(db: Db, now: Date): Promise<number> {
  const donors = await db.donorProfile.findMany({
    where: { available: true, lastDonationAt: { not: null, lt: new Date(now.getTime() - 85 * DAY) }, user: { status: 'ACTIVE' } },
    include: { user: { select: { id: true } } },
  });
  const due = donors.filter((p) => {
    const ends = new Date(p.lastDonationAt!.getTime() + GAP_DAYS[p.gender] * DAY);
    if (ends > now || ends < new Date(now.getTime() - 7 * DAY)) return false;
    return evaluateEligibility({ dateOfBirth: p.dateOfBirth, gender: p.gender, weightKg: p.weightKg, lastDonationAt: p.lastDonationAt, health: healthSchema.parse(p.health ?? {}) }, now).eligible;
  });
  const keyOf = (p: (typeof due)[number]) => `eligible|${p.id}|${p.lastDonationAt!.toISOString().slice(0, 10)}`;
  const byUser = new Map(due.map((p) => [p.user.id, p]));
  const sent = await alreadySent(db, [...byUser.keys()], (u) => keyOf(byUser.get(u)!));
  const targets = [...byUser].filter(([u, p]) => !sent.has(`${u}|${keyOf(p)}`)).map(([userId, p]) => ({
    userId, key: keyOf(p), title: 'You can donate again', body: 'Your waiting period is over. Someone nearby may need your blood. Check Requests for You or find a camp.', link: '/app/inbox',
  }));
  return send(db, targets);
}

/** Registered donors hear about their camp the day before. */
export async function remindCamps(db: Db, now: Date): Promise<number> {
  const camps = await db.camp.findMany({
    where: { status: 'SCHEDULED', startsAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
    include: { registrations: { where: { status: 'REGISTERED' }, select: { donorId: true } } },
  });
  let total = 0;
  for (const c of camps) {
    const key = `camp|${c.id}`;
    const ids = c.registrations.map((r) => r.donorId);
    const sent = await alreadySent(db, ids, () => key);
    const fresh = ids.filter((u) => !sent.has(`${u}|${key}`));
    if (!fresh.length) continue;
    const time = c.startsAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    await notifyMany(db, fresh, { type: 'REMINDER', title: 'Camp tomorrow', body: `${c.title} at ${c.venue}, ${time}. Eat well, drink water and carry an ID.`, data: { key, link: '/app/camps' } });
    total += fresh.length;
  }
  return total;
}

/** Hospital staff are warned 3 days before Pro ends, once per period. */
export async function remindProExpiring(db: Db, now: Date): Promise<number> {
  const subs = await db.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { gt: now, lte: new Date(now.getTime() + 3 * DAY) } },
    include: { hospital: { select: { name: true, staff: { select: { id: true } } } } },
  });
  let total = 0;
  for (const s of subs) {
    const key = `pro|${s.id}|${s.currentPeriodEnd.toISOString().slice(0, 10)}`;
    const ids = s.hospital.staff.map((u) => u.id);
    const sent = await alreadySent(db, ids, () => key);
    const fresh = ids.filter((u) => !sent.has(`${u}|${key}`));
    if (!fresh.length) continue;
    await notifyMany(db, fresh, { type: 'REMINDER', title: 'Pro plan ends soon', body: `Pro for ${s.hospital.name} ends on ${s.currentPeriodEnd.toISOString().slice(0, 10)}. Renew from Billing to keep analytics and unlimited camps.`, data: { key, link: '/app/billing' } });
    total += fresh.length;
  }
  return total;
}

export async function runJobs(db: Db, now = new Date()): Promise<JobReport> {
  const expired = await db.bloodRequest.updateMany({ where: { status: 'OPEN', neededBy: { lt: now } }, data: { status: 'EXPIRED' } });
  await db.subscription.updateMany({ where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } }, data: { status: 'EXPIRED' } });
  const report: JobReport = {
    expiredRequests: expired.count,
    eligibleAgain: await remindEligibleAgain(db, now),
    campReminders: await remindCamps(db, now),
    proExpiring: await remindProExpiring(db, now),
  };
  logger.info(report, 'background jobs finished');
  return report;
}

/** Runs once shortly after start, then every 30 minutes. A failed run is logged and the next one tries again. */
export function startJobs(db: Db): () => void {
  const tick = () => runJobs(db).catch((err) => logger.error({ err }, 'background jobs failed'));
  const first = setTimeout(tick, 30_000);
  const timer = setInterval(tick, 30 * 60_000);
  first.unref(); timer.unref();
  return () => { clearTimeout(first); clearInterval(timer); };
}
