import { z } from 'zod';

/** Self-declared screening answers. Final screening is always done by a doctor at the hospital. */
export const healthSchema = z.object({
  recentIllness: z.boolean().default(false),
  takingAntibiotics: z.boolean().default(false),
  recentTattooOrPiercing: z.boolean().default(false),
  pregnantOrNursing: z.boolean().default(false),
  chronicCondition: z.boolean().default(false),
  recentSurgeryOrTransfusion: z.boolean().default(false),
});
export type HealthAnswers = z.infer<typeof healthSchema>;

export interface EligibilityInput {
  dateOfBirth: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  weightKg: number;
  lastDonationAt: Date | null;
  health: HealthAnswers;
}

export interface Eligibility {
  eligible: boolean;
  /** Plain-language reasons the donor cannot donate right now. Empty when eligible. */
  reasons: string[];
  /** Earliest date the donation gap rule allows, when that rule is what blocks the donor. */
  nextEligibleOn: string | null;
  daysUntilEligible: number | null;
}

export const MIN_AGE = 18;
export const MAX_AGE = 65;
export const MIN_WEIGHT_KG = 45;
/** Whole-blood donation gap in days (NBTC guidance: 3 months for men, 4 months for women). */
export const GAP_DAYS = { MALE: 90, FEMALE: 120, OTHER: 120 } as const;

const DAY_MS = 86_400_000;

export function ageOn(dob: Date, now: Date): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function evaluateEligibility(input: EligibilityInput, now = new Date()): Eligibility {
  const reasons: string[] = [];
  const age = ageOn(input.dateOfBirth, now);

  if (age < MIN_AGE) reasons.push(`Donors must be at least ${MIN_AGE} years old.`);
  if (age > MAX_AGE) reasons.push(`Donors must be ${MAX_AGE} or younger.`);
  if (input.weightKg < MIN_WEIGHT_KG) reasons.push(`Donors must weigh at least ${MIN_WEIGHT_KG} kg.`);

  let nextEligibleOn: Date | null = null;
  if (input.lastDonationAt) {
    const gap = GAP_DAYS[input.gender];
    const next = new Date(input.lastDonationAt.getTime() + gap * DAY_MS);
    if (next.getTime() > now.getTime()) {
      nextEligibleOn = next;
      reasons.push(`Your body needs ${gap} days between whole-blood donations.`);
    }
  }

  const h = input.health;
  if (h.recentIllness) reasons.push('Wait until you have fully recovered from fever, cold or infection (at least 14 days).');
  if (h.takingAntibiotics) reasons.push('Finish your antibiotics course before donating.');
  if (h.recentTattooOrPiercing) reasons.push('Wait 12 months after a tattoo, piercing or acupuncture.');
  if (h.pregnantOrNursing) reasons.push('Donation is not advised during pregnancy or breastfeeding.');
  if (h.chronicCondition) reasons.push('A doctor must clear you first if you have heart disease, epilepsy or uncontrolled diabetes or blood pressure.');
  if (h.recentSurgeryOrTransfusion) reasons.push('Wait 6 months after surgery or a blood transfusion.');

  const daysUntilEligible = nextEligibleOn ? Math.ceil((nextEligibleOn.getTime() - now.getTime()) / DAY_MS) : null;
  return {
    eligible: reasons.length === 0,
    reasons,
    nextEligibleOn: nextEligibleOn ? nextEligibleOn.toISOString().slice(0, 10) : null,
    daysUntilEligible,
  };
}
