import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AMRITSAR, buildTestApp, donorPayload } from './helpers/app.js';

const t = buildTestApp();
const api = () => request(t.app);
const as = (id: string) => t.auth.as(id);

beforeAll(() => t.reset());
beforeEach(() => t.reset());
afterAll(() => t.db.$disconnect());

const requester = (id: string, phone = '+919811111111') => api().post('/api/users/onboard').set('Authorization', as(id)).send({ role: 'REQUESTER', phone, city: 'Amritsar', ...AMRITSAR });
const admin = () => api().get('/api/dashboard').set('Authorization', t.auth.as('admin1', { email: 'admin@bloodbridge.test' }));
const startsIn = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function hospital(staffId: string, over: Record<string, unknown> = {}) {
  await api().post('/api/users/onboard').set('Authorization', as(staffId)).send({ role: 'HOSPITAL', phone: '+919822222222' });
  const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: `Hospital ${staffId}`, lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED', ...over } });
  await t.db.user.update({ where: { clerkId: staffId }, data: { hospitalId: h.id } });
  return h;
}
const raise = (id: string, hospitalId: string, over: Record<string, unknown> = {}) =>
  api().post('/api/requests').set('Authorization', as(id)).send({ hospitalId, patientName: 'Ravi Kumar', bloodGroup: 'O_POS', unitsNeeded: 1, urgency: 'URGENT', neededBy: startsIn(6), ...over });

describe('request screening', () => {
  it('flags the same patient and group requested at two hospitals within a day', async () => {
    const h1 = await hospital('s1');
    const h2 = await hospital('s2');
    await requester('r1');
    expect((await raise('r1', h1.id)).status).toBe(201);
    expect(await t.db.fraudFlag.count()).toBe(0);
    expect((await raise('r1', h2.id)).status).toBe(201);
    const flags = await t.db.fraudFlag.findMany();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ kind: 'request.duplicate_patient', severity: 'MEDIUM', status: 'OPEN' });
  });

  it('does not flag ordinary requests for different patients', async () => {
    const h1 = await hospital('s1');
    const h2 = await hospital('s2');
    await requester('r1');
    await raise('r1', h1.id, { patientName: 'Ravi Kumar' });
    await raise('r1', h2.id, { patientName: 'Sita Devi' });
    expect(await t.db.fraudFlag.count()).toBe(0);
  });

  it('flags one phone number used by three accounts', async () => {
    const h1 = await hospital('s1');
    for (const id of ['r1', 'r2', 'r3']) {
      await requester(id, '+919800000001');
      await raise(id, h1.id, { patientName: `Patient ${id}`, contactPhone: '+919800000001' });
    }
    const flag = await t.db.fraudFlag.findFirstOrThrow({ where: { kind: 'request.shared_phone' } });
    expect(flag.severity).toBe('MEDIUM');
    expect(await t.db.fraudFlag.count({ where: { kind: 'request.shared_phone' } })).toBe(1);
  });
});

describe('licence reuse', () => {
  it('flags a licence number already on another hospital, high severity, and alerts admins', async () => {
    await admin();
    const a = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Real Hospital', lat: 1, lng: 1, status: 'VERIFIED', licenseNumber: 'PB-HSP-2024/0042' } });
    const target = await t.db.hospital.create({ data: { source: 'OSM', osmId: 'node/999', name: 'Copycat Clinic', lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'UNCLAIMED' } });
    await api().post('/api/users/onboard').set('Authorization', as('s9')).send({ role: 'HOSPITAL', phone: '+919822222222' });
    const res = await api()
      .post('/api/hospitals/claim')
      .set('Authorization', as('s9'))
      .field('hospitalId', target.id)
      .field('licenseNumber', 'pb hsp 2024 0042')
      .field('contactPerson', 'Dr Fake')
      .field('contactDesignation', 'Director')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'l.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    const flag = await t.db.fraudFlag.findFirstOrThrow({ where: { kind: 'hospital.licence_reuse' } });
    expect(flag).toMatchObject({ severity: 'HIGH', subjectId: target.id });
    expect(flag.summary).toContain(a.name);
    expect(await t.db.notification.count({ where: { type: 'FRAUD_ALERT' } })).toBeGreaterThan(0);
  });
});

