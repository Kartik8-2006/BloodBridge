import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AMRITSAR, buildTestApp, donorPayload } from './helpers/app.js';

const t = buildTestApp();
const api = () => request(t.app);
const as = (id: string) => t.auth.as(id);

beforeAll(() => t.reset());
beforeEach(async () => {
  await t.reset();
  t.payments.enabled = true;
});
afterAll(() => t.db.$disconnect());

async function hospitalWithStaff(staffId: string, over: Record<string, unknown> = {}) {
  await api().post('/api/users/onboard').set('Authorization', as(staffId)).send({ role: 'HOSPITAL', phone: '+919822222222' });
  const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: `Hospital ${staffId}`, lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED', ...over } });
  await t.db.user.update({ where: { clerkId: staffId }, data: { hospitalId: h.id } });
  return h;
}
const checkout = (id: string, interval = 'MONTHLY') => api().post('/api/billing/checkout').set('Authorization', as(id)).send({ interval });
const verify = (id: string, body: Record<string, unknown>) => api().post('/api/billing/verify').set('Authorization', as(id)).send(body);
const webhook = (event: object, sig = 'whsec') => api().post('/api/billing/webhook').set('x-razorpay-signature', sig).set('content-type', 'application/json').send(JSON.stringify(event));
const paidEvent = (orderId: string, paymentId: string) => ({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId } } } });
const startsIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const camp = (id: string, n: number) => api().post('/api/camps').set('Authorization', as(id)).send({ title: `Camp number ${n}`, venue: 'Town Hall', startsAt: startsIn(48 + n), endsAt: startsIn(52 + n), capacity: 10 });

