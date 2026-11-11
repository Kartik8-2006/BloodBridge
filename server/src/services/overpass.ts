import { ApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export type FacilityKind = 'HOSPITAL' | 'BLOOD_BANK';

export interface OsmFacility {
  osmId: string;
  name: string;
  type: FacilityKind;
  lat: number;
  lng: number;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  ownership: string | null;
  hasEmergency: boolean;
}

export interface OverpassClient {
  fetchFacilities(lat: number, lng: number, radiusKm: number): Promise<OsmFacility[]>;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function buildQuery(lat: number, lng: number, radiusKm: number): string {
  const r = Math.round(radiusKm * 1000);
  const around = `(around:${r},${lat.toFixed(5)},${lng.toFixed(5)})`;
  return `[out:json][timeout:30];
(
  nwr["amenity"="hospital"]${around};
  nwr["healthcare"="hospital"]${around};
  nwr["amenity"="blood_bank"]${around};
  nwr["healthcare"="blood_donation"]${around};
);
out center tags;`;
}

const firstValue = (v?: string) => v?.split(';')[0]?.trim() || null;

/** OpenStreetMap is editable by anyone. Only http(s) links may reach our pages. */
export function safeWebsite(v?: string): string | null {
  const raw = firstValue(v);
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function ownershipOf(tags: Record<string, string>): string | null {
  const raw = (tags['operator:type'] ?? tags['ownership'] ?? '').toLowerCase();
  if (!raw) return null;
  if (['public', 'government', 'state'].includes(raw)) return 'government';
  if (['private', 'commercial'].includes(raw)) return 'private';
  if (['charitable', 'ngo', 'community', 'religious'].includes(raw)) return 'charity';
  return raw;
}

function addressOf(tags: Record<string, string>): string | null {
  if (tags['addr:full']) return tags['addr:full'];
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const area = tags['addr:suburb'] ?? tags['addr:neighbourhood'] ?? tags['addr:place'];
  const parts = [street, area].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Turns an Overpass response into clean facility records. Nameless elements are dropped. */
export function parseOverpass(json: { elements?: OverpassElement[] }): OsmFacility[] {
  const out = new Map<string, OsmFacility>();
  for (const el of json.elements ?? []) {
    const tags = el.tags;
    if (!tags) continue;
    const name = (tags.name ?? tags['name:en'] ?? '').trim();
    if (!name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const isHospital = tags.amenity === 'hospital' || tags.healthcare === 'hospital';
    const isBank = tags.amenity === 'blood_bank' || tags.healthcare === 'blood_donation';
    const osmId = `${el.type}/${el.id}`;
    if (out.has(osmId)) continue;
    out.set(osmId, {
      osmId,
      name,
      type: isBank && !isHospital ? 'BLOOD_BANK' : 'HOSPITAL',
      lat,
      lng,
      addressLine: addressOf(tags),
      city: tags['addr:city'] ?? tags['addr:district'] ?? null,
      state: tags['addr:state'] ?? null,
      postcode: tags['addr:postcode'] ?? null,
      phone: firstValue(tags.phone ?? tags['contact:phone']),
      email: firstValue(tags.email ?? tags['contact:email']),
      website: safeWebsite(tags.website ?? tags['contact:website']),
      ownership: ownershipOf(tags),
      hasEmergency: tags.emergency === 'yes',
    });
  }
  return [...out.values()];
}

export interface OverpassOptions {
  urls: string[];
  userAgent: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tries each Overpass mirror in order; the first that answers wins.
 * A busy mirror (429/502/503/504) gets one retry after a short pause before we move on.
 * Every failure is logged with its reason so "OpenStreetMap could not be reached" is diagnosable.
 */
export function createOverpassClient(opts: OverpassOptions): OverpassClient {
  const doFetch = opts.fetchImpl ?? fetch;
  const retryDelayMs = opts.retryDelayMs ?? 1500;
  return {
    async fetchFacilities(lat, lng, radiusKm) {
      const body = new URLSearchParams({ data: buildQuery(lat, lng, radiusKm) });
      let lastError: unknown;
      for (const url of opts.urls) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await doFetch(url, {
              method: 'POST',
              headers: {
                'User-Agent': opts.userAgent,
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body,
              signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
            });
            if (!res.ok) {
              const err = new Error(`Overpass responded ${res.status}`);
              (err as Error & { retryable?: boolean }).retryable = RETRYABLE.has(res.status);
              throw err;
            }
            return parseOverpass((await res.json()) as { elements?: OverpassElement[] });
          } catch (err) {
            lastError = err;
            const host = new URL(url).host;
            const retryable = (err as { retryable?: boolean }).retryable === true;
            logger.warn({ host, attempt, reason: err instanceof Error ? err.message : String(err) }, 'overpass request failed');
            if (retryable && attempt === 1) {
              await sleep(retryDelayMs);
              continue;
            }
            break;
          }
        }
      }
      throw new ApiError(502, 'osm_unavailable', 'The OpenStreetMap hospital service did not respond. Try again in a minute.', {
        cause: lastError instanceof Error ? lastError.message : String(lastError),
      });
    },
  };
}
