import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AMRITSAR, buildTestApp, donorPayload } from './helpers/app.js';

const t = buildTestApp();
const api = () => request(t.app);
const as = (id: string) => t.auth.as(id);

beforeAll(() => t.reset());
beforeEach(() => t.reset());
afterAll(() => t.db.$disconnect());

const donor = (id: string, over: Record<string, unknown> = {}) => api().post('/api/users/onboard').set('Authorization', as(id)).send(donorPayload(over));
const requester = (id: string) => api().post('/api/users/onboard').set('Authorization', as(id)).send({ role: 'REQUESTER', phone: '+919811111111', city: 'Amritsar', ...AMRITSAR });

async function hospitalWithStaff(staffId: string, over: Record<string, unknown> = {}) {
  await api().post('/api/users/onboard').set('Authorization', as(staffId)).send({ role: 'HOSPITAL', phone: '+919822222222' });
  const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: `Hospital ${staffId}`, lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED', ...over } });
  await t.db.user.update({ where: { clerkId: staffId }, data: { hospitalId: h.id } });
  return h;
}

const adjust = (id: string, body: Record<string, unknown>) => api().post('/api/inventory/adjust').set('Authorization', as(id)).send(body);
const startsIn = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();
const campBody = (over: Record<string, unknown> = {}) => ({ title: 'Community Blood Camp', venue: 'Town Hall', startsAt: startsIn(48), endsAt: startsIn(52), capacity: 2, ...over });

describe('inventory', () => {
  it('returns all eight groups and tracks received and issued units', async () => {
    await hospitalWithStaff('s1');
    const empty = await api().get('/api/inventory').set('Authorization', as('s1'));
    expect(empty.status).toBe(200);
    expect(empty.body.stock).toHaveLength(8);
    expect(empty.body.total).toBe(0);

    expect((await adjust('s1', { bloodGroup: 'O_NEG', delta: 12, reason: 'RECEIVED' })).body.units).toBe(12);
    expect((await adjust('s1', { bloodGroup: 'O_NEG', delta: -3, reason: 'ISSUED', note: 'Surgery' })).body.units).toBe(9);
    const res = await api().get('/api/inventory').set('Authorization', as('s1'));
    expect(res.body.stock.find((x: { bloodGroup: string }) => x.bloodGroup === 'O_NEG')).toMatchObject({ units: 9, status: 'OK' });
    const log = await api().get('/api/inventory/log').set('Authorization', as('s1'));
    expect(log.body.log).toHaveLength(2);
  });

  it('never lets stock go negative and validates direction', async () => {
    await hospitalWithStaff('s1');
    await adjust('s1', { bloodGroup: 'A_POS', delta: 2, reason: 'RECEIVED' });
    expect((await adjust('s1', { bloodGroup: 'A_POS', delta: -3, reason: 'ISSUED' })).status).toBe(400);
    expect((await adjust('s1', { bloodGroup: 'A_POS', delta: -1, reason: 'RECEIVED' })).status).toBe(400);
    expect((await adjust('s1', { bloodGroup: 'A_POS', delta: 1, reason: 'EXPIRED' })).status).toBe(400);
    expect((await adjust('s1', { bloodGroup: 'A_POS', delta: 0, reason: 'ADJUSTED' })).status).toBe(400);
    expect((await adjust('s1', { bloodGroup: 'X', delta: 1, reason: 'RECEIVED' })).status).toBe(400);
  });

  it('alerts staff once when stock falls to the threshold', async () => {
    await hospitalWithStaff('s1');
    await adjust('s1', { bloodGroup: 'B_POS', delta: 8, reason: 'RECEIVED' });
    await adjust('s1', { bloodGroup: 'B_POS', delta: -2, reason: 'ISSUED' }); // 6, above 5
    expect(await t.db.notification.count({ where: { type: 'LOW_STOCK' } })).toBe(0);
    await adjust('s1', { bloodGroup: 'B_POS', delta: -1, reason: 'ISSUED' }); // 5 = threshold
    expect(await t.db.notification.count({ where: { type: 'LOW_STOCK' } })).toBe(1);
    await adjust('s1', { bloodGroup: 'B_POS', delta: -1, reason: 'ISSUED' }); // already low, no repeat
    expect(await t.db.notification.count({ where: { type: 'LOW_STOCK' } })).toBe(1);
  });

  it('is only for verified hospital staff, and the public view hides counts', async () => {
    await hospitalWithStaff('pending', { status: 'PENDING' });
    expect((await api().get('/api/inventory').set('Authorization', as('pending'))).status).toBe(403);
    await donor('d1');
    expect((await api().get('/api/inventory').set('Authorization', as('d1'))).status).toBe(403);
    expect((await api().get('/api/inventory')).status).toBe(401);

    const h = await hospitalWithStaff('s1');
    await adjust('s1', { bloodGroup: 'A_NEG', delta: 20, reason: 'RECEIVED' });
    const pub = await api().get(`/api/inventory/status/${h.id}`).set('Authorization', as('d1'));
    expect(pub.status).toBe(200);
    expect(pub.body.stock.find((x: { bloodGroup: string }) => x.bloodGroup === 'A_NEG')).toEqual({ bloodGroup: 'A_NEG', status: 'OK' });
    expect(JSON.stringify(pub.body)).not.toContain('units');
  });

  it('one hospital cannot touch another hospital stock', async () => {
    await hospitalWithStaff('s1');
    const h2 = await hospitalWithStaff('s2');
    await adjust('s2', { bloodGroup: 'O_POS', delta: 4, reason: 'RECEIVED' });
    await adjust('s1', { bloodGroup: 'O_POS', delta: 7, reason: 'RECEIVED' });
    const row = await t.db.inventoryItem.findFirstOrThrow({ where: { hospitalId: h2.id, bloodGroup: 'O_POS' } });
    expect(row.units).toBe(4);
  });
});

