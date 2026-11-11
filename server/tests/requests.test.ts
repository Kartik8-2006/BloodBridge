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
const requester = (id: string) =>
  api().post('/api/users/onboard').set('Authorization', as(id)).send({ role: 'REQUESTER', phone: '+919811111111', city: 'Amritsar', ...AMRITSAR });

async function hospitalWithStaff(staffId: string, over: Record<string, unknown> = {}) {
  await api().post('/api/users/onboard').set('Authorization', as(staffId)).send({ role: 'HOSPITAL', phone: '+919822222222' });
  const h = await t.db.hospital.create({
    data: { source: 'PLATFORM', name: `Hospital ${staffId}`, lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED', ...over },
  });
  await t.db.user.update({ where: { clerkId: staffId }, data: { hospitalId: h.id } });
  return h;
}

const body = (hospitalId: string, over: Record<string, unknown> = {}) => ({
  hospitalId,
  patientName: 'Ravi Kumar',
  bloodGroup: 'AB_NEG',
  unitsNeeded: 1,
  urgency: 'URGENT',
  neededBy: new Date(Date.now() + 6 * 3600_000).toISOString(),
  ...over,
});

const createRequest = (id: string, hospitalId: string, over: Record<string, unknown> = {}) =>
  api().post('/api/requests').set('Authorization', as(id)).send(body(hospitalId, over));

describe('matching', () => {
  it('invites only compatible, available, eligible, nearby donors', async () => {
    const h = await hospitalWithStaff('staff1');
    await requester('req1');
    await donor('d-oneg', { bloodGroup: 'O_NEG' });
    await donor('d-aneg', { bloodGroup: 'A_NEG' });
    await donor('d-apos', { bloodGroup: 'A_POS' }); // not compatible with AB-
    await donor('d-recent', { bloodGroup: 'O_NEG', lastDonationAt: new Date(Date.now() - 5 * 86400_000).toISOString() }); // too soon
    await donor('d-away', { bloodGroup: 'O_NEG', lat: 28.61, lng: 77.2 }); // Delhi
    await donor('d-off', { bloodGroup: 'B_NEG' });
    await api().patch('/api/donors/me/availability').set('Authorization', as('d-off')).send({ available: false });

    const res = await createRequest('req1', h.id);
    expect(res.status).toBe(201);
    expect(res.body.alerted).toBe(2);

    const invited = await t.db.donorResponse.findMany({ include: { donor: true } });
    expect(invited.map((i) => i.donor.clerkId).sort()).toEqual(['d-aneg', 'd-oneg']);
    expect(await t.db.notification.count({ where: { type: 'REQUEST_MATCH' } })).toBe(2);
  });

  it('never invites the requester themselves', async () => {
    const h = await hospitalWithStaff('staff1');
    await donor('both', { bloodGroup: 'O_NEG' });
    await t.db.user.update({ where: { clerkId: 'both' }, data: { role: 'REQUESTER' } });
    const res = await createRequest('both', h.id);
    expect(res.status).toBe(201);
    expect(res.body.alerted).toBe(0);
  });

  it('only allows verified hospitals and validates input', async () => {
    const h = await hospitalWithStaff('staff1', { status: 'PENDING' });
    await requester('req1');
    expect((await createRequest('req1', h.id)).status).toBe(400);
    const ok = await hospitalWithStaff('staff2');
    expect((await createRequest('req1', ok.id, { unitsNeeded: 0 })).status).toBe(400);
    expect((await createRequest('req1', ok.id, { neededBy: new Date(Date.now() - 86400_000).toISOString() })).status).toBe(400);
    expect((await createRequest('req1', ok.id, { bloodGroup: 'X' })).status).toBe(400);
  });

  it('limits open requests per requester', async () => {
    const h = await hospitalWithStaff('staff1');
    await requester('req1');
    for (let i = 0; i < 3; i++) expect((await createRequest('req1', h.id)).status).toBe(201);
    expect((await createRequest('req1', h.id)).status).toBe(409);
  });

  it('escalation widens the radius and alerts new donors only once', async () => {
    const h = await hospitalWithStaff('staff1');
    await requester('req1');
    // ~25 km north: outside URGENT 20 km, inside the widened 30 km.
    await donor('far', { bloodGroup: 'O_NEG', lat: AMRITSAR.lat + 0.225, lng: AMRITSAR.lng });
    const created = await createRequest('req1', h.id);
    expect(created.body.alerted).toBe(0);
    const esc = await api().post(`/api/requests/${created.body.id}/escalate`).set('Authorization', as('req1'));
    expect(esc.status).toBe(200);
    expect(esc.body).toMatchObject({ alerted: 1, radiusKm: 30 });
    const again = await api().post(`/api/requests/${created.body.id}/escalate`).set('Authorization', as('req1'));
    expect(again.body.alerted).toBe(0);
  });
});

describe('donor response and handshake', () => {
  async function setup(units = 1) {
    const h = await hospitalWithStaff('staff1');
    await requester('req1');
    await donor('don1', { bloodGroup: 'O_NEG' });
    const created = await createRequest('req1', h.id, { unitsNeeded: units });
    const inbox = await api().get('/api/requests/inbox').set('Authorization', as('don1'));
    return { h, requestId: created.body.id as string, responseId: inbox.body.active[0].responseId as string };
  }

  it('walks the full flow: invite → accept → code at the desk → certificate', async () => {
    const { requestId, responseId } = await setup();

    const detail = await api().get(`/api/requests/${requestId}`).set('Authorization', as('don1'));
    expect(detail.body.viewer).toBe('DONOR');
    expect(detail.body.contactPhone).toBeNull(); // hidden until the donor commits
    expect(detail.body.requester).toBeUndefined();

    const accepted = await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    expect(accepted.status).toBe(200);
    expect(accepted.body.code).toMatch(/^\d{6}$/);
    const stored = await t.db.donorResponse.findUniqueOrThrow({ where: { id: responseId } });
    expect(stored.codeHash).not.toContain(accepted.body.code); // only the hash is stored

    const owner = await api().get(`/api/requests/${requestId}`).set('Authorization', as('req1'));
    expect(owner.body.donors).toHaveLength(1);
    expect(owner.body.donors[0]).toMatchObject({ status: 'ACCEPTED', bloodGroup: 'O_NEG' });
    expect(owner.body.donors[0].phone).toBe('+919811111111'.replace('9811111111', '9876543210'));

    const wrong = await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('staff1')).send({ code: accepted.body.code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe('invalid_code');

    const ok = await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('staff1')).send({ code: accepted.body.code });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('FULFILLED');
    expect(ok.body.donation.certificateNo).toMatch(/^BB-\d{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const replay = await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('staff1')).send({ code: accepted.body.code });
    expect(replay.status).toBe(409);

    const profile = await t.db.donorProfile.findFirstOrThrow({ where: { user: { clerkId: 'don1' } } });
    expect(profile.lastDonationAt).not.toBeNull();

    const donations = await api().get('/api/donations').set('Authorization', as('don1'));
    expect(donations.body.totals).toEqual({ donations: 1, units: 1, livesImpacted: 3 });
    const cert = await api().get(`/api/donations/${donations.body.items[0].id}`).set('Authorization', as('don1'));
    expect(cert.status).toBe(200);

    const verify = await api().get(`/api/public/certificates/${ok.body.donation.certificateNo}`);
    expect(verify.body).toMatchObject({ valid: true, bloodGroup: 'O_NEG' });
    expect(JSON.stringify(verify.body)).not.toContain('don1@'); // no email or full identity
    expect((await api().get('/api/public/certificates/BB-2026-AAAA-BBBB')).status).toBe(404);

    expect(await t.db.notification.count({ where: { type: 'DONATION_COMPLETE' } })).toBe(1);
  });

  it('keeps a donor from donating again before the gap has passed', async () => {
    const { requestId, responseId, h } = await setup();
    const a = await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('staff1')).send({ code: a.body.code });
    await t.db.bloodRequest.deleteMany({});
    await requester('req2');
    const next = await createRequest('req2', h.id);
    expect(next.body.alerted).toBe(0);
  });

  it('only the hospital that owns the request can verify a code', async () => {
    const { requestId, responseId } = await setup();
    const a = await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    await hospitalWithStaff('staff2');
    const res = await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('staff2')).send({ code: a.body.code });
    expect(res.status).toBe(403);
    const asRequester = await api().post(`/api/requests/${requestId}/handshake`).set('Authorization', as('req1')).send({ code: a.body.code });
    expect(asRequester.status).toBe(403);
  });

  it('stops over-commitment and double commitments', async () => {
    const { h, requestId, responseId } = await setup(1);
    await donor('don2', { bloodGroup: 'O_NEG' });
    // don2 joins late via escalation-style invite
    await t.db.donorResponse.create({ data: { requestId, donorId: (await t.db.user.findUniqueOrThrow({ where: { clerkId: 'don2' } })).id, distanceKm: 1 } });
    const inbox2 = await api().get('/api/requests/inbox').set('Authorization', as('don2'));

    expect((await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'))).status).toBe(200);
    const late = await api().post(`/api/responses/${inbox2.body.active[0].responseId}/accept`).set('Authorization', as('don2'));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('enough_donors');

    // don1 cannot hold a second open commitment
    await requester('req2');
    const other = await createRequest('req2', h.id, { unitsNeeded: 2 });
    expect(other.status).toBe(201);
    const don1 = await t.db.user.findUniqueOrThrow({ where: { clerkId: 'don1' } });
    expect(await t.db.donorResponse.count({ where: { requestId: other.body.id, donorId: don1.id } })).toBe(0); // don1 is busy, never matched
  });

  it('decline, withdraw and rotate code behave', async () => {
    const { responseId } = await setup(2);
    const code1 = await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    const rotated = await api().post(`/api/responses/${responseId}/code`).set('Authorization', as('don1'));
    expect(rotated.status).toBe(200);
    expect(rotated.body.code).toMatch(/^\d{6}$/);
    expect(code1.body.code).toBeDefined();
    expect((await api().post(`/api/responses/${responseId}/decline`).set('Authorization', as('don1'))).status).toBe(409);
    expect((await api().post(`/api/responses/${responseId}/withdraw`).set('Authorization', as('don1'))).status).toBe(200);
    expect((await api().post(`/api/responses/${responseId}/code`).set('Authorization', as('don1'))).status).toBe(409);
  });

  it('other donors cannot touch someone else’s invitation', async () => {
    const { responseId } = await setup();
    await donor('don9', { bloodGroup: 'O_NEG' });
    expect((await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don9'))).status).toBe(404);
  });

  it('cancelling closes the request and releases donors', async () => {
    const { requestId, responseId } = await setup();
    await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    expect((await api().post(`/api/requests/${requestId}/cancel`).set('Authorization', as('staff1'))).status).toBe(200);
    const row = await t.db.bloodRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe('CANCELLED');
    const resp = await t.db.donorResponse.findUniqueOrThrow({ where: { id: responseId } });
    expect(resp.status).toBe('CANCELLED');
    expect(resp.codeHash).toBeNull();
    const again = await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('don1'));
    expect(again.status).toBe(409);
    expect((await api().post(`/api/requests/${requestId}/cancel`).set('Authorization', as('req1'))).status).toBe(409);
  });

  it('an outsider cannot read or cancel a request', async () => {
    const { requestId } = await setup();
    await requester('nosy');
    expect((await api().get(`/api/requests/${requestId}`).set('Authorization', as('nosy'))).status).toBe(404);
    expect((await api().post(`/api/requests/${requestId}/cancel`).set('Authorization', as('nosy'))).status).toBe(403);
  });

  it('overdue requests expire and drop out of the donor inbox', async () => {
    const { requestId } = await setup();
    await t.db.bloodRequest.update({ where: { id: requestId }, data: { neededBy: new Date(Date.now() - 1000) } });
    const inbox = await api().get('/api/requests/inbox').set('Authorization', as('don1'));
    expect(inbox.body.active).toHaveLength(0);
    expect(inbox.body.history).toHaveLength(1);
    expect((await t.db.bloodRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe('EXPIRED');
  });
});

describe('role views and dashboards', () => {
  it('lists requests per role and feeds the dashboards', async () => {
    const h = await hospitalWithStaff('staff1');
    await requester('req1');
    await donor('don1', { bloodGroup: 'O_NEG' });
    await createRequest('req1', h.id);

    const mineReq = await api().get('/api/requests/mine').set('Authorization', as('req1'));
    expect(mineReq.body.items).toHaveLength(1);
    const mineHosp = await api().get('/api/requests/mine?status=active').set('Authorization', as('staff1'));
    expect(mineHosp.body.items).toHaveLength(1);
    expect((await api().get('/api/requests/mine').set('Authorization', as('don1'))).status).toBe(403);

    const dd = await api().get('/api/dashboard').set('Authorization', as('don1'));
    expect(dd.body.activity).toMatchObject({ invitations: 1, accepted: 0, donations: 0 });
    expect((await api().get('/api/dashboard').set('Authorization', as('req1'))).body.requests).toEqual({ active: 1, fulfilled: 0 });
    expect((await api().get('/api/dashboard').set('Authorization', as('staff1'))).body.requests).toEqual({ open: 1, donatedThisMonth: 0 });
  });

  it('hospital staff can raise a request for their own hospital', async () => {
    const h = await hospitalWithStaff('staff1');
    const res = await createRequest('staff1', 'ignored-id-from-client');
    expect(res.status).toBe(201);
    const row = await t.db.bloodRequest.findFirstOrThrow({});
    expect(row.hospitalId).toBe(h.id);
  });
});

describe('public site endpoints', () => {
  it('subscribes an email once and rejects bad input', async () => {
    expect((await api().post('/api/public/subscribe').send({ email: 'Hello@Example.com' })).status).toBe(201);
    expect((await api().post('/api/public/subscribe').send({ email: 'hello@example.com' })).status).toBe(201);
    expect(await t.db.subscriber.count()).toBe(1);
    expect((await t.db.subscriber.findFirstOrThrow()).email).toBe('hello@example.com');
    expect((await api().post('/api/public/subscribe').send({ email: 'nope' })).status).toBe(400);
  });

  it('lists only verified facilities on the public network feed', async () => {
    await hospitalWithStaff('s1');
    await hospitalWithStaff('s2', { status: 'PENDING', name: 'Hidden Pending' });
    const res = await api().get('/api/public/network');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain('Hidden Pending');
  });
});
