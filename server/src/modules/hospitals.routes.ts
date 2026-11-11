import { randomUUID } from 'node:crypto';

import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { currentUser, requireRole } from '../middleware/auth.js';
import { ApiError } from '../lib/errors.js';
import { boundingBox, haversineKm, round1 } from '../lib/geo.js';
import { parse } from '../lib/validate.js';
import type { Deps } from '../deps.js';
import type { Prisma } from '../generated/prisma/client.js';
import { serializeOwnHospital, serializePublicHospital } from './presenters.js';
import { httpUrl, latSchema, lngSchema, phoneSchema } from './schemas.js';
import { screenLicence } from '../services/fraud.js';
import { audit, notify, notifyAdmins } from '../services/notify.js';
import { ensureAreaSynced } from '../services/osm-sync.js';
import { MAX_DOC_BYTES, sniffDocument } from '../services/storage.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_DOC_BYTES, files: 1 } });

const boolString = z.enum(['true', 'false']).transform((v) => v === 'true');
const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

const claimFields = {
  licenseNumber: text(4, 60, 'Enter the license or registration number'),
  contactPerson: text(2, 80, 'Enter the name of the authorised person'),
  contactDesignation: text(2, 80, 'Enter their designation'),
  phone: phoneSchema.optional(),
};

const claimSchema = z.object({ hospitalId: z.string().min(1), ...claimFields });

const registerSchema = z.object({
  name: text(3, 120, 'Enter the facility name'),
  type: z.enum(['HOSPITAL', 'BLOOD_BANK']),
  addressLine: text(5, 200, 'Enter the street address'),
  city: text(2, 80, 'Enter the city'),
  state: text(2, 80, 'Enter the state'),
  postcode: z.string().trim().max(12).optional(),
  lat: latSchema,
  lng: lngSchema,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('').transform(() => undefined)),
  website: httpUrl.optional().or(z.literal('').transform(() => undefined)),
  ownership: z.enum(['private', 'government', 'charity']),
  hasEmergency: boolString.default(false),
  ...claimFields,
  phone: phoneSchema,
});

const ownPatchSchema = z
  .object({
    phone: phoneSchema,
    email: z.string().trim().email('Enter a valid email').nullable(),
    website: httpUrl.nullable(),
    addressLine: text(5, 200, 'Enter the street address'),
    hasEmergency: z.boolean(),
    contactPerson: text(2, 80, 'Enter the name of the authorised person'),
  })
  .partial();

const listSchema = z.object({
  lat: latSchema.optional(),
  lng: lngSchema.optional(),
  radiusKm: z.coerce.number().min(1).max(50).default(10),
  q: z.string().trim().max(80).optional(),
  type: z.enum(['HOSPITAL', 'BLOOD_BANK']).optional(),
  verifiedOnly: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(60),
});

function readDocument(req: Request) {
  if (!req.file) throw new ApiError(400, 'validation_failed', 'Attach the license document.', { file: 'Attach a PDF, JPG or PNG of the license' });
  const kind = sniffDocument(req.file.buffer);
  if (!kind) throw new ApiError(400, 'validation_failed', 'That file type is not supported.', { file: 'Upload a PDF, JPG or PNG' });
  return { buffer: req.file.buffer, ...kind };
}