describe('billing', () => {
  it('lists plans with prices from config and no subscription at first', async () => {
    await hospitalWithStaff('s1');
    const res = await api().get('/api/billing').set('Authorization', as('s1'));
    expect(res.status).toBe(200);
    expect(res.body.billingEnabled).toBe(true);
    expect(res.body.plans.pro.monthlyPaise).toBe(99_900);
    expect(res.body.subscription.active).toBe(false);
  });

  it('checkout creates an order, and a correct signature activates Pro for the period', async () => {
    const h = await hospitalWithStaff('s1');
    const c = await checkout('s1', 'YEARLY');
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ amount: 999_000, currency: 'INR', keyId: 'rzp_test_fake' });
    const ok = await verify('s1', { orderId: c.body.orderId, paymentId: 'pay_abc12345', signature: `sig:${c.body.orderId}:pay_abc12345` });
    expect(ok.status).toBe(200);
    expect(ok.body.subscription.active).toBe(true);
    const sub = await t.db.subscription.findUniqueOrThrow({ where: { hospitalId: h.id } });
    const days = (sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(366);
    expect(await t.db.notification.count({ where: { type: 'PAYMENT_SUCCESS' } })).toBe(1);
  });

  it('rejects a forged signature and leaves the plan inactive', async () => {
    await hospitalWithStaff('s1');
    const c = await checkout('s1');
    const bad = await verify('s1', { orderId: c.body.orderId, paymentId: 'pay_abc12345', signature: 'a'.repeat(40) });
    expect(bad.status).toBe(400);
    expect((await api().get('/api/billing').set('Authorization', as('s1'))).body.subscription.active).toBe(false);
  });

  it("another hospital cannot confirm someone else's order", async () => {
    await hospitalWithStaff('s1');
    await hospitalWithStaff('s2');
    const c = await checkout('s1');
    const res = await verify('s2', { orderId: c.body.orderId, paymentId: 'pay_abc12345', signature: `sig:${c.body.orderId}:pay_abc12345` });
    expect(res.status).toBe(404);
  });

  it('confirming twice (browser plus webhook) extends the period only once', async () => {
    const h = await hospitalWithStaff('s1');
    const c = await checkout('s1');
    const body = { orderId: c.body.orderId, paymentId: 'pay_abc12345', signature: `sig:${c.body.orderId}:pay_abc12345` };
    await verify('s1', body);
    await verify('s1', body);
    const hook = await webhook(paidEvent(c.body.orderId, 'pay_abc12345'));
    expect(hook.status).toBe(200);
    const sub = await t.db.subscription.findUniqueOrThrow({ where: { hospitalId: h.id } });
    expect((sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000).toBeLessThan(31);
    expect(await t.db.notification.count({ where: { type: 'PAYMENT_SUCCESS' } })).toBe(1);
  });

  it('the webhook alone activates Pro when the customer closes the tab, and rejects bad signatures', async () => {
    await hospitalWithStaff('s1');
    const c = await checkout('s1');
    expect((await webhook(paidEvent(c.body.orderId, 'pay_xyz98765'), 'wrong')).status).toBe(400);
    expect((await api().get('/api/billing').set('Authorization', as('s1'))).body.subscription.active).toBe(false);
    expect((await webhook(paidEvent(c.body.orderId, 'pay_xyz98765'))).status).toBe(200);
    expect((await api().get('/api/billing').set('Authorization', as('s1'))).body.subscription.active).toBe(true);
    expect((await webhook(paidEvent('order_unknown', 'pay_1'))).status).toBe(200); // unknown orders are ignored, not retried forever
  });

  it('renewing early stacks on top of the remaining time', async () => {
    const h = await hospitalWithStaff('s1');
    for (const n of [1, 2]) {
      const c = await checkout('s1');
      await verify('s1', { orderId: c.body.orderId, paymentId: `pay_stack${n}0000`, signature: `sig:${c.body.orderId}:pay_stack${n}0000` });
    }
    const sub = await t.db.subscription.findUniqueOrThrow({ where: { hospitalId: h.id } });
    expect((sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000).toBeGreaterThan(59);
  });

  it('only verified hospital staff can check out, and billing off means no checkout', async () => {
    await hospitalWithStaff('pending', { status: 'PENDING' });
    expect((await checkout('pending')).status).toBe(403);
    await api().post('/api/users/onboard').set('Authorization', as('d1')).send(donorPayload());
    expect((await checkout('d1')).status).toBe(403);
    await hospitalWithStaff('s1');
    t.payments.enabled = false;
    expect((await checkout('s1')).status).toBe(400);
  });
});

describe('plan limits', () => {
  it('free hospitals are blocked from analytics and forecast, Pro unlocks them', async () => {
    await hospitalWithStaff('s1');
    for (const path of ['/api/analytics/hospital', '/api/analytics/forecast', '/api/ai/forecast']) {
      const res = await api().get(path).set('Authorization', as('s1'));
      expect(res.status).toBe(402);
      expect(res.body.error.code).toBe('plan_required');
    }
    const c = await checkout('s1');
    await verify('s1', { orderId: c.body.orderId, paymentId: 'pay_unlock00', signature: `sig:${c.body.orderId}:pay_unlock00` });
    for (const path of ['/api/analytics/hospital', '/api/analytics/forecast', '/api/ai/forecast']) {
      expect((await api().get(path).set('Authorization', as('s1'))).status).toBe(200);
    }
  });

  it('free hospitals can run two active camps, the third needs Pro', async () => {
    await hospitalWithStaff('s1');
    expect((await camp('s1', 1)).status).toBe(201);
    expect((await camp('s1', 2)).status).toBe(201);
    const third = await camp('s1', 3);
    expect(third.status).toBe(402);
    expect(third.body.error.code).toBe('plan_required');
  });

  it('an expired subscription locks Pro features again', async () => {
    const h = await hospitalWithStaff('s1');
    await t.db.subscription.create({ data: { hospitalId: h.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() - 1000) } });
    expect((await api().get('/api/analytics/hospital').set('Authorization', as('s1'))).status).toBe(402);
  });

  it('without Razorpay keys nothing is locked', async () => {
    t.payments.enabled = false;
    await hospitalWithStaff('s1');
    expect((await api().get('/api/analytics/hospital').set('Authorization', as('s1'))).status).toBe(200);
    for (let n = 1; n <= 3; n++) expect((await camp('s1', n)).status).toBe(201);
  });
});

describe('admin billing summary', () => {
  it('shows revenue and recent payments to admins only', async () => {
    await hospitalWithStaff('s1');
    const c = await checkout('s1');
    await verify('s1', { orderId: c.body.orderId, paymentId: 'pay_rev000001', signature: `sig:${c.body.orderId}:pay_rev000001` });
    await api().get('/api/dashboard').set('Authorization', t.auth.as('admin1', { email: 'admin@bloodbridge.test' }));
    const res = await api().get('/api/admin/billing').set('Authorization', as('admin1'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ revenuePaise: 99_900, paidCount: 1, activeSubscriptions: 1 });
    expect(res.body.recent[0].hospital).toBe('Hospital s1');
    expect((await api().get('/api/admin/billing').set('Authorization', as('s1'))).status).toBe(403);
  });
});
