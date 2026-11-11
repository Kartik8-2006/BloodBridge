import { describe, expect, it } from 'vitest';
import { boundingBox, cellOf, haversineKm } from '../src/lib/geo.js';
import { evaluateEligibility, healthSchema } from '../src/services/eligibility.js';
import { buildQuery, createOverpassClient, parseOverpass, safeWebsite } from '../src/services/overpass.js';
import { sniffDocument } from '../src/services/storage.js';
import { donorFields, onboardSchema } from '../src/modules/schemas.js';

const NOW = new Date('2026-11-05T00:00:00Z');
const base = { dateOfBirth: new Date('1995-06-15'), gender: 'MALE' as const, weightKg: 70, lastDonationAt: null, health: healthSchema.parse({}) };

describe('eligibility', () => {
  it('accepts a healthy adult who never donated', () => {
    expect(evaluateEligibility(base, NOW)).toMatchObject({ eligible: true, reasons: [], nextEligibleOn: null });
  });
  it('rejects under 18 and over 65', () => {
    expect(evaluateEligibility({ ...base, dateOfBirth: new Date('2010-01-01') }, NOW).eligible).toBe(false);
    expect(evaluateEligibility({ ...base, dateOfBirth: new Date('1950-01-01') }, NOW).eligible).toBe(false);
  });
  it('turns 18 exactly on the birthday', () => {
    expect(evaluateEligibility({ ...base, dateOfBirth: new Date('2008-11-05') }, NOW).eligible).toBe(true);
    expect(evaluateEligibility({ ...base, dateOfBirth: new Date('2008-11-06') }, NOW).eligible).toBe(false);
  });
  it('requires 45 kg', () => {
    expect(evaluateEligibility({ ...base, weightKg: 44.9 }, NOW).eligible).toBe(false);
    expect(evaluateEligibility({ ...base, weightKg: 45 }, NOW).eligible).toBe(true);
  });
  it('enforces 90 days for men and 120 days for women', () => {
    const last = new Date('2026-08-10T00:00:00Z'); // 87 days before NOW
    const man = evaluateEligibility({ ...base, lastDonationAt: last }, NOW);
    expect(man.eligible).toBe(false);
    expect(man.nextEligibleOn).toBe('2026-11-08');
    expect(man.daysUntilEligible).toBe(3);
    expect(evaluateEligibility({ ...base, lastDonationAt: new Date('2026-08-05T00:00:00Z') }, NOW).eligible).toBe(true);
    const woman = evaluateEligibility({ ...base, gender: 'FEMALE', lastDonationAt: new Date('2026-08-05T00:00:00Z') }, NOW);
    expect(woman.eligible).toBe(false);
    expect(woman.nextEligibleOn).toBe('2026-12-03');
  });
  it('lists every health blocker', () => {
    const r = evaluateEligibility({ ...base, health: { ...base.health, recentIllness: true, chronicCondition: true } }, NOW);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });
});

describe('geo', () => {
  it('computes known distances', () => {
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeCloseTo(1153, -1); // Delhi to Mumbai
    expect(haversineKm(10, 10, 10, 10)).toBe(0);
  });
  it('bounding box contains every point inside the radius', () => {
    const box = boundingBox(31.634, 74.872, 10);
    for (const [dLat, dLng] of [[0.08, 0], [0, 0.1], [-0.06, -0.06], [0.05, 0.05]] as const) {
      const lat = 31.634 + dLat;
      const lng = 74.872 + dLng;
      if (haversineKm(31.634, 74.872, lat, lng) <= 10) {
        expect(lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng).toBe(true);
      }
    }
  });
  it('groups nearby points into one sync cell', () => {
    expect(cellOf(31.634, 74.872).key).toBe(cellOf(31.64, 74.88).key);
    expect(cellOf(31.634, 74.872).key).not.toBe(cellOf(31.9, 74.872).key);
  });
});

