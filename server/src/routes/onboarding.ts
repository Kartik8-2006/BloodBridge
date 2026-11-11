import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';
import { requireUser } from '../middleware/auth.js';
import { checkDonorEligibility } from '../utils/eligibility.js';
import { BLOOD_GROUPS } from '../utils/blood.js';
import { audit, notify } from '../services/platform.service.js';
import { pushRoleToClerk } from '../services/user.service.js';

export const onboardingRouter = Router();

/** Indian mobile number, normalised to +91XXXXXXXXXX */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+91[-\s]?|0)?[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => `+91${v.replace(/\D/g, '').slice(-10)}`);

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

const location = {
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().min(2, 'State is required').max(80),
  latitude: lat.optional(),
  longitude: lng.optional(),
};

const donorBody = z.object({
  role: z.literal('DONOR'),
  phone: phoneSchema,
  bloodGroup: z.enum(BLOOD_GROUPS as [string, ...string[]]),
  dateOfBirth: z.coerce.date(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
  weightKg: z.number().min(30).max(250),
  lastDonationAt: z.coerce.date().optional(),
  hasChronicCondition: z.boolean(),
  healthDeclaration: z.literal(true, { error: 'You must confirm the health declaration' }),
  ...location,
});

const requesterBody = z.object({
  role: z.literal('REQUESTER'),
  phone: phoneSchema,
  ...location,
});

const hospitalBody = z.object({
    role: z.literal('HOSPITAL'),
    phone: phoneSchema,
    designation: z.string().trim().min(2, 'Your designation is required').max(80),
    licenseNumber: z.string().trim().min(4, 'Enter the hospital / blood bank licence number').max(60),
    hospitalId: z.string().min(1).optional(),
    newHospital: z
      .object({
        name: z.string().trim().min(3).max(150),
        address: z.string().trim().min(5).max(300),
        city: z.string().trim().min(2).max(80),
        state: z.string().trim().min(2).max(80),
        pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional(),
        phone: phoneSchema,
        latitude: lat,
        longitude: lng,
        hasBloodBank: z.boolean().default(false),
      })
      .optional(),
});

const body = z.discriminatedUnion('role', [donorBody, requesterBody, hospitalBody]);

/** POST /api/onboarding: finish signup by choosing a role (admins are never self-assigned). */
onboardingRouter.post('/', requireUser, async (req, res) => {
  const user = req.dbUser!;
  if (user.onboarded) throw conflict('Onboarding is already complete.');

  const parsed = body.parse(req.body);

  if (parsed.role === 'DONOR') {
    const reasons = checkDonorEligibility(parsed);
    if (reasons.length) throw unprocessable('You are not eligible to register as a donor right now.', { reasons });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role: 'DONOR', onboarded: true, phone: parsed.phone } });
      await tx.donorProfile.create({
        data: {
          userId: user.id,
          bloodGroup: parsed.bloodGroup as (typeof BLOOD_GROUPS)[number],
          dateOfBirth: parsed.dateOfBirth,
          gender: parsed.gender,
          weightKg: parsed.weightKg,
          city: parsed.city,
          state: parsed.state,
          latitude: parsed.latitude ?? null,
          longitude: parsed.longitude ?? null,
          lastDonationAt: parsed.lastDonationAt ?? null,
          hasChronicCondition: parsed.hasChronicCondition,
          healthDeclaredAt: new Date(),
        },
      });
      await notify(user.id, {
        title: 'Welcome to BloodBridge',
        body: 'Your donor profile is live. You will be alerted when a compatible patient needs blood near you.',
      }, tx);
      await audit(user.id, 'user.onboarded', 'User', user.id, { role: 'DONOR' }, tx);
    });
  } else if (parsed.role === 'REQUESTER') {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { role: 'REQUESTER', onboarded: true, phone: parsed.phone } });
      await tx.requesterProfile.create({
        data: {
          userId: user.id,
          city: parsed.city,
          state: parsed.state,
          latitude: parsed.latitude ?? null,
          longitude: parsed.longitude ?? null,
        },
      });
      await notify(user.id, {
        title: 'Welcome to BloodBridge',
        body: 'You can now raise a blood request and track it live.',
      }, tx);
      await audit(user.id, 'user.onboarded', 'User', user.id, { role: 'REQUESTER' }, tx);
    });
  } else {
    if (Boolean(parsed.hospitalId) === Boolean(parsed.newHospital))
      throw badRequest('Pick an existing hospital or add a new one');

    await prisma.$transaction(async (tx) => {
      let hospitalId: string;

      if (parsed.hospitalId) {
        const h = await tx.hospital.findUnique({ where: { id: parsed.hospitalId } });
        if (!h) throw notFound('That hospital does not exist.');
        if (h.status === 'PENDING' || h.status === 'VERIFIED')
          throw conflict('This hospital has already been claimed. Contact support if this is a mistake.');
        await tx.hospital.update({ where: { id: h.id }, data: { status: 'PENDING' } });
        hospitalId = h.id;
      } else if (parsed.newHospital) {
        const n = parsed.newHospital;
        const created = await tx.hospital.create({
          data: { ...n, source: 'registered', status: 'PENDING', type: 'UNKNOWN' },
        });
        hospitalId = created.id;
      } else {
        throw badRequest('Pick an existing hospital or add a new one');
      }

      await tx.user.update({ where: { id: user.id }, data: { role: 'HOSPITAL', onboarded: true, phone: parsed.phone } });
      await tx.hospitalStaff.create({
        data: {
          userId: user.id,
          hospitalId,
          designation: parsed.designation,
          licenseNumber: parsed.licenseNumber,
          status: 'PENDING',
        },
      });

      const admins = await tx.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
      for (const a of admins) {
        await notify(a.id, {
          type: 'HOSPITAL_VERIFICATION',
          title: 'New hospital verification request',
          body: `${user.name} submitted a claim. Review the licence details.`,
          link: '/admin/verifications',
        }, tx);
      }
      await notify(user.id, {
        type: 'HOSPITAL_VERIFICATION',
        title: 'Verification in progress',
        body: 'Our team is reviewing your licence details. You will be notified as soon as it is approved.',
      }, tx);
      await audit(user.id, 'hospital.claim_submitted', 'Hospital', hospitalId, undefined, tx);
    });
  }

  await pushRoleToClerk(user.clerkId, parsed.role);
  res.status(201).json({ ok: true, role: parsed.role });
});

