import type { Env } from '../config/env.js';
import type { Db } from '../lib/prisma.js';
import type { BillingInterval } from '../generated/prisma/client.js';
import { ApiError } from '../lib/errors.js';
import type { Deps } from '../deps.js';
import { audit, notifyMany } from './notify.js';

export const FREE_ACTIVE_CAMPS = 2;
const DAY = 86_400_000;
export const PERIOD_DAYS: Record<BillingInterval, number> = { MONTHLY: 30, YEARLY: 365 };

export const priceFor = (env: Env, interval: BillingInterval) => (interval === 'MONTHLY' ? env.PRO_MONTHLY_PAISE : env.PRO_YEARLY_PAISE);

export const PRO_FEATURES = ['Analytics and demand charts', '7-day stock forecast with AI summary', 'Unlimited donation camps'];
export const FREE_FEATURES = ['Verified listing and blood requests', 'Inventory tracking and low-stock alerts', `Up to ${FREE_ACTIVE_CAMPS} active donation camps`];

export async function subscriptionOf(db: Db, hospitalId: string, now = new Date()) {
  const sub = await db.subscription.findUnique({ where: { hospitalId } });
  const active = !!sub && sub.status === 'ACTIVE' && sub.currentPeriodEnd > now;
  return { active, currentPeriodEnd: sub?.currentPeriodEnd ?? null };
}

/** Pro features are open to everyone when billing is not configured, so a deployment without Razorpay keys never locks users out. */
export async function hasPro(d: Deps, hospitalId: string) {
  if (!d.payments.enabled) return true;
  return (await subscriptionOf(d.db, hospitalId)).active;
}

export async function requirePro(d: Deps, hospitalId: string, what: string) {
  if (!(await hasPro(d, hospitalId))) throw new ApiError(402, 'plan_required', `${what} is part of the Pro plan. Upgrade from the Billing page to unlock it.`);
}

/**
 * Marks a payment paid and extends the subscription. Safe to call twice (browser callback and webhook both do):
 * only the call that flips CREATED to PAID extends the period.
 */
export async function activatePayment(d: Deps, orderId: string, paymentId: string) {
  const outcome = await d.db.$transaction(async (tx) => {
    const flipped = await tx.payment.updateMany({ where: { orderId, status: { not: 'PAID' } }, data: { status: 'PAID', paymentId, paidAt: new Date() } });
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (!payment) throw ApiError.notFound('Payment not found.');
    if (flipped.count === 0) return { payment, extended: false };
    const existing = await tx.subscription.findUnique({ where: { hospitalId: payment.hospitalId } });
    const base = existing && existing.currentPeriodEnd > new Date() ? existing.currentPeriodEnd : new Date();
    const end = new Date(base.getTime() + PERIOD_DAYS[payment.interval] * DAY);
    await tx.subscription.upsert({
      where: { hospitalId: payment.hospitalId },
      create: { hospitalId: payment.hospitalId, status: 'ACTIVE', currentPeriodEnd: end },
      update: { status: 'ACTIVE', currentPeriodEnd: end },
    });
    return { payment, extended: true };
  });
  if (outcome.extended) {
    const staff = await d.db.user.findMany({ where: { hospitalId: outcome.payment.hospitalId, status: 'ACTIVE' }, select: { id: true } });
    await notifyMany(d.db, staff.map((s) => s.id), { type: 'PAYMENT_SUCCESS', title: 'Pro plan active', body: 'Thank you. Analytics, forecasts and unlimited camps are unlocked.', data: { orderId } });
    await audit(d.db, outcome.payment.userId, 'billing.paid', 'Payment', outcome.payment.id, { orderId, amount: outcome.payment.amount });
  }
  return outcome;
}
