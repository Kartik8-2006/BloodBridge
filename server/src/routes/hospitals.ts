import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';

export const hospitalsRouter = Router();

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  type: z.enum(['GOVERNMENT', 'PRIVATE', 'TRUST', 'UNKNOWN']).optional(),
  bloodBank: z.enum(['true', 'false']).optional(),
  verifiedOnly: z.enum(['true', 'false']).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(300).default(25),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(300).default(20),
});

const publicSelect = {
  id: true,
  name: true,
  type: true,
  address: true,
  city: true,
  state: true,
  pincode: true,
  phone: true,
  website: true,
  latitude: true,
  longitude: true,
  hasBloodBank: true,
  hasEmergency: true,
  status: true,
} satisfies Prisma.HospitalSelect;

/** GET /api/hospitals: search real hospitals, optionally sorted by distance from lat/lng. */
hospitalsRouter.get('/', async (req, res) => {
  const f = listQuery.parse(req.query);
  const offset = (f.page - 1) * f.limit;

  // ── Nearby search (haversine, with a bounding box so the indexes help) ──
  if (f.lat !== undefined && f.lng !== undefined) {
    const dLat = f.radiusKm / 111;
    const dLng = f.radiusKm / (111 * Math.max(Math.cos((f.lat * Math.PI) / 180), 0.01));

    const conds: Prisma.Sql[] = [
      Prisma.sql`latitude BETWEEN ${f.lat - dLat}::float8 AND ${f.lat + dLat}::float8`,
      Prisma.sql`longitude BETWEEN ${f.lng - dLng}::float8 AND ${f.lng + dLng}::float8`,
    ];
    if (f.q) conds.push(Prisma.sql`(name ILIKE ${'%' + f.q + '%'} OR city ILIKE ${'%' + f.q + '%'})`);
    if (f.state) conds.push(Prisma.sql`lower(state) = lower(${f.state})`);
    if (f.city) conds.push(Prisma.sql`lower(city) = lower(${f.city})`);
    if (f.type) conds.push(Prisma.sql`"type" = ${f.type}::"HospitalType"`);
    if (f.bloodBank === 'true') conds.push(Prisma.sql`"hasBloodBank" = true`);
    if (f.verifiedOnly === 'true') conds.push(Prisma.sql`status = 'VERIFIED'::"VerificationStatus"`);

    const rows = await prisma.$queryRaw<{ id: string; distance: number; total: bigint }[]>(Prisma.sql`
      SELECT id, distance, COUNT(*) OVER() AS total FROM (
        SELECT id,
          2 * 6371 * asin(sqrt(
            power(sin(radians(latitude - ${f.lat}::float8) / 2), 2) +
            cos(radians(${f.lat}::float8)) * cos(radians(latitude)) *
            power(sin(radians(longitude - ${f.lng}::float8) / 2), 2)
          )) AS distance
        FROM "Hospital"
        WHERE ${Prisma.join(conds, ' AND ')}
      ) nearby
      WHERE distance <= ${f.radiusKm}::float8
      ORDER BY distance ASC
      LIMIT ${f.limit} OFFSET ${offset}
    `);

    const total = rows[0] ? Number(rows[0].total) : 0;
    const found = await prisma.hospital.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: publicSelect,
    });
    const byId = new Map(found.map((h) => [h.id, h]));
    const items = rows
      .map((r) => {
        const h = byId.get(r.id);
        return h ? { ...h, distanceKm: Math.round(r.distance * 10) / 10 } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    res.json({ items, total, page: f.page, limit: f.limit });
    return;
  }

  // ── Regular filtered search ──
  const where: Prisma.HospitalWhereInput = {
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { city: { contains: f.q, mode: 'insensitive' } }] } : {}),
    ...(f.state ? { state: { equals: f.state, mode: 'insensitive' } } : {}),
    ...(f.city ? { city: { equals: f.city, mode: 'insensitive' } } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.bloodBank === 'true' ? { hasBloodBank: true } : {}),
    ...(f.verifiedOnly === 'true' ? { status: 'VERIFIED' as const } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.hospital.findMany({
      where,
      select: publicSelect,
      orderBy: [{ hasBloodBank: 'desc' }, { name: 'asc' }],
      skip: offset,
      take: f.limit,
    }),
    prisma.hospital.count({ where }),
  ]);

  res.json({ items, total, page: f.page, limit: f.limit });
});

hospitalsRouter.get('/meta/states', async (_req, res) => {
  const rows = await prisma.hospital.groupBy({
    by: ['state'],
    where: { state: { not: null } },
    _count: { _all: true },
    orderBy: { state: 'asc' },
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(rows.map((r) => ({ state: r.state as string, count: r._count._all })));
});

hospitalsRouter.get('/meta/cities', async (req, res) => {
  const { state } = z.object({ state: z.string().trim().min(1) }).parse(req.query);
  const rows = await prisma.hospital.groupBy({
    by: ['city'],
    where: { state: { equals: state, mode: 'insensitive' }, city: { not: null } },
    _count: { _all: true },
    orderBy: { city: 'asc' },
  });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(rows.map((r) => ({ city: r.city as string, count: r._count._all })));
});

hospitalsRouter.get('/:id', async (req, res) => {
  const hospital = await prisma.hospital.findUnique({
    where: { id: String(req.params.id) },
    select: {
      ...publicSelect,
      email: true,
      inventory: { select: { bloodGroup: true, unitsTotal: true, unitsReserved: true, updatedAt: true } },
    },
  });
  if (!hospital) throw notFound('Hospital not found');
  // Stock is only public for hospitals that verified themselves and maintain it.
  res.json({ ...hospital, inventory: hospital.status === 'VERIFIED' ? hospital.inventory : [] });
});
