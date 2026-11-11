import express, { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { parse } from '../lib/validate.js';
import { logger } from '../lib/logger.js';
import type { Deps } from '../deps.js';
import { FREE_FEATURES, PRO_FEATURES, activatePayment, priceFor, subscriptionOf } from '../services/billing.js';
import { verifiedHospitalOf } from './staff.js';

const checkoutSchema = z.object({ interval: z.enum(['MONTHLY', 'YEARLY']) });
const verifySchema = z.object({ orderId: z.string().min(5).max(64), paymentId: z.string().min(5).max(64), signature: z.string().min(10).max(200) });

export function billingRouter(d: Deps) {
  const r = Router();

  r.get('/', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    if (!me.hospitalId) throw ApiError.badRequest('Link your hospital first.');
    const sub = await subscriptionOf(d.db, me.hospitalId);
    const payments = await d.db.payment.findMany({ where: { hospitalId: me.hospitalId, status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 10 });
    res.json({
      billingEnabled: d.payments.enabled,
      subscription: sub,
      plans: {
        free: { features: FREE_FEATURES },
        pro: { features: PRO_FEATURES, monthlyPaise: priceFor(d.env, 'MONTHLY'), yearlyPaise: priceFor(d.env, 'YEARLY') },
      },
      payments: payments.map((p) => ({ id: p.id, amount: p.amount, currency: p.currency, interval: p.interval, paidAt: p.paidAt })),
    });
  });

  r.post('/checkout', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const h = await verifiedHospitalOf(d, me);
    if (!d.payments.enabled) throw ApiError.badRequest('Billing is not switched on for this deployment.');
    const { interval } = parse(checkoutSchema, req.body);
    const amount = priceFor(d.env, interval);
    const receipt = `bb_${h.id.slice(-8)}_${Date.now().toString(36)}`;
    const order = await d.payments.createOrder({ amountPaise: amount, receipt, notes: { hospitalId: h.id, interval } });
    await d.db.payment.create({ data: { hospitalId: h.id, userId: me.id, orderId: order.id, amount, interval } });
    res.status(201).json({ orderId: order.id, amount, currency: 'INR', keyId: d.payments.keyId, name: 'BloodBridge Pro', description: interval === 'MONTHLY' ? 'Pro plan, 1 month' : 'Pro plan, 1 year', prefill: { name: me.name, email: me.email } });
  });

  /** Called by the browser after Checkout succeeds. The signature proves Razorpay, not the browser, confirmed the payment. */
  r.post('/verify', requireRole('HOSPITAL'), async (req, res) => {
    const me = currentUser(req);
    const body = parse(verifySchema, req.body);
    const payment = await d.db.payment.findUnique({ where: { orderId: body.orderId } });
    if (!payment || payment.hospitalId !== me.hospitalId) throw ApiError.notFound('Payment not found.');
    if (!d.payments.verifyPayment(body.orderId, body.paymentId, body.signature)) throw ApiError.badRequest('We could not verify this payment. If money was deducted it will be applied automatically within a few minutes.');
    await activatePayment(d, body.orderId, body.paymentId);
    res.json({ subscription: await subscriptionOf(d.db, payment.hospitalId) });
  });

  return r;
}

/**
 * Razorpay webhook. Mounted before the JSON parser because the signature is computed over the exact raw bytes.
 * It is the safety net for customers who pay and then close the tab before the browser callback runs.
 */
export function billingWebhook(d: Deps) {
  return [
    express.raw({ type: 'application/json', limit: '100kb' }),
    async (req: express.Request, res: express.Response) => {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const signature = String(req.headers['x-razorpay-signature'] ?? '');
      if (!d.payments.verifyWebhook(raw, signature)) return void res.status(400).json({ error: { code: 'bad_signature', message: 'Invalid signature.' } });
      try {
        const event = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
        const entity = event.payload?.payment?.entity;
        if ((event.event === 'payment.captured' || event.event === 'order.paid') && entity?.order_id && entity.id) {
          const known = await d.db.payment.findUnique({ where: { orderId: entity.order_id } });
          if (known) await activatePayment(d, entity.order_id, entity.id);
        }
      } catch (err) {
        logger.error({ err }, 'billing webhook failed');
        return void res.status(500).json({ error: { code: 'webhook_failed', message: 'Could not process.' } }); // Razorpay retries on non-2xx
      }
      res.json({ ok: true });
    },
  ] as const;
}