describe('inventory batch', () => {
  const batch = (id: string, body: Record<string, unknown>) => api().post('/api/inventory/batch').set('Authorization', as(id)).send(body);

  it('applies several groups in one save and logs each', async () => {
    await hospitalWithStaff('s1');
    const res = await batch('s1', { note: 'Morning count', changes: [
      { bloodGroup: 'A_POS', delta: 6, reason: 'RECEIVED' },
      { bloodGroup: 'O_NEG', delta: 10, reason: 'RECEIVED' },
    ] });
    expect(res.status).toBe(200);
    const inv = await api().get('/api/inventory').set('Authorization', as('s1'));
    expect(inv.body.total).toBe(16);
    const log = await api().get('/api/inventory/log').set('Authorization', as('s1'));
    expect(log.body.log).toHaveLength(2);
    expect(log.body.log[0].note).toBe('Morning count');
  });

  it('is all or nothing: one bad change rolls the others back', async () => {
    await hospitalWithStaff('s1');
    await adjust('s1', { bloodGroup: 'B_POS', delta: 2, reason: 'RECEIVED' });
    const res = await batch('s1', { changes: [
      { bloodGroup: 'A_POS', delta: 5, reason: 'RECEIVED' },
      { bloodGroup: 'B_POS', delta: -9, reason: 'ISSUED' },
    ] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only 2');
    const inv = await api().get('/api/inventory').set('Authorization', as('s1'));
    expect(inv.body.stock.find((x: { bloodGroup: string }) => x.bloodGroup === 'A_POS').units).toBe(0);
    expect(inv.body.total).toBe(2);
  });

  it('rejects duplicates, wrong directions and empty saves', async () => {
    await hospitalWithStaff('s1');
    expect((await batch('s1', { changes: [] })).status).toBe(400);
    expect((await batch('s1', { changes: [{ bloodGroup: 'A_POS', delta: 1, reason: 'RECEIVED' }, { bloodGroup: 'A_POS', delta: 1, reason: 'RECEIVED' }] })).status).toBe(400);
    expect((await batch('s1', { changes: [{ bloodGroup: 'A_POS', delta: 3, reason: 'ISSUED' }] })).status).toBe(400);
    await donor('d1');
    expect((await batch('d1', { changes: [{ bloodGroup: 'A_POS', delta: 1, reason: 'RECEIVED' }] })).status).toBe(403);
  });
});

describe('camps', () => {
  it('verified hospitals create camps, validated, and nearby donors are alerted', async () => {
    await hospitalWithStaff('s1');
    await donor('near');
    await donor('far', { lat: 28.61, lng: 77.2, city: 'Delhi' });
    const bad = await api().post('/api/camps').set('Authorization', as('s1')).send(campBody({ startsAt: startsIn(-5) }));
    expect(bad.status).toBe(400);
    expect((await api().post('/api/camps').set('Authorization', as('s1')).send(campBody({ endsAt: startsIn(40) }))).status).toBe(400);
    expect((await api().post('/api/camps').set('Authorization', as('s1')).send(campBody({ capacity: 0 }))).status).toBe(400);

    const ok = await api().post('/api/camps').set('Authorization', as('s1')).send(campBody());
    expect(ok.status).toBe(201);
    expect(ok.body.alerted).toBe(1);
    expect(await t.db.notification.count({ where: { type: 'CAMP_NEW' } })).toBe(1);

    await hospitalWithStaff('pend', { status: 'PENDING' });
    expect((await api().post('/api/camps').set('Authorization', as('pend')).send(campBody())).status).toBe(403);
  });

  it('public list shows only upcoming camps of verified hospitals', async () => {
    await hospitalWithStaff('s1');
    await api().post('/api/camps').set('Authorization', as('s1')).send(campBody());
    const p = await hospitalWithStaff('pend', { status: 'PENDING' });
    await t.db.camp.create({ data: { hospitalId: p.id, title: 'Hidden', venue: 'x', city: 'Amritsar', lat: 1, lng: 1, startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 90000_000), capacity: 5 } });
    const res = await api().get('/api/camps');
    expect(res.status).toBe(200);
    expect(res.body.camps.map((c: { title: string }) => c.title)).toEqual(['Community Blood Camp']);
    expect((await api().get('/api/camps?city=delhi')).body.camps).toHaveLength(0);
    expect((await api().get('/api/camps?city=amrit')).body.camps).toHaveLength(1);
  });

  it('donors register once, capacity is enforced, and they can cancel and re-register', async () => {
    await hospitalWithStaff('s1');
    const camp = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody({ capacity: 2 }))).body.camp;
    await donor('d1');
    await donor('d2');
    await donor('d3');
    const reg = (id: string) => api().post(`/api/camps/${camp.id}/register`).set('Authorization', as(id));
    expect((await reg('d1')).status).toBe(201);
    expect((await reg('d1')).status).toBe(409);
    expect((await reg('d2')).status).toBe(201);
    const full = await reg('d3');
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('camp_full');

    expect((await api().delete(`/api/camps/${camp.id}/register`).set('Authorization', as('d1'))).status).toBe(200);
    expect((await reg('d3')).status).toBe(201); // the freed spot
    expect((await api().get(`/api/camps/${camp.id}`)).body.camp.spotsLeft).toBe(0);
  });

  it('checks eligibility on the camp day, not today', async () => {
    await hospitalWithStaff('s1');
    // Donated 10 days ago: not eligible in 2 days, eligible after 90 days.
    await donor('d1', { lastDonationAt: new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10) });
    const soon = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody())).body.camp;
    const later = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody({ startsAt: startsIn(24 * 100), endsAt: startsIn(24 * 100 + 4) }))).body.camp;
    const a = await api().post(`/api/camps/${soon.id}/register`).set('Authorization', as('d1'));
    expect(a.status).toBe(409);
    expect(a.body.error.code).toBe('not_eligible');
    expect((await api().post(`/api/camps/${later.id}/register`).set('Authorization', as('d1'))).status).toBe(201);
  });

  it('only donors register; hospital staff and requesters cannot', async () => {
    await hospitalWithStaff('s1');
    const camp = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody())).body.camp;
    await requester('r1');
    expect((await api().post(`/api/camps/${camp.id}/register`).set('Authorization', as('r1'))).status).toBe(403);
    expect((await api().post(`/api/camps/${camp.id}/register`).set('Authorization', as('s1'))).status).toBe(403);
    expect((await api().post(`/api/camps/${camp.id}/register`)).status).toBe(401);
  });

  it('cancelling notifies registered donors and closes registration', async () => {
    await hospitalWithStaff('s1');
    const camp = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody())).body.camp;
    await donor('d1');
    await donor('d2');
    await api().post(`/api/camps/${camp.id}/register`).set('Authorization', as('d1'));
    const res = await api().post(`/api/camps/${camp.id}/cancel`).set('Authorization', as('s1'));
    expect(res.status).toBe(200);
    expect(await t.db.notification.count({ where: { type: 'CAMP_UPDATE' } })).toBe(1);
    expect((await api().post(`/api/camps/${camp.id}/register`).set('Authorization', as('d2'))).status).toBe(409);
    expect((await api().get('/api/camps')).body.camps).toHaveLength(0);
  });

  it('another hospital cannot manage or see registrations of this camp', async () => {
    await hospitalWithStaff('s1');
    await hospitalWithStaff('s2');
    const camp = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody())).body.camp;
    expect((await api().post(`/api/camps/${camp.id}/cancel`).set('Authorization', as('s2'))).status).toBe(404);
    expect((await api().get(`/api/camps/${camp.id}/registrations`).set('Authorization', as('s2'))).status).toBe(404);
  });

  it('attendance issues a certificate, updates the donor and adds the unit to stock once', async () => {
    const h = await hospitalWithStaff('s1');
    await donor('d1', { bloodGroup: 'B_POS' });
    const camp = await t.db.camp.create({
      data: { hospitalId: h.id, title: 'Past Camp', venue: 'Hall', city: 'Amritsar', lat: AMRITSAR.lat, lng: AMRITSAR.lng, startsAt: new Date(Date.now() - 3600_000), endsAt: new Date(Date.now() + 3600_000), capacity: 5 },
    });
    const dUser = await t.db.user.findUniqueOrThrow({ where: { clerkId: 'd1' } });
    const reg = await t.db.campRegistration.create({ data: { campId: camp.id, donorId: dUser.id } });

    const list = await api().get(`/api/camps/${camp.id}/registrations`).set('Authorization', as('s1'));
    expect(list.body.registrations[0]).toMatchObject({ bloodGroup: 'B_POS' });
    expect(JSON.stringify(list.body)).not.toContain('98765');

    const res = await api().post(`/api/camps/${camp.id}/registrations/${reg.id}/attendance`).set('Authorization', as('s1')).send({ status: 'ATTENDED' });
    expect(res.status).toBe(200);
    expect(res.body.certificateNo).toMatch(/^BB-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const stock = await t.db.inventoryItem.findFirstOrThrow({ where: { hospitalId: h.id, bloodGroup: 'B_POS' } });
    expect(stock.units).toBe(1);
    expect((await t.db.donorProfile.findFirstOrThrow({ where: { userId: dUser.id } })).lastDonationAt).not.toBeNull();
    expect(await t.db.donation.count()).toBe(1);

    const again = await api().post(`/api/camps/${camp.id}/registrations/${reg.id}/attendance`).set('Authorization', as('s1')).send({ status: 'ATTENDED' });
    expect(again.status).toBe(409);
    expect((await t.db.inventoryItem.findFirstOrThrow({ where: { hospitalId: h.id, bloodGroup: 'B_POS' } })).units).toBe(1);

    const cert = await api().get(`/api/public/certificates/${res.body.certificateNo}`);
    expect(cert.status).toBe(200);
  });

  it('attendance cannot be recorded before the camp starts', async () => {
    await hospitalWithStaff('s1');
    const camp = (await api().post('/api/camps').set('Authorization', as('s1')).send(campBody())).body.camp;
    await donor('d1');
    const reg = (await api().post(`/api/camps/${camp.id}/register`).set('Authorization', as('d1'))).body.registration;
    expect((await api().post(`/api/camps/${camp.id}/registrations/${reg.id}/attendance`).set('Authorization', as('s1')).send({ status: 'ATTENDED' })).status).toBe(409);
  });
});

