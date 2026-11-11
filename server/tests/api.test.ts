import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, AMRITSAR, PDF, PNG, buildTestApp, donorPayload, facility } from './helpers/app.js';

const t = buildTestApp();
const api = () => request(t.app);
const as = (id: string) => t.auth.as(id);

beforeAll(() => t.reset());
beforeEach(() => t.reset());
afterAll(() => t.db.$disconnect());

async function onboardDonor(id: string, over: Record<string, unknown> = {}) {
  return api().post('/api/users/onboard').set('Authorization', as(id)).send(donorPayload(over));
}

async function claim(id: string, hospitalId: string, file: Buffer = PDF, name = 'license.pdf') {
  await api().post('/api/users/onboard').set('Authorization', as(id)).send({ role: 'HOSPITAL', phone: '+919811111111' });
  return api()
    .post('/api/hospitals/claim')
    .set('Authorization', as(id))
    .field('hospitalId', hospitalId)
    .field('licenseNumber', 'PB-MED-2041')
    .field('contactPerson', 'Dr. Test')
    .field('contactDesignation', 'Medical superintendent')
    .attach('file', file, { filename: name });
}

async function admin() {
  t.auth.as('admin1', { email: ADMIN_EMAIL, name: 'Admin One' });
  await api().get('/api/users/me').set('Authorization', as('admin1'));
  return as('admin1');
}

async function seedFacilities(n = 3) {
  t.overpass.facilities = Array.from({ length: n }, (_, i) => facility(i + 1));
  const res = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 25 });
  return res.body.items as { id: string; name: string }[];
}