/** Public directory plus the hospital-staff workflow (claim, register, resubmit). */
export function hospitalsRouter(d: Deps, authed: RequestHandler[]) {
  const r = Router();
  const hospitalOnly = [...authed, requireRole('HOSPITAL')];

  // ───────────── Public directory ─────────────
  r.get('/', async (req, res) => {
    const q = parse(listSchema, req.query);
    const hasPoint = q.lat !== undefined && q.lng !== undefined;
    if (!hasPoint && (!q.q || q.q.length < 2)) {
      throw new ApiError(400, 'validation_failed', 'Search by location or type at least 2 letters of a name.');
    }

    // Never show a facility someone registered on the platform until an admin verified it.
    const visible: Prisma.HospitalWhereInput = { OR: [{ source: 'OSM' }, { status: 'VERIFIED' }] };
    const where: Prisma.HospitalWhereInput[] = [visible];
    if (q.type) where.push({ type: q.type });
    if (q.verifiedOnly === 'true') where.push({ status: 'VERIFIED' });
    if (q.q) where.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] });

    if (!hasPoint) {
      const rows = await d.db.hospital.findMany({ where: { AND: where }, orderBy: [{ status: 'asc' }, { name: 'asc' }], take: 30 });
      res.json({ items: rows.map((h) => serializePublicHospital(h)), sync: null });
      return;
    }

    const sync = await ensureAreaSynced(d.db, d.overpass, q.lat!, q.lng!);
    const box = boundingBox(q.lat!, q.lng!, q.radiusKm);
    where.push({ lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } });
    const rows = await d.db.hospital.findMany({ where: { AND: where }, take: 500 });

    const items = rows
      .map((h) => ({ h, km: haversineKm(q.lat!, q.lng!, h.lat, h.lng) }))
      .filter((x) => x.km <= q.radiusKm)
      .sort((a, b) => Number(b.h.status === 'VERIFIED') - Number(a.h.status === 'VERIFIED') || a.km - b.km)
      .slice(0, q.limit)
      .map(({ h, km }) => serializePublicHospital(h, round1(km)));

    res.json({ items, sync: { status: sync.status, found: sync.found } });
  });

  // ───────────── Hospital staff ─────────────
  r.get('/mine', ...hospitalOnly, async (req, res) => {
    const me = currentUser(req);
    if (!me.hospitalId) throw ApiError.notFound('You have not linked a hospital yet.');
    const h = await d.db.hospital.findUniqueOrThrow({ where: { id: me.hospitalId }, include: { _count: { select: { staff: true } } } });
    res.json({ hospital: serializeOwnHospital(h) });
  });

  r.patch('/mine', ...hospitalOnly, async (req, res) => {
    const me = currentUser(req);
    if (!me.hospitalId) throw ApiError.notFound('You have not linked a hospital yet.');
    const patch = parse(ownPatchSchema, req.body);
    const current = await d.db.hospital.findUniqueOrThrow({ where: { id: me.hospitalId } });
    if (current.status === 'SUSPENDED') throw ApiError.forbidden('This hospital is suspended. Contact support.');
    const h = await d.db.hospital.update({ where: { id: current.id }, data: patch, include: { _count: { select: { staff: true } } } });
    res.json({ hospital: serializeOwnHospital(h) });
  });

  r.post('/claim', ...hospitalOnly, upload.single('file'), async (req, res) => {
    const me = currentUser(req);
    if (me.hospitalId) throw ApiError.conflict('Your account is already linked to a hospital.', 'already_linked');
    const body = parse(claimSchema, req.body);
    const doc = readDocument(req);

    const target = await d.db.hospital.findUnique({ where: { id: body.hospitalId } });
    if (!target) throw ApiError.notFound('That hospital is not in the directory.');
    if (target.status !== 'UNCLAIMED') throw ApiError.conflict('Another representative has already claimed this hospital.', 'already_claimed');

    const path = `${target.id}/${randomUUID()}-license.${doc.ext}`;
    await d.storage.upload(path, doc.buffer, doc.mime);
    try {
      await d.db.$transaction(async (tx) => {
        const won = await tx.hospital.updateMany({
          where: { id: target.id, status: 'UNCLAIMED' },
          data: {
            status: 'PENDING',
            claimedById: me.id,
            licenseNumber: body.licenseNumber,
            licenseDocPath: path,
            contactPerson: body.contactPerson,
            contactDesignation: body.contactDesignation,
            phone: body.phone ?? target.phone,
            submittedAt: new Date(),
          },
        });
        if (won.count === 0) throw ApiError.conflict('Another representative has already claimed this hospital.', 'already_claimed');
        await tx.user.update({ where: { id: me.id }, data: { hospitalId: target.id, phone: body.phone ?? me.phone } });
      });
    } catch (err) {
      await d.storage.remove(path).catch(() => undefined);
      throw err;
    }

    await Promise.all([
      notify(d.db, me.id, { type: 'HOSPITAL_SUBMITTED', title: 'Submitted for verification', body: `${target.name} is now in the review queue. We usually respond within two working days.` }),
      notifyAdmins(d.db, { type: 'SYSTEM', title: 'Hospital awaiting review', body: `${target.name} submitted license ${body.licenseNumber}.`, data: { hospitalId: target.id } }),
      audit(d.db, me.id, 'hospital.claimed', 'Hospital', target.id, { licenseNumber: body.licenseNumber }),
      screenLicence(d.db, target.id, body.licenseNumber, me.id),
    ]);
    const h = await d.db.hospital.findUniqueOrThrow({ where: { id: target.id }, include: { _count: { select: { staff: true } } } });
    res.status(201).json({ hospital: serializeOwnHospital(h) });
  });

  r.post('/register', ...hospitalOnly, upload.single('file'), async (req, res) => {
    const me = currentUser(req);
    if (me.hospitalId) throw ApiError.conflict('Your account is already linked to a hospital.', 'already_linked');
    const body = parse(registerSchema, req.body);
    const doc = readDocument(req);

    // Catch accidental duplicates of an OpenStreetMap listing: same name within ~150 m.
    const box = boundingBox(body.lat, body.lng, 0.15);
    const nearby = await d.db.hospital.findMany({
      where: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng } },
      select: { id: true, name: true },
    });
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const dup = nearby.find((n) => norm(n.name) === norm(body.name));
    if (dup) throw ApiError.conflict(`"${dup.name}" is already listed at this location. Claim it instead of adding a new one.`, 'duplicate_facility');

    const id = randomUUID();
    const path = `${id}/${randomUUID()}-license.${doc.ext}`;
    await d.storage.upload(path, doc.buffer, doc.mime);
    try {
      await d.db.$transaction(async (tx) => {
        await tx.hospital.create({
          data: {
            id,
            source: 'PLATFORM',
            status: 'PENDING',
            type: body.type,
            name: body.name,
            addressLine: body.addressLine,
            city: body.city,
            state: body.state,
            postcode: body.postcode ?? null,
            lat: body.lat,
            lng: body.lng,
            phone: body.phone,
            email: body.email ?? null,
            website: body.website ?? null,
            ownership: body.ownership,
            hasEmergency: body.hasEmergency,
            licenseNumber: body.licenseNumber,
            licenseDocPath: path,
            contactPerson: body.contactPerson,
            contactDesignation: body.contactDesignation,
            claimedById: me.id,
            submittedAt: new Date(),
          },
        });
        await tx.user.update({ where: { id: me.id }, data: { hospitalId: id, phone: body.phone } });
      });
    } catch (err) {
      await d.storage.remove(path).catch(() => undefined);
      throw err;
    }

    await Promise.all([
      notify(d.db, me.id, { type: 'HOSPITAL_SUBMITTED', title: 'Submitted for verification', body: `${body.name} is now in the review queue. We usually respond within two working days.` }),
      notifyAdmins(d.db, { type: 'SYSTEM', title: 'Hospital awaiting review', body: `${body.name} registered with license ${body.licenseNumber}.`, data: { hospitalId: id } }),
      audit(d.db, me.id, 'hospital.registered', 'Hospital', id, { licenseNumber: body.licenseNumber }),
      screenLicence(d.db, id, body.licenseNumber, me.id),
    ]);
    const h = await d.db.hospital.findUniqueOrThrow({ where: { id }, include: { _count: { select: { staff: true } } } });
    res.status(201).json({ hospital: serializeOwnHospital(h) });
  });

  r.post('/mine/resubmit', ...hospitalOnly, upload.single('file'), async (req, res) => {
    const me = currentUser(req);
    if (!me.hospitalId) throw ApiError.notFound('You have not linked a hospital yet.');
    const current = await d.db.hospital.findUniqueOrThrow({ where: { id: me.hospitalId } });
    if (current.status !== 'REJECTED') throw ApiError.conflict('Only a rejected submission can be resubmitted.', 'not_rejected');

    const fields = parse(
      z.object({ licenseNumber: claimFields.licenseNumber.optional(), contactPerson: claimFields.contactPerson.optional(), contactDesignation: claimFields.contactDesignation.optional() }),
      req.body,
    );
    let path = current.licenseDocPath;
    if (req.file) {
      const doc = readDocument(req);
      path = `${current.id}/${randomUUID()}-license.${doc.ext}`;
      await d.storage.upload(path, doc.buffer, doc.mime);
    }
    const h = await d.db.hospital.update({
      where: { id: current.id },
      data: { ...fields, licenseDocPath: path, status: 'PENDING', submittedAt: new Date(), reviewedAt: null, reviewedById: null, reviewNote: null },
      include: { _count: { select: { staff: true } } },
    });
    await Promise.all([
      notifyAdmins(d.db, { type: 'SYSTEM', title: 'Hospital resubmitted', body: `${h.name} fixed its submission and is awaiting review again.`, data: { hospitalId: h.id } }),
      audit(d.db, me.id, 'hospital.resubmitted', 'Hospital', h.id),
    ]);
    res.json({ hospital: serializeOwnHospital(h) });
  });

  // ───────────── Public detail (keep last so it never shadows /mine) ─────────────
  r.get('/:id', async (req, res) => {
    const h = await d.db.hospital.findUnique({ where: { id: String(req.params.id) } });
    if (!h || (h.source === 'PLATFORM' && h.status !== 'VERIFIED')) throw ApiError.notFound('Hospital not found.');
    res.json({ hospital: serializePublicHospital(h) });
  });

  return r;
}