describe('analytics and forecast', () => {
  it('hospital analytics reports real numbers from requests, donations and the ledger', async () => {
    const h = await hospitalWithStaff('s1');
    await requester('r1');
    await donor('d1', { bloodGroup: 'O_NEG' });
    await adjust('s1', { bloodGroup: 'O_NEG', delta: 10, reason: 'RECEIVED' });
    await adjust('s1', { bloodGroup: 'O_NEG', delta: -4, reason: 'ISSUED' });
    await api().post('/api/requests').set('Authorization', as('r1')).send({ hospitalId: h.id, patientName: 'Ravi Kumar', bloodGroup: 'AB_NEG', unitsNeeded: 2, urgency: 'URGENT', neededBy: startsIn(6) });

    const res = await api().get('/api/analytics/hospital').set('Authorization', as('s1'));
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ requests: 1, unitsReceived30d: 10, unitsIssued30d: 4 });
    expect(res.body.weekly).toHaveLength(8);
    expect(res.body.weekly.reduce((s: number, w: { requests: number }) => s + w.requests, 0)).toBe(1);
    expect(res.body.demandByGroup.find((x: { bloodGroup: string }) => x.bloodGroup === 'AB_NEG').unitsRequested).toBe(2);
    expect(res.body.donationsByMonth).toHaveLength(6);

    expect((await api().get('/api/analytics/hospital').set('Authorization', as('d1'))).status).toBe(403);
  });

  it('forecast is computed from data and ranks a zero-stock group with demand as critical', async () => {
    const h = await hospitalWithStaff('s1');
    await requester('r1');
    await api().post('/api/requests').set('Authorization', as('r1')).send({ hospitalId: h.id, patientName: 'Ravi Kumar', bloodGroup: 'AB_NEG', unitsNeeded: 8, urgency: 'URGENT', neededBy: startsIn(6) });
    await adjust('s1', { bloodGroup: 'O_POS', delta: 50, reason: 'RECEIVED' });

    const res = await api().get('/api/analytics/forecast').set('Authorization', as('s1'));
    expect(res.status).toBe(200);
    const abNeg = res.body.groups.find((g: { bloodGroup: string }) => g.bloodGroup === 'AB_NEG');
    expect(abNeg.risk).toBe('CRITICAL');
    expect(abNeg.expectedWeeklyDemand).toBeGreaterThan(0);
    const oPos = res.body.groups.find((g: { bloodGroup: string }) => g.bloodGroup === 'O_POS');
    expect(oPos.stock).toBe(50);
    expect(oPos.daysOfCover).toBeNull(); // no demand, so no meaningful cover
  });

  it('admin analytics is admin only', async () => {
    await api().get('/api/dashboard').set('Authorization', t.auth.as('admin1', { email: 'admin@bloodbridge.test' }));
    const ok = await api().get('/api/analytics/admin').set('Authorization', as('admin1'));
    expect(ok.status).toBe(200);
    expect(ok.body.weekly).toHaveLength(8);
    await donor('d1');
    expect((await api().get('/api/analytics/admin').set('Authorization', as('d1'))).status).toBe(403);
  });
});