describe('health and authentication', () => {
  it('serves health and public stats without a session', async () => {
    expect((await api().get('/api/health')).body.status).toBe('ok');
    expect((await api().get('/api/public/stats')).body).toEqual({ donors: 0, verifiedHospitals: 0, listedFacilities: 0, cities: 0, donations: 0 });
  });

  it('blocks protected routes without a valid session', async () => {
    for (const path of ['/api/users/me', '/api/dashboard', '/api/notifications', '/api/admin/overview', '/api/donors/me']) {
      expect((await api().get(path)).status, path).toBe(401);
    }
    expect((await api().get('/api/users/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
  });

  it('creates the database user on first sign-in with no role yet', async () => {
    const res = await api().get('/api/users/me').set('Authorization', as('newbie'));
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ role: null, onboarded: false, email: 'newbie@bloodbridge.test' });
    expect(await t.db.user.count()).toBe(1);
    await api().get('/api/users/me').set('Authorization', as('newbie'));
    expect(await t.db.user.count()).toBe(1);
  });

  it('promotes only verified admin emails to ADMIN', async () => {
    t.auth.as('sneaky', { email: ADMIN_EMAIL, emailVerified: false });
    const sneaky = await api().get('/api/users/me').set('Authorization', as('sneaky'));
    expect(sneaky.body.user.role).toBeNull();

    t.auth.as('boss', { email: 'boss@x.test', emailVerified: true });
    await api().get('/api/users/me').set('Authorization', as('boss'));
    expect((await api().get('/api/admin/overview').set('Authorization', as('boss'))).status).toBe(403);

    const a = await admin();
    const res = await api().get('/api/users/me').set('Authorization', a);
    expect(res.body.user).toMatchObject({ role: 'ADMIN', onboarded: true });
  });

  it('blocks suspended accounts everywhere', async () => {
    await onboardDonor('d1');
    const a = await admin();
    const me = await t.db.user.findFirstOrThrow({ where: { clerkId: 'd1' } });
    expect((await api().post(`/api/admin/users/${me.id}/status`).set('Authorization', a).send({ status: 'SUSPENDED', reason: 'Fake profile' })).status).toBe(200);
    const res = await api().get('/api/users/me').set('Authorization', as('d1'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('account_suspended');
  });
});

describe('onboarding and profiles', () => {
  it('returns field-level validation errors', async () => {
    const res = await api().post('/api/users/onboard').set('Authorization', as('d1')).send(donorPayload({ bloodGroup: 'X', phone: '12', weightKg: 10 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(Object.keys(res.body.error.details)).toEqual(expect.arrayContaining(['bloodGroup', 'phone', 'weightKg']));
    expect((await api().get('/api/users/me').set('Authorization', as('d1'))).body.user.onboarded).toBe(false);
  });

  it('cannot onboard as admin', async () => {
    const res = await api().post('/api/users/onboard').set('Authorization', as('x')).send({ role: 'ADMIN', phone: '9876543210' });
    expect(res.status).toBe(400);
  });

  it('onboards a donor with an eligibility result and a welcome notification', async () => {
    const res = await onboardDonor('d1', { lastDonationAt: null });
    expect(res.status).toBe(201);
    const me = await api().get('/api/users/me').set('Authorization', as('d1'));
    expect(me.body.user).toMatchObject({ role: 'DONOR', onboarded: true, phone: '+919876543210' });
    expect(me.body.donor).toMatchObject({ bloodGroup: 'O_NEG', available: true, city: 'Amritsar' });
    expect(me.body.eligibility).toMatchObject({ eligible: true, reasons: [] });
    expect(me.body.unreadNotifications).toBe(1);
  });

  it('refuses a second onboarding', async () => {
    await onboardDonor('d1');
    const res = await api().post('/api/users/onboard').set('Authorization', as('d1')).send({ role: 'REQUESTER', phone: '9876543210', city: 'Delhi', lat: 28.6, lng: 77.2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_onboarded');
  });

  it('warms the hospital directory around a new donor', async () => {
    t.overpass.facilities = [facility(1)];
    await onboardDonor('d1');
    await new Promise((r) => setTimeout(r, 300));
    expect(await t.db.hospital.count()).toBe(1);
  });

  it('recalculates eligibility when the donor edits their profile', async () => {
    await onboardDonor('d1');
    const recent = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    const res = await api().put('/api/donors/me').set('Authorization', as('d1')).send({ ...donorPayload(), lastDonationAt: recent });
    expect(res.status).toBe(200);
    expect(res.body.eligibility.eligible).toBe(false);
    expect(res.body.eligibility.daysUntilEligible).toBeGreaterThan(60);
    expect(res.body.donor.lastDonationAt).toBe(recent);
  });

  it('toggles donor availability and keeps other roles out of donor routes', async () => {
    await onboardDonor('d1');
    const off = await api().patch('/api/donors/me/availability').set('Authorization', as('d1')).send({ available: false });
    expect(off.body.donor.available).toBe(false);
    await api().post('/api/users/onboard').set('Authorization', as('r1')).send({ role: 'REQUESTER', phone: '9876543210', city: 'Amritsar', lat: 31.6, lng: 74.8 });
    expect((await api().get('/api/donors/me').set('Authorization', as('r1'))).status).toBe(403);
  });

  it('merges notification preferences instead of replacing them', async () => {
    await onboardDonor('d1');
    await api().patch('/api/users/me').set('Authorization', as('d1')).send({ prefs: { emailAlerts: false } });
    const res = await api().patch('/api/users/me').set('Authorization', as('d1')).send({ prefs: { communityAnnouncements: false } });
    expect(res.body.user.prefs).toEqual({ emailAlerts: false, communityAnnouncements: false, smsAlerts: false, language: 'en' });
  });
});

describe('hospital directory', () => {
  it('imports from OpenStreetMap on first search, sorts by distance and caches the area', async () => {
    t.overpass.facilities = [facility(3), facility(1), facility(2, { type: 'BLOOD_BANK', name: 'City Blood Bank' })];
    const res = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 25 });
    expect(res.status).toBe(200);
    expect(res.body.sync).toMatchObject({ status: 'synced', found: 3 });
    expect(res.body.items.map((h: { name: string }) => h.name)).toEqual(['Test Facility 1', 'City Blood Bank', 'Test Facility 3']);
    expect(res.body.items[0].distanceKm).toBeGreaterThan(0);

    const again = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 25 });
    expect(again.body.sync.status).toBe('cached');
    expect(t.overpass.calls).toBe(1);
  });

  it('filters by distance, type, name and verified status', async () => {
    t.overpass.facilities = [facility(1), facility(30), facility(2, { type: 'BLOOD_BANK', name: 'City Blood Bank' })];
    const near = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 5 });
    expect(near.body.items.map((h: { name: string }) => h.name)).toEqual(['Test Facility 1', 'City Blood Bank']);
    const banks = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 50, type: 'BLOOD_BANK' });
    expect(banks.body.items).toHaveLength(1);
    const named = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 50, q: 'facility 30' });
    expect(named.body.items).toHaveLength(1);
    const verified = await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 50, verifiedOnly: 'true' });
    expect(verified.body.items).toHaveLength(0);
  });

  it('still answers from the database when OpenStreetMap is down', async () => {
    await seedFacilities(2);
    t.overpass.fail = true;
    const res = await api().get('/api/hospitals').query({ lat: 31.9, lng: 74.872, radiusKm: 50 });
    expect(res.status).toBe(200);
    expect(res.body.sync.status).toBe('failed');
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('does not record a failed import as synced', async () => {
    t.overpass.fail = true;
    await api().get('/api/hospitals').query(AMRITSAR);
    expect(await t.db.osmSyncArea.count()).toBe(0);
    t.overpass.fail = false;
    t.overpass.facilities = [facility(1)];
    const ok = await api().get('/api/hospitals').query(AMRITSAR);
    expect(ok.body.sync.status).toBe('synced');
  });

  it('requires a location or a name and validates coordinates', async () => {
    expect((await api().get('/api/hospitals')).status).toBe(400);
    expect((await api().get('/api/hospitals').query({ lat: 120, lng: 10 })).status).toBe(400);
    expect((await api().get('/api/hospitals').query({ q: 'a' })).status).toBe(400);
    expect((await api().get('/api/hospitals').query({ q: 'Test' })).status).toBe(200);
  });

  it('never overwrites a claimed hospital with later OpenStreetMap data', async () => {
    const [h] = await seedFacilities(1);
    expect((await claim('h1', h!.id)).status).toBe(201);
    t.overpass.facilities = [facility(1, { name: 'Renamed By Mapper', phone: '+91 000' })];
    await api().post('/api/admin/osm/sync').set('Authorization', await admin()).send(AMRITSAR);
    const row = await t.db.hospital.findUniqueOrThrow({ where: { id: h!.id } });
    expect(row.name).toBe('Test Facility 1');
  });

  it('proxies geocoding', async () => {
    const res = await api().get('/api/geo/search').query({ q: 'Amritsar' });
    expect(res.body.places[0]).toMatchObject({ city: 'Amritsar', lat: 31.634 });
    expect((await api().get('/api/geo/search').query({ q: 'a' })).status).toBe(400);
    expect((await api().get('/api/geo/reverse').query({ lat: 31.6, lng: 74.8 })).body.place.city).toBe('Amritsar');
  });
});

