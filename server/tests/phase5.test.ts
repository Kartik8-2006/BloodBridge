import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AMRITSAR, buildTestApp, donorPayload } from './helpers/app.js';
import { runJobs } from '../src/services/jobs.js';

const t = buildTestApp();
const api = () => request(t.app);
const as = (id: string) => t.auth.as(id);
const DAY = 86_400_000;

beforeAll(() => t.reset());
beforeEach(() => t.reset());
afterAll(() => t.db.$disconnect());

const donor = async (id: string, lastDonationDaysAgo: number | null) => {
  await api().post('/api/users/onboard').set('Authorization', as(id)).send(donorPayload());
  const u = await t.db.user.findUniqueOrThrow({ where: { clerkId: id } });
  await t.db.donorProfile.update({ where: { userId: u.id }, data: { gender: 'MALE', lastDonationAt: lastDonationDaysAgo === null ? null : new Date(Date.now() - lastDonationDaysAgo * DAY) } });
  return u;
};
const reminders = (userId: string) => t.db.notification.findMany({ where: { userId, type: 'REMINDER' } });

describe('background jobs', () => {
  it('tells a donor once when the waiting period ends', async () => {
    const u = await donor('d1', 92); // men wait 90 days
    const first = await runJobs(t.db);
    expect(first.eligibleAgain).toBe(1);
    expect((await reminders(u.id))[0]!.title).toBe('You can donate again');
    const second = await runJobs(t.db);
    expect(second.eligibleAgain).toBe(0);
    expect(await reminders(u.id)).toHaveLength(1);
  });

  it('does not nudge donors who are still waiting, long eligible, never donated, or paused', async () => {
    const waiting = await donor('d2', 30);
    const longAgo = await donor('d3', 400);
    const never = await donor('d4', null);
    const paused = await donor('d5', 92);
    await t.db.donorProfile.update({ where: { userId: paused.id }, data: { available: false } });
    expect((await runJobs(t.db)).eligibleAgain).toBe(0);
    for (const u of [waiting, longAgo, never, paused]) expect(await reminders(u.id)).toHaveLength(0);
  });

  it('reminds registered donors the day before a camp, once', async () => {
    const u = await donor('d6', null);
    const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Camp Hospital', lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED' } });
    const soon = await t.db.camp.create({ data: { hospitalId: h.id, title: 'Tomorrow Camp', venue: 'Hall', city: 'Amritsar', lat: AMRITSAR.lat, lng: AMRITSAR.lng, startsAt: new Date(Date.now() + 10 * 3600_000), endsAt: new Date(Date.now() + 14 * 3600_000), capacity: 10 } });
    const far = await t.db.camp.create({ data: { hospitalId: h.id, title: 'Far Camp', venue: 'Hall', city: 'Amritsar', lat: AMRITSAR.lat, lng: AMRITSAR.lng, startsAt: new Date(Date.now() + 9 * DAY), endsAt: new Date(Date.now() + 9 * DAY + 3600_000), capacity: 10 } });
    await t.db.campRegistration.createMany({ data: [{ campId: soon.id, donorId: u.id }, { campId: far.id, donorId: u.id }] });
    expect((await runJobs(t.db)).campReminders).toBe(1);
    expect((await runJobs(t.db)).campReminders).toBe(0);
    const rs = await reminders(u.id);
    expect(rs).toHaveLength(1);
    expect(rs[0]!.body).toContain('Tomorrow Camp');
  });

  it('warns hospital staff three days before Pro ends and expires lapsed plans', async () => {
    await api().post('/api/users/onboard').set('Authorization', as('s1')).send({ role: 'HOSPITAL', phone: '+919822222222' });
    const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Pro Hospital', lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED' } });
    const staff = await t.db.user.update({ where: { clerkId: 's1' }, data: { hospitalId: h.id } });
    const sub = await t.db.subscription.create({ data: { hospitalId: h.id, status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 2 * DAY) } });
    expect((await runJobs(t.db)).proExpiring).toBe(1);
    expect((await runJobs(t.db)).proExpiring).toBe(0);
    expect((await reminders(staff.id))[0]!.data).toMatchObject({ link: '/app/billing' });
    await t.db.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - DAY) } });
    await runJobs(t.db);
    expect((await t.db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe('EXPIRED');
  });

  it('expires overdue open requests', async () => {
    const u = await donor('d7', null);
    const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'H', lat: AMRITSAR.lat, lng: AMRITSAR.lng, status: 'VERIFIED' } });
    const r = await t.db.bloodRequest.create({ data: { requesterId: u.id, hospitalId: h.id, patientName: 'X', bloodGroup: 'O_POS', unitsNeeded: 1, urgency: 'PLANNED', neededBy: new Date(Date.now() - DAY), contactPhone: '+919800000000' } });
    expect((await runJobs(t.db)).expiredRequests).toBe(1);
    expect((await t.db.bloodRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('EXPIRED');
  });

  it('only admins can trigger the sweep by hand', async () => {
    await donor('d8', null);
    expect((await api().post('/api/admin/jobs/run').set('Authorization', as('d8'))).status).toBe(403);
    expect((await api().post('/api/admin/jobs/run')).status).toBe(401);
    t.auth.as('boss', { email: 'admin@bloodbridge.test' });
    await api().get('/api/dashboard').set('Authorization', as('boss'));
    const res = await api().post('/api/admin/jobs/run').set('Authorization', as('boss'));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('eligibleAgain');
  });
});