describe('AI', () => {
  it('chat sends a grounded system prompt and returns the reply', async () => {
    t.ai.next = 'You can donate every three months.';
    const res = await api().post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'How often can I donate?' }] });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('You can donate every three months.');
    expect(t.ai.calls[0]!.system).toContain('not a doctor');
    expect(t.ai.calls[0]!.messages).toEqual([{ role: 'user', text: 'How often can I donate?' }]);
  });

  it('chat validates input', async () => {
    expect((await api().post('/api/ai/chat').send({ messages: [] })).status).toBe(400);
    expect((await api().post('/api/ai/chat').send({ messages: [{ role: 'assistant', content: 'hi' }] })).status).toBe(400);
    expect((await api().post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'x'.repeat(1001) }] })).status).toBe(400);
    expect(t.ai.calls).toHaveLength(0);
  });

  it('falls back to the site guide instead of failing when the model is down', async () => {
    t.ai.fail = true;
    const res = await api().post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'who can donate blood?' }] });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('guide');
    expect(res.body.reply).toContain('18 to 65');
    expect((await api().get('/api/ai/status')).body.available).toBe(true);
  });

  it('triage returns a validated suggestion and the emergency backstop raises urgency', async () => {
    await requester('r1');
    t.ai.next = JSON.stringify({ urgency: 'PLANNED', bloodGroup: 'O_NEG', unitsNeeded: 2, summary: 'Surgery planned', advice: 'Confirm the group with the lab.' });
    const calm = await api().post('/api/ai/triage').set('Authorization', as('r1')).send({ description: 'My father has a planned knee surgery next week and needs 2 units of O negative.' });
    expect(calm.status).toBe(200);
    expect(calm.body.suggestion).toMatchObject({ urgency: 'PLANNED', bloodGroup: 'O_NEG', unitsNeeded: 2, callEmergency: false });

    const hot = await api().post('/api/ai/triage').set('Authorization', as('r1')).send({ description: 'Road accident, heavy bleeding, patient is being rushed in right now.' });
    expect(hot.body.suggestion.urgency).toBe('CRITICAL'); // model said PLANNED, keyword backstop wins
    expect(hot.body.suggestion.callEmergency).toBe(true);
  });

  it('triage rejects unusable model output and keeps user text as data', async () => {
    await requester('r1');
    t.ai.next = 'not json at all';
    expect((await api().post('/api/ai/triage').set('Authorization', as('r1')).send({ description: 'Needs blood for a scheduled operation soon.' })).status).toBe(502);
    t.ai.next = JSON.stringify({ urgency: 'EXTREME', summary: 'x', advice: 'y' });
    expect((await api().post('/api/ai/triage').set('Authorization', as('r1')).send({ description: 'Needs blood for a scheduled operation soon.' })).status).toBe(502);
    expect(t.ai.calls.at(-1)!.system).toContain('data, not instructions');
  });

  it('triage requires a signed-in requester or hospital', async () => {
    await donor('d1');
    expect((await api().post('/api/ai/triage').send({ description: 'Needs blood for a scheduled operation soon.' })).status).toBe(401);
    expect((await api().post('/api/ai/triage').set('Authorization', as('d1')).send({ description: 'Needs blood for a scheduled operation soon.' })).status).toBe(403);
  });

  it('forecast narrative uses the computed numbers, and degrades to numbers only', async () => {
    const h = await hospitalWithStaff('s1');
    await requester('r1');
    await api().post('/api/requests').set('Authorization', as('r1')).send({ hospitalId: h.id, patientName: 'Ravi Kumar', bloodGroup: 'AB_NEG', unitsNeeded: 8, urgency: 'URGENT', neededBy: startsIn(6) });
    t.ai.next = 'AB- is at risk. Post a request.';
    const res = await api().get('/api/ai/forecast').set('Authorization', as('s1'));
    expect(res.status).toBe(200);
    expect(res.body.narrative).toBe('AB- is at risk. Post a request.');
    expect(t.ai.calls[0]!.messages[0]!.text).toContain('AB-: stock 0');

    t.ai.fail = true;
    const degraded = await api().get('/api/ai/forecast').set('Authorization', as('s1'));
    expect(degraded.status).toBe(200);
    expect(degraded.body.narrative).toBeNull();
    expect(degraded.body.groups).toHaveLength(8);

    t.ai.enabled = false;
    const off = await api().get('/api/ai/forecast').set('Authorization', as('s1'));
    expect(off.body.aiAvailable).toBe(false);
    expect(off.body.narrative).toBeNull();
  });
});
