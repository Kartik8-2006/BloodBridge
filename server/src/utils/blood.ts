import type { BloodGroup } from '@prisma/client';

export const BLOOD_GROUPS: BloodGroup[] = [
  'A_POS',
  'A_NEG',
  'B_POS',
  'B_NEG',
  'AB_POS',
  'AB_NEG',
  'O_POS',
  'O_NEG',
];

export const BLOOD_LABEL: Record<BloodGroup, string> = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
  O_POS: 'O+',
  O_NEG: 'O-',
};

/** Which recipient groups a donor of the given group can give red cells to. */
const CAN_DONATE_TO: Record<BloodGroup, BloodGroup[]> = {
  O_NEG: BLOOD_GROUPS,
  O_POS: ['O_POS', 'A_POS', 'B_POS', 'AB_POS'],
  A_NEG: ['A_NEG', 'A_POS', 'AB_NEG', 'AB_POS'],
  A_POS: ['A_POS', 'AB_POS'],
  B_NEG: ['B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
  B_POS: ['B_POS', 'AB_POS'],
  AB_NEG: ['AB_NEG', 'AB_POS'],
  AB_POS: ['AB_POS'],
};

export function canDonateTo(donor: BloodGroup): BloodGroup[] {
  return CAN_DONATE_TO[donor];
}

/** Which donor groups can give to a patient of the given group. */
export function compatibleDonorsFor(recipient: BloodGroup): BloodGroup[] {
  return BLOOD_GROUPS.filter((d) => CAN_DONATE_TO[d].includes(recipient));
}