const resubmitBody = z.object({
  designation: z.string().trim().min(2).max(80),
  licenseNumber: z.string().trim().min(4).max(60),
});

/** POST /api/onboarding/hospital-resubmit: after a rejection, fix the details and ask again. */
onboardingRouter.post('/hospital-resubmit', requireUser, async (req, res) => {
  const user = req.dbUser!;
  const data = resubmitBody.parse(req.body);

  const staff = await prisma.hospitalStaff.findUnique({ where: { userId: user.id }, include: { hospital: true } });
  if (!staff || staff.status !== 'REJECTED') throw conflict('There is no rejected verification to resubmit.');
  if (staff.hospital.status === 'PENDING' || staff.hospital.status === 'VERIFIED')
    throw conflict('This hospital is now claimed by someone else.');

  await prisma.$transaction(async (tx) => {
    await tx.hospitalStaff.update({
      where: { id: staff.id },
      data: { ...data, status: 'PENDING', reviewNote: null, reviewedAt: null, reviewedById: null },
    });
    await tx.hospital.update({ where: { id: staff.hospitalId }, data: { status: 'PENDING' } });
    await audit(user.id, 'hospital.claim_resubmitted', 'Hospital', staff.hospitalId, undefined, tx);
  });

  res.json({ ok: true });
});