describe('desk code brute force', () => {
  it('locks entry after five wrong codes, flags it, and a locked request rejects even the right code', async () => {
    const h = await hospital('s1');
    await requester('r1');
    await api().post('/api/users/onboard').set('Authorization', as('d1')).send(donorPayload());
    const rq = (await raise('r1', h.id)).body;
    const inbox = await api().get('/api/requests/inbox').set('Authorization', as('d1'));
    const responseId = inbox.body.active[0].responseId as string;
    const code = (await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('d1'))).body.code as string;
    const wrong = code === '000000' ? '111111' : '000000';
    const hs = (c: string) => api().post(`/api/requests/${rq.id}/handshake`).set('Authorization', as('s1')).send({ code: c });

    for (let i = 0; i < 4; i++) expect((await hs(wrong)).status).toBe(400);
    const fifth = await hs(wrong);
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('too_many_attempts');
    expect((await hs(code)).status).toBe(429);
    expect((await t.db.fraudFlag.findFirstOrThrow({ where: { kind: 'handshake.bruteforce' } })).severity).toBe('HIGH');

    await t.db.bloodRequest.update({ where: { id: rq.id }, data: { codeLockedUntil: new Date(Date.now() - 1000) } });
    expect((await hs(code)).status).toBe(200);
  });

  it('a right code resets the miss counter', async () => {
    const h = await hospital('s1');
    await requester('r1');
    await api().post('/api/users/onboard').set('Authorization', as('d1')).send(donorPayload());
    const rq = (await raise('r1', h.id, { unitsNeeded: 2 })).body;
    const responseId = (await api().get('/api/requests/inbox').set('Authorization', as('d1'))).body.active[0].responseId as string;
    const code = (await api().post(`/api/responses/${responseId}/accept`).set('Authorization', as('d1'))).body.code as string;
    const wrong = code === '000000' ? '111111' : '000000';
    const hs = (c: string) => api().post(`/api/requests/${rq.id}/handshake`).set('Authorization', as('s1')).send({ code: c });
    for (let i = 0; i < 3; i++) await hs(wrong);
    expect((await hs(code)).status).toBe(200);
    expect((await t.db.bloodRequest.findUniqueOrThrow({ where: { id: rq.id } })).codeAttempts).toBe(0);
  });
});

describe('admin review and audit log', () => {
  it('lists open flags, confirms one and suspends the account, dismissals stay on record', async () => {
    await admin();
    const h1 = await hospital('s1');
    const h2 = await hospital('s2');
    await requester('r1');
    await raise('r1', h1.id);
    await raise('r1', h2.id);

    const list = await api().get('/api/admin/fraud').set('Authorization', as('admin1'));
    expect(list.status).toBe(200);
    expect(list.body.flags).toHaveLength(1);
    expect(list.body.flags[0].user).toMatchObject({ role: 'REQUESTER', status: 'ACTIVE' });
    expect((await api().get('/api/admin/fraud').set('Authorization', as('r1'))).status).toBe(403);

    const id = list.body.flags[0].id as string;
    expect((await api().post(`/api/admin/fraud/${id}/review`).set('Authorization', as('admin1')).send({ decision: 'CONFIRMED' })).status).toBe(400); // note required
    const done = await api().post(`/api/admin/fraud/${id}/review`).set('Authorization', as('admin1')).send({ decision: 'CONFIRMED', note: 'Called both hospitals, fake patient', suspendUser: true });
    expect(done.body).toEqual({ status: 'CONFIRMED', suspended: true });
    expect((await t.db.user.findUniqueOrThrow({ where: { clerkId: 'r1' } })).status).toBe('SUSPENDED');
    expect((await api().post(`/api/admin/fraud/${id}/review`).set('Authorization', as('admin1')).send({ decision: 'DISMISSED', note: 'again' })).status).toBe(409);
    expect((await api().get('/api/admin/fraud?status=OPEN').set('Authorization', as('admin1'))).body.flags).toHaveLength(0);
    expect((await api().get('/api/admin/fraud?status=CONFIRMED').set('Authorization', as('admin1'))).body.flags).toHaveLength(1);
  });

  it('never suspends an admin through a flag', async () => {
    await admin();
    const adminUser = await t.db.user.findUniqueOrThrow({ where: { clerkId: 'admin1' } });
    const f = await t.db.fraudFlag.create({ data: { kind: 'test', severity: 'LOW', subjectType: 'User', subjectId: adminUser.id, userId: adminUser.id, summary: 'x' } });
    const res = await api().post(`/api/admin/fraud/${f.id}/review`).set('Authorization', as('admin1')).send({ decision: 'CONFIRMED', note: 'check', suspendUser: true });
    expect(res.body.suspended).toBe(false);
    expect((await t.db.user.findUniqueOrThrow({ where: { id: adminUser.id } })).status).toBe('ACTIVE');
  });

  it('audit log is searchable, paged and admin only', async () => {
    await admin();
    for (let i = 0; i < 55; i++) await t.db.auditLog.create({ data: { action: i % 2 ? 'camp.create' : 'inventory.batch', entity: 'X', entityId: String(i) } });
    const first = await api().get('/api/admin/audit').set('Authorization', as('admin1'));
    expect(first.body.entries).toHaveLength(50);
    expect(first.body.nextCursor).toBeTruthy();
    const next = await api().get(`/api/admin/audit?cursor=${first.body.nextCursor}`).set('Authorization', as('admin1'));
    expect(next.body.entries.length).toBeGreaterThan(0);
    expect(next.body.entries.map((e: { id: string }) => e.id)).not.toContain(first.body.entries[0].id);
    const filtered = await api().get('/api/admin/audit?action=camp').set('Authorization', as('admin1'));
    expect(filtered.body.entries.every((e: { action: string }) => e.action.includes('camp'))).toBe(true);
    expect((await api().get('/api/admin/audit').set('Authorization', as('r1'))).status).toBe(403);
  });

  it('dashboard reports the open flag count', async () => {
    await t.db.fraudFlag.create({ data: { kind: 'k', severity: 'LOW', subjectType: 'User', subjectId: 'z', summary: 'x' } });
    await admin();
    const res = await api().get('/api/admin/overview').set('Authorization', as('admin1'));
    expect(res.body.fraudOpen).toBe(1);
  });
});
