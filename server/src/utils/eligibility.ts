import type { Gender } from '@prisma/client';

/**
 * Donor eligibility constants. These follow commonly used Indian whole-blood donation
 * guidelines, but they are plain constants so a medical advisor can tune them in one place.
 */
export const ELIGIBILITY = {
  minAge: 18,
  maxAge: 65,
  minWeightKg: 45,
  gapDays: { MALE: 90, FEMALE: 120, OTHER: 120 } as Record<Gender, number>,
};

export function ageFromDob(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

export function checkDonorEligibility(input: {
  dateOfBirth: Date;
  weightKg: number;
  hasChronicCondition: boolean;
}): string[] {
  const reasons: string[] = [];
  const age = ageFromDob(input.dateOfBirth);
  if (age < ELIGIBILITY.minAge) reasons.push(`Donors must be at least ${ELIGIBILITY.minAge} years old.`);
  if (age > ELIGIBILITY.maxAge) reasons.push(`Donors must be ${ELIGIBILITY.maxAge} years old or younger.`);
  if (input.weightKg < ELIGIBILITY.minWeightKg)
    reasons.push(`Minimum donor weight is ${ELIGIBILITY.minWeightKg} kg.`);
  if (input.hasChronicCondition)
    reasons.push('Donors with an ongoing chronic condition should consult a doctor before registering.');
  return reasons;
}

export function nextEligibleDate(lastDonationAt: Date | null, gender: Gender): Date | null {
  if (!lastDonationAt) return null;
  const d = new Date(lastDonationAt);
  d.setDate(d.getDate() + ELIGIBILITY.gapDays[gender]);
  return d;
}
