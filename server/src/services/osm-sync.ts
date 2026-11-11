import { cellOf } from '../lib/geo.js';
import type { Db } from '../lib/prisma.js';
import type { OverpassClient, OsmFacility } from './overpass.js';

export const SYNC_RADIUS_KM = 20;
const TTL_MS = 30 * 24 * 3600 * 1000;

export interface SyncResult {
  status: 'cached' | 'synced' | 'failed';
  found: number;
  created: number;
  error?: string;
}

const inFlight = new Map<string, Promise<SyncResult>>();

function toData(f: OsmFacility) {
  return {
    name: f.name,
    type: f.type,
    addressLine: f.addressLine,
    city: f.city,
    state: f.state,
    postcode: f.postcode,
    lat: f.lat,
    lng: f.lng,
    phone: f.phone,
    email: f.email,
    website: f.website,
    ownership: f.ownership,
    hasEmergency: f.hasEmergency,
  };
}

/**
 * Imports real hospitals and blood banks around a point from OpenStreetMap. Each ~11 km cell is
 * fetched once and refreshed after 30 days. Facilities that a hospital has already claimed are never
 * overwritten by OSM data.
 */
export function ensureAreaSynced(
  db: Db,
  overpass: OverpassClient,
  lat: number,
  lng: number,
  opts: { force?: boolean } = {},
): Promise<SyncResult> {
  const cell = cellOf(lat, lng);
  const existing = inFlight.get(cell.key);
  if (existing) return existing;

  const job = (async (): Promise<SyncResult> => {
    if (!opts.force) {
      const area = await db.osmSyncArea.findUnique({ where: { key: cell.key } });
      if (area && Date.now() - area.syncedAt.getTime() < TTL_MS) return { status: 'cached', found: area.hospitalsFound, created: 0 };
    }
    let facilities: OsmFacility[];
    try {
      facilities = await overpass.fetchFacilities(cell.lat, cell.lng, SYNC_RADIUS_KM);
    } catch (err) {
      return { status: 'failed', found: 0, created: 0, error: err instanceof Error ? err.message : 'unknown' };
    }

    const known = await db.hospital.findMany({
      where: { osmId: { in: facilities.map((f) => f.osmId) } },
      select: { osmId: true, status: true },
    });
    const knownMap = new Map(known.map((k) => [k.osmId, k.status]));
    const fresh = facilities.filter((f) => !knownMap.has(f.osmId));
    const refresh = facilities.filter((f) => knownMap.get(f.osmId) === 'UNCLAIMED');

    if (fresh.length) {
      await db.hospital.createMany({
        data: fresh.map((f) => ({ ...toData(f), osmId: f.osmId, source: 'OSM' as const, status: 'UNCLAIMED' as const })),
        skipDuplicates: true,
      });
    }
    for (let i = 0; i < refresh.length; i += 25) {
      await Promise.all(
        refresh.slice(i, i + 25).map((f) => db.hospital.updateMany({ where: { osmId: f.osmId, status: 'UNCLAIMED' }, data: toData(f) })),
      );
    }

    await db.osmSyncArea.upsert({
      where: { key: cell.key },
      create: { key: cell.key, lat: cell.lat, lng: cell.lng, radiusKm: SYNC_RADIUS_KM, hospitalsFound: facilities.length },
      update: { hospitalsFound: facilities.length, radiusKm: SYNC_RADIUS_KM, syncedAt: new Date() },
    });
    return { status: 'synced', found: facilities.length, created: fresh.length };
  })().finally(() => inFlight.delete(cell.key));

  inFlight.set(cell.key, job);
  return job;
}
