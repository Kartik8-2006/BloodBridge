import { randomInt, createHash, randomBytes } from 'node:crypto';
import type { BloodGroup, Urgency } from '../generated/prisma/client.js';
import type { Db } from '../lib/prisma.js';
import { boundingBox, haversineKm, round1 } from '../lib/geo.js';
import { evaluateEligibility, healthSchema } from './eligibility.js';

/** Which donor groups can give red cells to a recipient of the key group. */
export const CAN_RECEIVE_FROM: Record<BloodGroup, BloodGroup[]> = {
  O_NEG: ['O_NEG'],
  O_POS: ['O_NEG', 'O_POS'],
  A_NEG: ['O_NEG', 'A_NEG'],
  A_POS: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS'],
  B_NEG: ['O_NEG', 'B_NEG'],
  B_POS: ['O_NEG', 'O_POS', 'B_NEG', 'B_POS'],
  AB_NEG: ['O_NEG', 'A_NEG', 'B_NEG', 'AB_NEG'],
  AB_POS: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
};

export const RADIUS_KM: Record<Urgency, number> = { CRITICAL: 30, URGENT: 20, PLANNED: 10 };
export const MAX_INVITES = 60;
export const ESCALATION_FACTOR = 1.5;
export const MAX_RADIUS_KM = 60;

export interface Match {
  userId: string;
  distanceKm: number;
}

interface MatchInput {
  requestId?: string;
  requesterId: string;
  bloodGroup: BloodGroup;
  lat: number;
  lng: number;
  radiusKm: number;
  now?: Date;
}

/**
 * Compatible, available, eligible donors around the hospital, nearest first.
 * Skips the requester, suspended accounts, donors already invited to this request,
 * and donors who are already committed to another open request.
 */
export async function findMatches(db: Db, input: MatchInput): Promise<Match[]> {
  const now = input.now ?? new Date();
  const box = boundingBox(input.lat, input.lng, input.radiusKm);
  const [profiles, busy, already] = await Promise.all([
    db.donorProfile.findMany({
      where: {
        available: true,
        bloodGroup: { in: CAN_RECEIVE_FROM[input.bloodGroup] },
        lat: { gte: box.minLat, lte: box.maxLat },
        lng: { gte: box.minLng, lte: box.maxLng },
        user: { status: 'ACTIVE', id: { not: input.requesterId } },
      },
    }),
    db.donorResponse.findMany({
      where: { status: 'ACCEPTED', request: { status: 'OPEN', neededBy: { gt: now } } },
      select: { donorId: true },
    }),
    input.requestId ? db.donorResponse.findMany({ where: { requestId: input.requestId }, select: { donorId: true } }) : Promise.resolve([]),
  ]);
  const skip = new Set([...busy, ...already].map((r) => r.donorId));

  return profiles
    .filter((p) => !skip.has(p.userId))
    .map((p) => ({ p, km: haversineKm(input.lat, input.lng, p.lat, p.lng) }))
    .filter(({ p, km }) => {
      if (km > input.radiusKm) return false;
      const health = healthSchema.safeParse(p.health);
      if (!health.success) return false;
      return evaluateEligibility(
        { dateOfBirth: p.dateOfBirth, gender: p.gender, weightKg: p.weightKg, lastDonationAt: p.lastDonationAt, health: health.data },
        now,
      ).eligible;
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_INVITES)
    .map(({ p, km }) => ({ userId: p.userId, distanceKm: round1(km) }));
}

/** Six digits the donor shows at the hospital desk. */
export const generateCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCode = (responseId: string, code: string) => createHash('sha256').update(`${responseId}:${code}`).digest('hex');
export const CODE_TTL_MS = 12 * 60 * 60_000;

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Printed on the certificate and checked on the public verification page. */
export function certificateNumber(now = new Date()): string {
  const bytes = randomBytes(8);
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `BB-${now.getUTCFullYear()}-${body.slice(0, 4)}-${body.slice(4)}`;
}
