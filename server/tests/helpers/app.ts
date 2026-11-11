import type { Request } from 'express';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import type { Deps } from '../../src/deps.js';
import { createPrisma } from '../../src/lib/prisma.js';
import type { AuthProvider, ProfileInfo } from '../../src/middleware/auth.js';
import type { PaymentGateway } from '../../src/services/payments.js';
import type { AiClient, AiRequest } from '../../src/services/ai.js';
import type { Geocoder, Place } from '../../src/services/nominatim.js';
import type { OsmFacility, OverpassClient } from '../../src/services/overpass.js';
import type { DocumentStorage } from '../../src/services/storage.js';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/bloodbridge_test';
export const ADMIN_EMAIL = 'admin@bloodbridge.test';

/** Auth fake: the bearer token is `test:<clerkId>`. Profiles are registered per test. */
export class FakeAuth implements AuthProvider {
  handlers = [];
  profiles = new Map<string, ProfileInfo>();

  async verifyToken(token: string) {
    return token.startsWith('test:') ? token.slice(5) : null;
  }
  identify(req: Request) {
    const h = req.header('authorization') ?? '';
    return h.startsWith('Bearer test:') ? h.slice('Bearer test:'.length) : null;
  }
  async fetchProfile(clerkId: string): Promise<ProfileInfo> {
    return this.profiles.get(clerkId) ?? { email: `${clerkId}@bloodbridge.test`, emailVerified: true, name: `User ${clerkId}`, imageUrl: null };
  }
  as(clerkId: string, profile?: Partial<ProfileInfo>) {
    if (profile) this.profiles.set(clerkId, { email: `${clerkId}@bloodbridge.test`, emailVerified: true, name: `User ${clerkId}`, imageUrl: null, ...profile });
    return `Bearer test:${clerkId}`;
  }
}

export class MemoryStorage implements DocumentStorage {
  files = new Map<string, { data: Buffer; contentType: string }>();
  async upload(path: string, data: Buffer, contentType: string) {
    this.files.set(path, { data, contentType });
  }
  async remove(path: string) {
    this.files.delete(path);
  }
  async signedUrl(path: string) {
    if (!this.files.has(path)) throw new Error('missing');
    return `https://storage.test/signed/${path}?token=abc`;
  }
}

export class FakeOverpass implements OverpassClient {
  calls = 0;
  fail = false;
  facilities: OsmFacility[] = [];
  async fetchFacilities() {
    this.calls++;
    if (this.fail) throw new Error('overpass down');
    return this.facilities;
  }
}

export class FakeAi implements AiClient {
  enabled = true;
  calls: AiRequest[] = [];
  /** What the next generate() returns. A function lets a test inspect the request. */
  next: string | ((r: AiRequest) => string) = 'Hello from the fake assistant.';
  fail = false;
  async generate(req: AiRequest) {
    this.calls.push(req);
    if (this.fail) throw Object.assign(new Error('down'), { status: 503 });
    return typeof this.next === 'function' ? this.next(req) : this.next;
  }
}

/** Signatures are plain strings the tests can forge or get right: `sig:<order>:<payment>` and `whsec`. */
export class FakePayments implements PaymentGateway {
  enabled = true;
  keyId = 'rzp_test_fake';
  orders = 0;
  async createOrder(i: { amountPaise: number; receipt: string }) {
    this.orders += 1;
    return { id: `order_test_${this.orders}_${i.amountPaise}` };
  }
  verifyPayment(orderId: string, paymentId: string, signature: string) {
    return signature === `sig:${orderId}:${paymentId}`;
  }
  verifyWebhook(_raw: string, signature: string) {
    return signature === 'whsec';
  }
}

export class FakeGeocoder implements Geocoder {
  places: Place[] = [{ label: 'Amritsar, Punjab, India', city: 'Amritsar', state: 'Punjab', lat: 31.634, lng: 74.872 }];
  async search() {
    return this.places;
  }
  async reverse() {
    return this.places[0] ?? null;
  }
}

/** Test-only fixtures around Amritsar. Production never ships facility data: it comes from OpenStreetMap at runtime. */
export const AMRITSAR = { lat: 31.634, lng: 74.872 };
export function facility(n: number, over: Partial<OsmFacility> = {}): OsmFacility {
  return {
    osmId: `node/${1000 + n}`,
    name: `Test Facility ${n}`,
    type: 'HOSPITAL',
    lat: AMRITSAR.lat + n * 0.01,
    lng: AMRITSAR.lng,
    addressLine: `${n} Test Road`,
    city: 'Amritsar',
    state: 'Punjab',
    postcode: null,
    phone: `+91 183 20000${n}`,
    email: null,
    website: null,
    ownership: 'private',
    hasEmergency: n % 2 === 0,
    ...over,
  };
}

export function buildTestApp() {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    CLERK_PUBLISHABLE_KEY: 'pk_test_x',
    CLERK_SECRET_KEY: 'sk_test_x',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    ADMIN_EMAILS: ADMIN_EMAIL,
  });
  const db = createPrisma(TEST_DB_URL);
  const auth = new FakeAuth();
  const storage = new MemoryStorage();
  const overpass = new FakeOverpass();
  const geocoder = new FakeGeocoder();
  const ai = new FakeAi();
  const payments = new FakePayments();
  const deps: Deps = { db, env, auth, storage, overpass, geocoder, ai, payments };
  return {
    app: createApp(deps),
    db,
    auth,
    storage,
    overpass,
    geocoder,
    ai,
    payments,
    async reset() {
      await db.$executeRawUnsafe('TRUNCATE "FraudFlag","Payment","Subscription","CampRegistration","Camp","InventoryLog","InventoryItem","Donation","DonorResponse","BloodRequest","AuditLog","Notification","DonorProfile","User","Hospital","OsmSyncArea","Subscriber" CASCADE');
      storage.files.clear();
      overpass.calls = 0;
      overpass.fail = false;
      overpass.facilities = [];
      payments.enabled = false; // most tests do not care about plans; billing tests switch it on
      ai.enabled = true;
      ai.fail = false;
      ai.calls = [];
      ai.next = 'Hello from the fake assistant.';
    },
  };
}

export const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

export const donorPayload = (over: Record<string, unknown> = {}) => ({
  role: 'DONOR',
  phone: '+91 98765 43210',
  bloodGroup: 'O_NEG',
  dateOfBirth: '1995-06-15',
  gender: 'MALE',
  weightKg: 70,
  city: 'Amritsar',
  lat: AMRITSAR.lat,
  lng: AMRITSAR.lng,
  lastDonationAt: null,
  health: {},
  ...over,
});
