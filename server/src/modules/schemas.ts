import { z } from 'zod';
import { healthSchema } from '../services/eligibility.js';

export const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'] as const;

export const phoneSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-()]/g, ''))
  .pipe(z.string().regex(/^\+?\d{10,13}$/, 'Enter a valid phone number, for example +919876543210'));

/** Website links are rendered as <a href>, so only http(s) is acceptable. `javascript:` URLs are valid URLs but not valid links. */
export const httpUrl = z
  .string()
  .trim()
  .url('Enter a valid website, including https://')
  .refine((u) => /^https?:\/\//i.test(u), 'The website must start with http:// or https://');

export const latSchema = z.coerce.number().min(-90, 'Invalid latitude').max(90, 'Invalid latitude');
export const lngSchema = z.coerce.number().min(-180, 'Invalid longitude').max(180, 'Invalid longitude');

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), 'Enter a valid date');

const nameSchema = z.string().trim().min(2, 'Enter your full name').max(80);
const citySchema = z.string().trim().min(2, 'Enter your city').max(80);

const donorShape = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, { error: 'Choose your blood group' }),
  dateOfBirth: dateOnly,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], { error: 'Choose a gender' }),
  weightKg: z.coerce.number().min(30, 'Enter your weight in kg').max(250, 'Enter your weight in kg'),
  city: citySchema,
  addressLine: z.string().trim().max(160).optional().nullable(),
  lat: latSchema,
  lng: lngSchema,
  lastDonationAt: dateOnly.nullable().optional(),
  health: healthSchema.prefault({}),
});

function donorChecks(
  v: { dateOfBirth: Date; lastDonationAt?: Date | null },
  ctx: { addIssue: (issue: { code: 'custom'; path: string[]; message: string }) => void },
) {
  const now = Date.now();
  const age = (now - v.dateOfBirth.getTime()) / (365.25 * 86_400_000);
  if (v.dateOfBirth.getTime() > now || age < 16 || age > 100) {
    ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'Enter a valid date of birth (16 years or older)' });
  }
  if (v.lastDonationAt && (v.lastDonationAt.getTime() > now || v.lastDonationAt <= v.dateOfBirth)) {
    ctx.addIssue({ code: 'custom', path: ['lastDonationAt'], message: 'Last donation date cannot be in the future' });
  }
}

export const donorFields = donorShape.superRefine(donorChecks);
export type DonorFields = z.infer<typeof donorFields>;

export const onboardSchema = z.discriminatedUnion('role', [
  donorShape.extend({ role: z.literal('DONOR'), name: nameSchema.optional(), phone: phoneSchema }).superRefine(donorChecks),
  z.object({ role: z.literal('REQUESTER'), name: nameSchema.optional(), phone: phoneSchema, city: citySchema, lat: latSchema, lng: lngSchema }),
  z.object({ role: z.literal('HOSPITAL'), name: nameSchema.optional(), phone: phoneSchema }),
]);

export const prefsSchema = z.object({
  emailAlerts: z.boolean(),
  communityAnnouncements: z.boolean(),
  smsAlerts: z.boolean(),
  language: z.enum(['en', 'hi', 'pa']),
});
export type Prefs = z.infer<typeof prefsSchema>;
export const DEFAULT_PREFS: Prefs = { emailAlerts: true, communityAnnouncements: true, smsAlerts: false, language: 'en' };

export const profilePatchSchema = z
  .object({
    name: nameSchema,
    phone: phoneSchema,
    city: citySchema,
    lat: latSchema,
    lng: lngSchema,
    prefs: prefsSchema.partial(),
  })
  .partial();

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const URGENCIES = ['CRITICAL', 'URGENT', 'PLANNED'] as const;

export const createRequestSchema = z.object({
  hospitalId: z.string().min(1, 'Choose the hospital'),
  patientName: z.string().trim().min(2, 'Enter the patient name').max(80),
  bloodGroup: z.enum(BLOOD_GROUPS, { error: 'Choose the blood group needed' }),
  unitsNeeded: z.coerce.number().int().min(1, 'At least 1 unit').max(10, 'At most 10 units per request'),
  urgency: z.enum(URGENCIES, { error: 'Choose how urgent this is' }),
  neededBy: z.coerce.date({ error: 'Enter when the blood is needed' }),
  contactPhone: phoneSchema.optional(),
  note: z.string().trim().max(500).optional(),
});

export const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6 digit code') });

/* ------------------------------------------------------------------ phase 3 */
export const stockAdjustSchema = z.object({
  bloodGroup: z.enum(BLOOD_GROUPS, { error: 'Choose the blood group' }),
  delta: z.coerce.number().int('Enter whole units').refine((n) => n !== 0, 'Enter at least 1 unit').refine((n) => Math.abs(n) <= 500, 'At most 500 units at once'),
  reason: z.enum(['RECEIVED', 'ISSUED', 'EXPIRED', 'ADJUSTED']),
  note: z.string().trim().max(200).optional(),
});

export const stockBatchSchema = z.object({
  changes: z.array(stockAdjustSchema).min(1, 'Nothing to save').max(8),
  note: z.string().trim().max(200).optional(),
});

export const thresholdSchema = z.object({ lowStockThreshold: z.coerce.number().int().min(0).max(500) });

export const campSchema = z
  .object({
    title: z.string().trim().min(4, 'Give the camp a title').max(100),
    description: z.string().trim().max(600).optional(),
    venue: z.string().trim().min(3, 'Enter the venue').max(160),
    city: z.string().trim().min(2).max(80).optional(),
    lat: latSchema.optional(),
    lng: lngSchema.optional(),
    startsAt: z.coerce.date({ error: 'Enter the start time' }),
    endsAt: z.coerce.date({ error: 'Enter the end time' }),
    capacity: z.coerce.number().int().min(1, 'At least 1 donor').max(1000, 'At most 1000 donors'),
  })
  .superRefine((v, ctx) => {
    const now = Date.now();
    if (v.startsAt.getTime() < now) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'The camp must start in the future' });
    if (v.startsAt.getTime() > now + 180 * 86_400_000) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: 'Camps can be scheduled up to 6 months ahead' });
    if (v.endsAt <= v.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'The camp must end after it starts' });
    else if (v.endsAt.getTime() - v.startsAt.getTime() > 12 * 3_600_000) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A camp can run at most 12 hours' });
    if ((v.lat === undefined) !== (v.lng === undefined)) ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Provide both latitude and longitude, or neither' });
  });

export const attendanceSchema = z.object({ status: z.enum(['ATTENDED', 'NO_SHOW']) });

export const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(10)
    .refine((m) => m.at(-1)?.role === 'user', 'The last message must be from the user'),
  /** The page the person is looking at, so "how do I do this here" has an answer. Only a path, never trusted as an instruction. */
  page: z.string().trim().max(120).regex(/^\/[A-Za-z0-9/_\-#.]*$/).optional(),
});

export const triageSchema = z.object({ description: z.string().trim().min(10, 'Describe the situation in a sentence or two').max(800) });
