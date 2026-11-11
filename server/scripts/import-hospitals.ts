/**
 * Imports real hospitals and blood banks across India from OpenStreetMap (Overpass API).
 *
 *   npm run import:hospitals                    → every state / UT (takes a while, resumable)
 *   npm run import:hospitals -- --state=IN-PB   → just one state (Punjab)
 *   npm run import:hospitals -- --refresh       → also refresh listings nobody has claimed yet
 *   npm run import:hospitals -- --dry-run       → fetch and count, write nothing
 *
 * These are PUBLIC LISTINGS. A hospital only becomes "Verified" after its staff claim the profile
 * and an admin approves their licence, so nobody is shown as a partner without their consent.
 * Data © OpenStreetMap contributors (ODbL), attribution is shown in the app.
 */
import 'dotenv/config';
import { PrismaClient, type HospitalType, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// [OSM ISO3166-2 regex alternatives, display name]
const STATES: [string, string][] = [
  ['AN', 'Andaman and Nicobar Islands'],
  ['AP', 'Andhra Pradesh'],
  ['AR', 'Arunachal Pradesh'],
  ['AS', 'Assam'],
  ['BR', 'Bihar'],
  ['CH', 'Chandigarh'],
  ['CT|CG', 'Chhattisgarh'],
  ['DH|DN|DD', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['DL', 'Delhi'],
  ['GA', 'Goa'],
  ['GJ', 'Gujarat'],
  ['HR', 'Haryana'],
  ['HP', 'Himachal Pradesh'],
  ['JK', 'Jammu and Kashmir'],
  ['JH', 'Jharkhand'],
  ['KA', 'Karnataka'],
  ['KL', 'Kerala'],
  ['LA', 'Ladakh'],
  ['LD', 'Lakshadweep'],
  ['MP', 'Madhya Pradesh'],
  ['MH', 'Maharashtra'],
  ['MN', 'Manipur'],
  ['ML', 'Meghalaya'],
  ['MZ', 'Mizoram'],
  ['NL', 'Nagaland'],
  ['OD|OR', 'Odisha'],
  ['PY', 'Puducherry'],
  ['PB', 'Punjab'],
  ['RJ', 'Rajasthan'],
  ['SK', 'Sikkim'],
  ['TN', 'Tamil Nadu'],
  ['TG|TS', 'Telangana'],
  ['TR', 'Tripura'],
  ['UP', 'Uttar Pradesh'],
  ['UT|UK', 'Uttarakhand'],
  ['WB', 'West Bengal'],
];

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function query(codes: string): string {
  return `[out:json][timeout:240];
area["ISO3166-2"~"^IN-(${codes})$"]["boundary"="administrative"]->.a;
(
  nwr["amenity"="hospital"](area.a);
  nwr["healthcare"="blood_bank"](area.a);
  nwr["amenity"="blood_bank"](area.a);
  nwr["healthcare"="blood_donation"](area.a);
);
out center tags;`;
}

async function fetchState(codes: string): Promise<OsmElement[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length]!;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BloodBridge-importer/1.0' },
        body: new URLSearchParams({ data: query(codes) }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OsmElement[] };
      return json.elements ?? [];
    } catch (err) {
      lastErr = err;
      const wait = 5_000 * (attempt + 1);
      console.warn(`   ⚠ ${endpoint} failed (${(err as Error).message}). Retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function pickType(tags: Record<string, string>): HospitalType {
  const op = (tags['operator:type'] ?? '').toLowerCase();
  if (['government', 'public'].includes(op)) return 'GOVERNMENT';
  if (['private', 'community', 'for_profit'].includes(op)) return 'PRIVATE';
  if (['charitable', 'religious', 'ngo', 'non_profit'].includes(op)) return 'TRUST';
  const name = (tags.name ?? '').toLowerCase();
  if (/\b(government|govt|civil hospital|district hospital|aiims|pgi|esi)\b/.test(name)) return 'GOVERNMENT';
  return 'UNKNOWN';
}

function toRow(el: OsmElement, stateName: string): Prisma.HospitalCreateManyInput | null {
  const t = el.tags ?? {};
  const name = (t['name:en'] ?? t.name ?? '').trim();
  const latitude = el.lat ?? el.center?.lat;
  const longitude = el.lon ?? el.center?.lon;
  if (!name || latitude === undefined || longitude === undefined) return null;

  const street = [t['addr:housenumber'], t['addr:street'], t['addr:suburb']].filter(Boolean).join(', ');
  const address = t['addr:full'] ?? (street || null);
  const city = t['addr:city'] ?? t['addr:town'] ?? t['addr:village'] ?? t['addr:district'] ?? null;

  const hasBloodBank =
    t.healthcare === 'blood_bank' ||
    t.amenity === 'blood_bank' ||
    t['blood_bank'] === 'yes' ||
    (t['healthcare:speciality'] ?? '').includes('blood_bank');

  return {
    osmKey: `${el.type}/${el.id}`,
    name: name.slice(0, 200),
    type: pickType(t),
    address: address ? address.slice(0, 300) : null,
    city: city ? city.slice(0, 80) : null,
    state: stateName,
    pincode: (t['addr:postcode'] ?? '').match(/^\d{6}$/)?.[0] ?? null,
    phone: (t.phone ?? t['contact:phone'] ?? '').split(';')[0]?.trim().slice(0, 40) || null,
    email: (t.email ?? t['contact:email'] ?? '').split(';')[0]?.trim().slice(0, 120) || null,
    website: (t.website ?? t['contact:website'] ?? '').trim().slice(0, 250) || null,
    latitude,
    longitude,
    hasBloodBank,
    hasEmergency: t.emergency === 'yes',
    source: 'osm',
  };
}

async function main() {
  const only = opt('state')?.replace(/^IN-/, '').toUpperCase();
  const dryRun = flag('dry-run');
  const refresh = flag('refresh');

  const targets = only
    ? STATES.filter(([codes]) => codes.split('|').includes(only))
    : STATES;
  if (!targets.length) {
    console.error(`Unknown state code "${only}". Examples: IN-PB, IN-DL, IN-MH`);
    process.exit(1);
  }

  console.log(`\n🩸 Importing hospitals for ${targets.length} state(s)/UT(s)${dryRun ? ' (dry run)' : ''}\n`);

  let totalNew = 0;
  let totalSeen = 0;

  for (const [codes, stateName] of targets) {
    process.stdout.write(`→ ${stateName.padEnd(44)}`);
    try {
      const elements = await fetchState(codes);
      const seen = new Set<string>();
      const rows = elements
        .map((e) => toRow(e, stateName))
        .filter((r): r is Prisma.HospitalCreateManyInput => {
          if (!r || !r.osmKey || seen.has(r.osmKey)) return false;
          seen.add(r.osmKey);
          return true;
        });

      totalSeen += rows.length;
      if (dryRun) {
        console.log(`${rows.length} found`);
      } else {
        let created = 0;
        for (let i = 0; i < rows.length; i += 500) {
          const res = await prisma.hospital.createMany({ data: rows.slice(i, i + 500), skipDuplicates: true });
          created += res.count;
        }
        totalNew += created;

        if (refresh) {
          for (const r of rows) {
            const { osmKey, ...data } = r;
            await prisma.hospital.updateMany({ where: { osmKey, status: 'UNCLAIMED' }, data });
          }
        }
        console.log(`${rows.length} found, ${created} new`);
      }
    } catch (err) {
      console.log(`FAILED (${(err as Error).message}). Re-run with --state=IN-${codes.split('|')[0]}`);
    }
    await sleep(4_000); // be polite to the public Overpass servers
  }

  console.log(`\n✅ Done. ${totalSeen} listings processed, ${totalNew} newly added.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