describe('access sweep', () => {
  const protectedGets = ['/api/users/me', '/api/notifications', '/api/requests', '/api/inventory', '/api/billing', '/api/analytics/hospital', '/api/admin/overview', '/api/admin/fraud', '/api/admin/audit', '/api/admin/billing', '/api/admin/users', '/api/camps/mine', '/api/exports/donations.csv', '/api/exports/inventory.csv'];
  const protectedPosts = ['/api/requests', '/api/inventory/batch', '/api/inventory/adjust', '/api/billing/checkout', '/api/billing/verify', '/api/admin/jobs/run', '/api/ai/triage', '/api/camps'];

  it.each(protectedGets)('GET %s needs a login', async (path) => {
    const res = await api().get(path);
    expect(res.status).toBe(401);
  });
  it.each(protectedPosts)('POST %s needs a login', async (path) => {
    const res = await api().post(path).send({});
    expect(res.status).toBe(401);
  });

  it('a donor is refused every hospital and admin tool', async () => {
    await donor('d9', null);
    for (const path of ['/api/inventory', '/api/billing', '/api/analytics/hospital', '/api/admin/overview', '/api/admin/fraud', '/api/admin/audit', '/api/admin/billing', '/api/exports/donations.csv', '/api/exports/inventory.csv']) {
      const res = await api().get(path).set('Authorization', as('d9'));
      expect(res.status, path).toBe(403);
    }
  });
});

describe('CSV exports', () => {
  it('a verified hospital downloads its own donations and stock log, with formula-safe cells', async () => {
    await api().post('/api/users/onboard').set('Authorization', as('s2')).send({ role: 'HOSPITAL', phone: '+919822222222' });
    const h = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Export Hospital', lat: AMRITSAR.lat, lng: AMRITSAR.lng, city: 'Amritsar', status: 'VERIFIED' } });
    await t.db.user.update({ where: { clerkId: 's2' }, data: { hospitalId: h.id } });
    const u = await donor('d10', null);
    await t.db.user.update({ where: { id: u.id }, data: { name: '=HYPERLINK("http://evil","x")' } });
    await t.db.donation.create({ data: { certificateNo: 'BB-2026-TEST-0001', donorId: u.id, hospitalId: h.id, bloodGroup: 'O_POS', units: 1 } });
    await api().post('/api/inventory/batch').set('Authorization', as('s2')).send({ changes: [{ bloodGroup: 'O_POS', delta: 3, reason: 'RECEIVED' }] });

    const don = await api().get('/api/exports/donations.csv').set('Authorization', as('s2'));
    expect(don.status).toBe(200);
    expect(don.headers['content-type']).toContain('text/csv');
    expect(don.headers['content-disposition']).toContain('donations.csv');
    expect(don.text).toContain('BB-2026-TEST-0001');
    expect(don.text).toContain("\"'=HYPERLINK(");
    const inv = await api().get('/api/exports/inventory.csv?from=2020-01-01').set('Authorization', as('s2'));
    expect(inv.text).toContain('O+');
    expect(inv.text).toContain('RECEIVED');
    expect((await api().get('/api/exports/inventory.csv?from=nope').set('Authorization', as('s2'))).status).toBe(400);
  });

  it('never leaks another hospital’s rows', async () => {
    await api().post('/api/users/onboard').set('Authorization', as('s3')).send({ role: 'HOSPITAL', phone: '+919822222233' });
    const mine = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Mine', lat: AMRITSAR.lat, lng: AMRITSAR.lng, status: 'VERIFIED' } });
    const other = await t.db.hospital.create({ data: { source: 'PLATFORM', name: 'Other', lat: AMRITSAR.lat, lng: AMRITSAR.lng, status: 'VERIFIED' } });
    await t.db.user.update({ where: { clerkId: 's3' }, data: { hospitalId: mine.id } });
    const u = await donor('d11', null);
    await t.db.donation.create({ data: { certificateNo: 'BB-2026-OTHER-0001', donorId: u.id, hospitalId: other.id, bloodGroup: 'A_POS', units: 1 } });
    const res = await api().get('/api/exports/donations.csv').set('Authorization', as('s3'));
    expect(res.text).not.toContain('OTHER-0001');
  });
});