describe('overpass', () => {
  const json = {
    elements: [
      { type: 'node', id: 1, lat: 31.6, lon: 74.8, tags: { amenity: 'hospital', name: 'Alpha Hospital', phone: '+91 183 111; +91 183 222', 'operator:type': 'public', emergency: 'yes', 'addr:housenumber': '12', 'addr:street': 'Mall Road', 'addr:city': 'Amritsar' } },
      { type: 'way', id: 2, center: { lat: 31.7, lon: 74.9 }, tags: { healthcare: 'blood_donation', name: 'Beta Blood Centre' } },
      { type: 'node', id: 3, lat: 31.6, lon: 74.8, tags: { amenity: 'hospital' } },
      { type: 'way', id: 4, tags: { amenity: 'hospital', name: 'No coordinates' } },
      { type: 'node', id: 1, lat: 31.6, lon: 74.8, tags: { amenity: 'hospital', name: 'Alpha Hospital' } },
    ],
  };
  it('parses facilities, drops nameless and coordinate-less ones, dedupes', () => {
    const out = parseOverpass(json as never);
    expect(out.map((f) => f.osmId).sort()).toEqual(['node/1', 'way/2']);
    const alpha = out.find((f) => f.osmId === 'node/1')!;
    // The first occurrence wins, so the richer record is kept.
    expect(alpha).toMatchObject({ type: 'HOSPITAL', ownership: 'government', hasEmergency: true });
  });
  it('maps blood donation centres to BLOOD_BANK and uses way centres', () => {
    const beta = parseOverpass({ elements: [json.elements[1]] } as never)[0]!;
    expect(beta).toMatchObject({ type: 'BLOOD_BANK', lat: 31.7, lng: 74.9 });
  });
  it('normalises phone, address, ownership and emergency', () => {
    const [a] = parseOverpass({ elements: [json.elements[0]] } as never);
    expect(a).toMatchObject({ phone: '+91 183 111', ownership: 'government', hasEmergency: true, addressLine: '12 Mall Road', city: 'Amritsar' });
  });
  it('builds a query for all facility tags', () => {
    const q = buildQuery(31.634, 74.872, 20);
    expect(q).toContain('around:20000,31.63400,74.87200');
    for (const tag of ['"amenity"="hospital"', '"healthcare"="hospital"', '"amenity"="blood_bank"', '"healthcare"="blood_donation"']) expect(q).toContain(tag);
  });
});

describe('website safety', () => {
  it('only lets http(s) links through from OpenStreetMap', () => {
    expect(safeWebsite('https://hospital.example/contact')).toBe('https://hospital.example/contact');
    expect(safeWebsite('hospital.example')).toBe('https://hospital.example/');
    expect(safeWebsite('javascript:alert(1)')).toBeNull();
    expect(safeWebsite('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(safeWebsite('ftp://files.example')).toBeNull();
    expect(safeWebsite('')).toBeNull();
    const [f] = parseOverpass({ elements: [{ type: 'node', id: 9, lat: 1, lon: 1, tags: { amenity: 'hospital', name: 'X', website: 'javascript:alert(document.cookie)' } }] } as never);
    expect(f!.website).toBeNull();
  });
});

describe('documents', () => {
  it('recognises PDF, JPEG, PNG by signature and rejects the rest', () => {
    expect(sniffDocument(Buffer.from('%PDF-1.7'))?.ext).toBe('pdf');
    expect(sniffDocument(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe('jpg');
    expect(sniffDocument(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.ext).toBe('png');
    expect(sniffDocument(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffDocument(Buffer.from('MZ\x90\x00'))).toBeNull();
  });
});

describe('input schemas', () => {
  const donor = { role: 'DONOR', phone: '9876543210', bloodGroup: 'A_POS', dateOfBirth: '1990-01-01', gender: 'FEMALE', weightKg: '58', city: 'Amritsar', lat: '31.6', lng: '74.8' };
  it('normalises phone numbers and coerces numbers', () => {
    const r = onboardSchema.parse({ ...donor, phone: '+91 98765-43210' });
    expect(r).toMatchObject({ phone: '+919876543210', weightKg: 58, lat: 31.6 });
  });
  it('rejects bad blood group, future DOB and future last donation', () => {
    expect(onboardSchema.safeParse({ ...donor, bloodGroup: 'Z_POS' }).success).toBe(false);
    expect(donorFields.safeParse({ ...donor, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(donorFields.safeParse({ ...donor, lastDonationAt: '2999-01-01' }).success).toBe(false);
  });
  it('rejects an invalid phone and refuses to onboard as ADMIN', () => {
    expect(onboardSchema.safeParse({ ...donor, phone: '12ab' }).success).toBe(false);
    expect(onboardSchema.safeParse({ role: 'ADMIN', phone: '9876543210' }).success).toBe(false);
  });
});

describe('createOverpassClient resilience', () => {
  const ok = () => new Response(JSON.stringify({ elements: [] }), { status: 200 });
  const make = (calls: string[], responses: Array<() => Response>) =>
    createOverpassClient({
      urls: ['https://a.test/api', 'https://b.test/api'],
      userAgent: 'test',
      retryDelayMs: 1,
      fetchImpl: (async (url: string) => {
        calls.push(String(url));
        return responses.shift()!();
      }) as unknown as typeof fetch,
    });

  it('retries a busy mirror once before moving on', async () => {
    const calls: string[] = [];
    const client = make(calls, [() => new Response('busy', { status: 429 }), ok]);
    expect(await client.fetchFacilities(31.6, 74.8, 10)).toEqual([]);
    expect(calls).toEqual(['https://a.test/api', 'https://a.test/api']);
  });

  it('falls through to the next mirror on a hard error and reports 502 when all fail', async () => {
    const calls: string[] = [];
    const client = make(calls, [() => new Response('no', { status: 400 }), () => new Response('no', { status: 400 })]);
    await expect(client.fetchFacilities(31.6, 74.8, 10)).rejects.toMatchObject({ status: 502 });
    expect(calls).toEqual(['https://a.test/api', 'https://b.test/api']);
  });
});
