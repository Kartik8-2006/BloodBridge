import { ApiError } from '../lib/errors.js';

export interface Place {
  label: string;
  city: string | null;
  state: string | null;
  lat: number;
  lng: number;
}

export interface Geocoder {
  search(query: string): Promise<Place[]>;
  reverse(lat: number, lng: number): Promise<Place | null>;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
}

const cityOf = (a?: Record<string, string>) =>
  a?.city ?? a?.town ?? a?.village ?? a?.municipality ?? a?.county ?? a?.state_district ?? null;

function toPlace(r: NominatimResult): Place {
  return {
    label: r.display_name,
    city: cityOf(r.address),
    state: r.address?.state ?? null,
    lat: Number(r.lat),
    lng: Number(r.lon),
  };
}

export interface NominatimOptions {
  baseUrl: string;
  userAgent: string;
  countryCodes: string;
  fetchImpl?: typeof fetch;
}

/**
 * Nominatim usage policy: max 1 request per second, identify the app, cache results.
 * Calls are serialised through a queue and answers are cached for 10 minutes.
 */
export function createGeocoder(opts: NominatimOptions): Geocoder {
  const doFetch = opts.fetchImpl ?? fetch;
  const cache = new Map<string, { at: number; value: unknown }>();
  let chain: Promise<unknown> = Promise.resolve();
  let lastCall = 0;

  const run = <T>(key: string, url: string, map: (json: unknown) => T): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 600_000) return Promise.resolve(hit.value as T);

    const task = chain.then(async () => {
      const wait = Math.max(0, lastCall + 1100 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      lastCall = Date.now();
      const res = await doFetch(url, {
        headers: { 'User-Agent': opts.userAgent, 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new ApiError(502, 'geocoder_unavailable', 'Location search is unavailable right now. Try again shortly.');
      const value = map(await res.json());
      cache.set(key, { at: Date.now(), value });
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
      return value;
    });
    chain = task.catch(() => undefined);
    return task as Promise<T>;
  };

  return {
    search(query) {
      const q = query.trim().toLowerCase();
      const params = new URLSearchParams({ q: query.trim(), format: 'jsonv2', addressdetails: '1', limit: '6' });
      if (opts.countryCodes) params.set('countrycodes', opts.countryCodes);
      return run(`s:${q}`, `${opts.baseUrl}/search?${params}`, (json) => (json as NominatimResult[]).map(toPlace));
    },
    reverse(lat, lng) {
      const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '12', addressdetails: '1' });
      return run(`r:${lat.toFixed(3)}:${lng.toFixed(3)}`, `${opts.baseUrl}/reverse?${params}`, (json) => {
        const r = json as NominatimResult & { error?: string };
        return r.error ? null : toPlace(r);
      });
    },
  };
}