describe('hospital verification workflow', () => {
  it('walks a facility from unclaimed to verified, with notifications and an audit trail', async () => {
    const [h] = await seedFacilities(1);
    const a = await admin();

    const claimRes = await claim('h1', h!.id);
    expect(claimRes.status).toBe(201);
    expect(claimRes.body.hospital).toMatchObject({ status: 'PENDING', licenseNumber: 'PB-MED-2041', hasLicenseDocument: true });
    expect(claimRes.body.hospital).not.toHaveProperty('licenseDocPath');
    expect(t.storage.files.size).toBe(1);

    const pub = await api().get(`/api/hospitals/${h!.id}`);
    expect(pub.body.hospital.verified).toBe(false);
    expect(JSON.stringify(pub.body)).not.toContain('PB-MED-2041');

    const queue = await api().get('/api/admin/hospitals').query({ status: 'PENDING' }).set('Authorization', a);
    expect(queue.body.total).toBe(1);
    const detail = await api().get(`/api/admin/hospitals/${h!.id}`).set('Authorization', a);
    expect(detail.body.documentUrl).toContain('https://storage.test/signed/');
    expect(detail.body.hospital.claimedBy.email).toBe('h1@bloodbridge.test');

    const approve = await api().post(`/api/admin/hospitals/${h!.id}/review`).set('Authorization', a).send({ decision: 'APPROVE' });
    expect(approve.status).toBe(200);
    expect(approve.body.hospital.status).toBe('VERIFIED');

    expect((await api().get(`/api/hospitals/${h!.id}`)).body.hospital.verified).toBe(true);
    const list = await api().get('/api/hospitals').query({ ...AMRITSAR, verifiedOnly: 'true' });
    expect(list.body.items).toHaveLength(1);

    const notes = await api().get('/api/notifications').set('Authorization', as('h1'));
    expect(notes.body.items.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(['HOSPITAL_APPROVED', 'HOSPITAL_SUBMITTED', 'WELCOME']));
    expect((await t.db.auditLog.findMany()).map((l) => l.action).sort()).toEqual(['hospital.approve', 'hospital.claimed']);
    expect((await api().get('/api/notifications').set('Authorization', a)).body.items.some((n: { title: string }) => n.title === 'Hospital awaiting review')).toBe(true);
  });

  it('lets only one representative claim a hospital', async () => {
    const [h] = await seedFacilities(1);
    expect((await claim('h1', h!.id)).status).toBe(201);
    const second = await claim('h2', h!.id);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('already_claimed');
    expect(t.storage.files.size).toBe(1);
  });

  it('handles two simultaneous claims without double-assigning', async () => {
    const [h] = await seedFacilities(1);
    for (const id of ['h1', 'h2']) await api().post('/api/users/onboard').set('Authorization', as(id)).send({ role: 'HOSPITAL', phone: '+919811111111' });
    const send = (id: string) =>
      api().post('/api/hospitals/claim').set('Authorization', as(id)).field('hospitalId', h!.id).field('licenseNumber', 'LIC-1234').field('contactPerson', 'Dr X').field('contactDesignation', 'MS').attach('file', PDF, { filename: 'l.pdf' });
    const results = await Promise.all([send('h1'), send('h2')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await t.db.user.count({ where: { hospitalId: h!.id } })).toBe(1);
    expect(t.storage.files.size).toBe(1);
  });

  it('rejects documents that are not really PDF, JPG or PNG, even if named like one', async () => {
    const [h] = await seedFacilities(1);
    const res = await claim('h1', h!.id, Buffer.from('<html><script>alert(1)</script></html>'), 'license.pdf');
    expect(res.status).toBe(400);
    expect(t.storage.files.size).toBe(0);
    expect((await t.db.hospital.findUniqueOrThrow({ where: { id: h!.id } })).status).toBe('UNCLAIMED');
  });

  it('accepts a PNG scan and requires every field', async () => {
    const [h] = await seedFacilities(1);
    await api().post('/api/users/onboard').set('Authorization', as('h1')).send({ role: 'HOSPITAL', phone: '+919811111111' });
    const missing = await api().post('/api/hospitals/claim').set('Authorization', as('h1')).field('hospitalId', h!.id).attach('file', PNG, { filename: 'l.png' });
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.error.details)).toEqual(expect.arrayContaining(['licenseNumber', 'contactPerson', 'contactDesignation']));
    expect((await claim('h1', h!.id, PNG, 'l.png')).status).toBe(201);
  });

  it('only HOSPITAL users can claim, and only once', async () => {
    const [h] = await seedFacilities(2);
    await onboardDonor('d1');
    const asDonor = await api().post('/api/hospitals/claim').set('Authorization', as('d1')).field('hospitalId', h!.id).attach('file', PDF, { filename: 'l.pdf' });
    expect(asDonor.status).toBe(403);
    expect((await claim('h1', h!.id)).status).toBe(201);
    const other = await seedFacilities(2);
    const again = await api().post('/api/hospitals/claim').set('Authorization', as('h1')).field('hospitalId', other[1]!.id).field('licenseNumber', 'LIC-9999').field('contactPerson', 'Dr X').field('contactDesignation', 'MS').attach('file', PDF, { filename: 'l.pdf' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('already_linked');
  });

  it('requires a reason to reject, then supports fix-and-resubmit', async () => {
    const [h] = await seedFacilities(1);
    const a = await admin();
    await claim('h1', h!.id);

    const noNote = await api().post(`/api/admin/hospitals/${h!.id}/review`).set('Authorization', a).send({ decision: 'REJECT' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details.note).toBeTruthy();

    const reject = await api().post(`/api/admin/hospitals/${h!.id}/review`).set('Authorization', a).send({ decision: 'REJECT', note: 'The license scan is unreadable.' });
    expect(reject.body.hospital).toMatchObject({ status: 'REJECTED', reviewNote: 'The license scan is unreadable.' });
    const mine = await api().get('/api/hospitals/mine').set('Authorization', as('h1'));
    expect(mine.body.hospital).toMatchObject({ status: 'REJECTED', reviewNote: 'The license scan is unreadable.' });

    expect((await api().post('/api/hospitals/mine/resubmit').set('Authorization', as('h1')).field('licenseNumber', 'PB-MED-2041-B').attach('file', PNG, { filename: 'clear.png' })).status).toBe(200);
    const after = await api().get('/api/hospitals/mine').set('Authorization', as('h1'));
    expect(after.body.hospital).toMatchObject({ status: 'PENDING', licenseNumber: 'PB-MED-2041-B', reviewNote: null });
    expect(t.storage.files.size).toBe(2);

    expect((await api().post('/api/hospitals/mine/resubmit').set('Authorization', as('h1')).field('licenseNumber', 'PB-MED-2041-C')).status).toBe(409);
  });

  it('enforces valid status transitions and stale reviews', async () => {
    const [h] = await seedFacilities(1);
    const a = await admin();
    const review = (decision: string, note?: string) => api().post(`/api/admin/hospitals/${h!.id}/review`).set('Authorization', a).send({ decision, note });
    expect((await review('APPROVE')).status).toBe(409);
    await claim('h1', h!.id);
    expect((await review('SUSPEND', 'Not applicable yet at all')).status).toBe(409);
    expect((await review('APPROVE')).status).toBe(200);
    expect((await review('APPROVE')).status).toBe(409);
    expect((await review('SUSPEND', 'License revoked by the state council')).body.hospital.status).toBe('SUSPENDED');
    const suspendedEdit = await api().patch('/api/hospitals/mine').set('Authorization', as('h1')).send({ phone: '+919800000000' });
    expect(suspendedEdit.status).toBe(403);
    expect((await review('REINSTATE')).body.hospital.status).toBe('VERIFIED');
  });

  it('lets hospital staff update contact details but not the name', async () => {
    const [h] = await seedFacilities(1);
    await claim('h1', h!.id);
    const res = await api().patch('/api/hospitals/mine').set('Authorization', as('h1')).send({ phone: '+91 98000 00000', website: 'https://hospital.example', name: 'Hacked Name', status: 'VERIFIED' });
    expect(res.status).toBe(200);
    expect(res.body.hospital).toMatchObject({ phone: '+919800000000', website: 'https://hospital.example', name: 'Test Facility 1', status: 'PENDING' });
    expect((await api().patch('/api/hospitals/mine').set('Authorization', as('h1')).send({ website: 'javascript:alert(1)' })).status).toBe(400);
  });

  it('keeps self-registered facilities hidden until verified and blocks duplicates', async () => {
    const [existing] = await seedFacilities(1);
    await api().post('/api/users/onboard').set('Authorization', as('h1')).send({ role: 'HOSPITAL', phone: '+919811111111' });
    const form = (name: string, lat = 31.7) => {
      const r = api().post('/api/hospitals/register').set('Authorization', as('h1'));
      for (const [k, v] of Object.entries({ name, type: 'BLOOD_BANK', addressLine: '1 Civil Lines', city: 'Amritsar', state: 'Punjab', lat, lng: 74.9, phone: '+91 183 255 5555', ownership: 'charity', hasEmergency: 'true', licenseNumber: 'BB-LIC-77', contactPerson: 'Dr Y', contactDesignation: 'Director' })) r.field(k, String(v));
      return r.attach('file', PDF, { filename: 'bb.pdf' });
    };
    const dup = await api().post('/api/hospitals/register').set('Authorization', as('h1')).field('name', existing!.name).field('type', 'HOSPITAL').field('addressLine', '1 Test Road').field('city', 'Amritsar').field('state', 'Punjab').field('lat', String(AMRITSAR.lat + 0.01)).field('lng', String(AMRITSAR.lng)).field('phone', '+911832000000').field('ownership', 'private').field('licenseNumber', 'LIC-DUP-1').field('contactPerson', 'Dr Z').field('contactDesignation', 'MS').attach('file', PDF, { filename: 'a.pdf' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('duplicate_facility');

    const res = await form('Golden Blood Centre');
    expect(res.status).toBe(201);
    const id = res.body.hospital.id as string;
    expect(res.body.hospital).toMatchObject({ source: 'PLATFORM', status: 'PENDING', type: 'BLOOD_BANK' });
    expect((await api().get(`/api/hospitals/${id}`)).status).toBe(404);
    expect((await api().get('/api/hospitals').query({ q: 'Golden' })).body.items).toHaveLength(0);

    await api().post(`/api/admin/hospitals/${id}/review`).set('Authorization', await admin()).send({ decision: 'APPROVE' });
    expect((await api().get(`/api/hospitals/${id}`)).status).toBe(200);
    expect((await api().get('/api/hospitals').query({ q: 'Golden' })).body.items).toHaveLength(1);
  });
});

describe('dashboards', () => {
  it('donor dashboard groups real facilities by distance and verification', async () => {
    t.overpass.facilities = [facility(1), facility(7), facility(15), facility(40)];
    await onboardDonor('d1');
    await new Promise((r) => setTimeout(r, 300));
    const [first] = (await api().get('/api/hospitals').query({ ...AMRITSAR, radiusKm: 25 })).body.items;
    await claim('h1', first.id);
    await api().post(`/api/admin/hospitals/${first.id}/review`).set('Authorization', await admin()).send({ decision: 'APPROVE' });

    const res = await api().get('/api/dashboard').set('Authorization', as('d1'));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('DONOR');
    expect(res.body.eligibility.eligible).toBe(true);
    expect(res.body.network.totals).toMatchObject({ verified: 1, listed: 2 });
    expect(res.body.network.bands).toEqual([
      { label: '0–5 km', verified: 1, listed: 0 },
      { label: '5–10 km', verified: 0, listed: 1 },
      { label: '10–25 km', verified: 0, listed: 1 },
    ]);
    expect(res.body.network.nearest[0].verified).toBe(true);
  });

  it('requester dashboard uses the saved location', async () => {
    t.overpass.facilities = [facility(1, { type: 'BLOOD_BANK' }), facility(2)];
    await api().post('/api/users/onboard').set('Authorization', as('r1')).send({ role: 'REQUESTER', phone: '9876543210', city: 'Amritsar', ...AMRITSAR });
    await new Promise((r) => setTimeout(r, 300));
    const res = await api().get('/api/dashboard').set('Authorization', as('r1'));
    expect(res.body.role).toBe('REQUESTER');
    expect(res.body.network.totals).toMatchObject({ bloodBanks: 1, withEmergency: 1 });
  });

  it('hospital dashboard hides donor data until verified, then shows anonymous counts', async () => {
    const [h] = await seedFacilities(1);
    await onboardDonor('d1');
    await onboardDonor('d2', { bloodGroup: 'A_POS', phone: '9876500000' });
    await onboardDonor('d3', { bloodGroup: 'A_POS', phone: '9876500001' });
    await api().patch('/api/donors/me/availability').set('Authorization', as('d3')).send({ available: false });
    await claim('h1', h!.id);

    const pending = await api().get('/api/dashboard').set('Authorization', as('h1'));
    expect(pending.body.hospital.status).toBe('PENDING');
    expect(pending.body.donorsByGroup).toBeNull();
    expect(pending.body.donorsNearby).toBe(0);

    await api().post(`/api/admin/hospitals/${h!.id}/review`).set('Authorization', await admin()).send({ decision: 'APPROVE' });
    const live = await api().get('/api/dashboard').set('Authorization', as('h1'));
    expect(live.body.donorsNearby).toBe(2);
    expect(live.body.donorsByGroup.find((g: { bloodGroup: string }) => g.bloodGroup === 'A_POS').count).toBe(1);
    expect(live.body.donorsByGroup.find((g: { bloodGroup: string }) => g.bloodGroup === 'O_NEG').count).toBe(1);
    expect(JSON.stringify(live.body)).not.toMatch(/d1@|d2@|9876543210/);
  });

  it('hospital user without a facility sees the link-your-hospital state', async () => {
    await api().post('/api/users/onboard').set('Authorization', as('h1')).send({ role: 'HOSPITAL', phone: '+919811111111' });
    const res = await api().get('/api/dashboard').set('Authorization', as('h1'));
    expect(res.body).toMatchObject({ role: 'HOSPITAL', hospital: null });
    expect((await api().get('/api/hospitals/mine').set('Authorization', as('h1'))).status).toBe(404);
  });

  it('admin overview reports real counts and a six-month sign-up series', async () => {
    const [h] = await seedFacilities(2);
    await onboardDonor('d1');
    await claim('h1', h!.id);
    const a = await admin();
    const res = await api().get('/api/admin/overview').set('Authorization', a);
    expect(res.status).toBe(200);
    expect(res.body.users).toMatchObject({ donors: 1, hospitalStaff: 1, admins: 1, donorsAvailable: 1, total: 3 });
    expect(res.body.hospitals).toMatchObject({ pending: 1, unclaimed: 1, verified: 0, total: 2 });
    expect(res.body.osm.areasSynced).toBe(1);
    expect(res.body.signups).toHaveLength(6);
    const thisMonth = res.body.signups.at(-1);
    expect(thisMonth).toMatchObject({ DONOR: 1, HOSPITAL: 1 });
    expect(res.body.pendingQueue[0].licenseNumber).toBe('PB-MED-2041');
  });
});

describe('admin users and notifications', () => {
  it('lists, filters, paginates and protects admins', async () => {
    await onboardDonor('d1');
    await onboardDonor('d2', { phone: '9876500002' });
    const a = await admin();
    const all = await api().get('/api/admin/users').query({ pageSize: 2 }).set('Authorization', a);
    expect(all.body).toMatchObject({ total: 3, pageSize: 2 });
    expect(all.body.items).toHaveLength(2);
    const donors = await api().get('/api/admin/users').query({ role: 'DONOR', q: 'd2' }).set('Authorization', a);
    expect(donors.body.items).toHaveLength(1);
    expect(donors.body.items[0]).toMatchObject({ bloodGroup: 'O_NEG', status: 'ACTIVE' });

    const adminRow = await t.db.user.findFirstOrThrow({ where: { clerkId: 'admin1' } });
    expect((await api().post(`/api/admin/users/${adminRow.id}/status`).set('Authorization', a).send({ status: 'SUSPENDED', reason: 'testing self' })).status).toBe(409);
    const d1 = await t.db.user.findFirstOrThrow({ where: { clerkId: 'd1' } });
    expect((await api().post(`/api/admin/users/${d1.id}/status`).set('Authorization', a).send({ status: 'SUSPENDED', reason: 'x' })).status).toBe(400);
    expect((await t.db.auditLog.count()).valueOf()).toBe(0);
  });

  it('marks notifications read one by one and all at once, only for the owner', async () => {
    await onboardDonor('d1');
    await onboardDonor('d2', { phone: '9876500002' });
    const list = await api().get('/api/notifications').set('Authorization', as('d1'));
    expect(list.body.unread).toBe(1);
    const id = list.body.items[0].id;
    expect((await api().post(`/api/notifications/${id}/read`).set('Authorization', as('d2'))).status).toBe(404);
    expect((await api().post(`/api/notifications/${id}/read`).set('Authorization', as('d1'))).status).toBe(200);
    expect((await api().get('/api/notifications').set('Authorization', as('d1'))).body.unread).toBe(0);
    expect((await api().post('/api/notifications/read-all').set('Authorization', as('d2'))).body.updated).toBe(1);
  });

  it('paginates notifications with a cursor', async () => {
    await onboardDonor('d1');
    const u = await t.db.user.findFirstOrThrow({ where: { clerkId: 'd1' } });
    await t.db.notification.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ userId: u.id, type: 'SYSTEM' as const, title: `n${i}`, body: 'b', createdAt: new Date(Date.now() + i * 1000) })) });
    const p1 = await api().get('/api/notifications').query({ limit: 4 }).set('Authorization', as('d1'));
    expect(p1.body.items).toHaveLength(4);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await api().get('/api/notifications').query({ limit: 4, cursor: p1.body.nextCursor }).set('Authorization', as('d1'));
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('returns JSON errors for unknown routes and malformed bodies', async () => {
    expect((await api().get('/api/nope')).body.error.code).toBe('not_found');
    const bad = await api().post('/api/users/onboard').set('Authorization', as('x')).set('Content-Type', 'application/json').send('{"role":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('bad_json');
  });
});
