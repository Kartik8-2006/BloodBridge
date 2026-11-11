import type { Db } from '../lib/prisma.js';
import type { BloodGroup } from '../generated/prisma/client.js';
import { boundingBox } from '../lib/geo.js';
import { BLOOD_GROUPS } from '../modules/schemas.js';
import { CAN_RECEIVE_FROM } from './matching.js';
import { stockStatus } from './inventory.js';

export const WEEK_MS = 7 * 86_400_000;
export const FORECAST_WEEKS = 8;

export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface GroupForecast {
  bloodGroup: BloodGroup;
  stock: number;
  stockStatus: 'OUT' | 'LOW' | 'OK';
  /** Units expected to be needed in the next 7 days. */
  expectedWeeklyDemand: number;
  /** How many days current stock lasts at the expected pace. Null when there is no demand. */
  daysOfCover: number | null;
  risk: Risk;
  /** Registered, available donors within 25 km whose blood group can be given to this group. */
  reachableDonors: number;
}

/**
 * Deterministic demand forecast: units requested through BloodBridge plus units the desk issued,
 * weighted towards the most recent weeks. The language model only explains these numbers, it never makes them.
 */
export async function forecastFor(db: Db, h: { id: string; lat: number; lng: number; lowStockThreshold: number }, now = new Date()): Promise<GroupForecast[]> {
  const since = new Date(now.getTime() - FORECAST_WEEKS * WEEK_MS);
  const [requests, issued, items] = await Promise.all([
    db.bloodRequest.findMany({ where: { hospitalId: h.id, createdAt: { gte: since } }, select: { bloodGroup: true, unitsNeeded: true, createdAt: true } }),
    db.inventoryLog.findMany({ where: { hospitalId: h.id, reason: 'ISSUED', createdAt: { gte: since } }, select: { bloodGroup: true, delta: true, createdAt: true } }),
    db.inventoryItem.findMany({ where: { hospitalId: h.id } }),
  ]);
  const box = boundingBox(h.lat, h.lng, 25);
  const donors = await db.donorProfile.groupBy({
    by: ['bloodGroup'],
    where: { available: true, lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
    _count: true,
  });
  const donorCount = new Map(donors.map((x) => [x.bloodGroup, x._count]));
  const stock = new Map(items.map((i) => [i.bloodGroup, i.units]));

  /** Last 4 weeks count double: demand a month ago says less about next week than demand last week. */
  const weight = (at: Date) => (now.getTime() - at.getTime() <= 4 * WEEK_MS ? 2 : 1);
  const totalWeight = 4 * 2 + 4 * 1;

  return BLOOD_GROUPS.map((bloodGroup) => {
    let weighted = 0;
    for (const q of requests) if (q.bloodGroup === bloodGroup) weighted += q.unitsNeeded * weight(q.createdAt);
    for (const l of issued) if (l.bloodGroup === bloodGroup) weighted += Math.abs(l.delta) * weight(l.createdAt);
    const expectedWeeklyDemand = Math.round((weighted / totalWeight) * 10) / 10;
    const units = stock.get(bloodGroup) ?? 0;
    const perDay = expectedWeeklyDemand / 7;
    const daysOfCover = perDay > 0 ? Math.round((units / perDay) * 10) / 10 : null;
    let risk: Risk = 'LOW';
    if (expectedWeeklyDemand > 0 || units <= h.lowStockThreshold) {
      if (units === 0 && expectedWeeklyDemand > 0) risk = 'CRITICAL';
      else if (daysOfCover !== null && daysOfCover < 3) risk = 'HIGH';
      else if ((daysOfCover !== null && daysOfCover < 7) || units <= h.lowStockThreshold) risk = 'MEDIUM';
    }
    const reachable = BLOOD_GROUPS.filter((g) => CAN_RECEIVE_FROM[bloodGroup].includes(g)).reduce((s, g) => s + (donorCount.get(g) ?? 0), 0);
    return { bloodGroup, stock: units, stockStatus: stockStatus(units, h.lowStockThreshold), expectedWeeklyDemand, daysOfCover, risk, reachableDonors: reachable };
  });
}
