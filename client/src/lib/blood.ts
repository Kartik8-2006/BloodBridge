import type { BloodGroup } from './types';

export const BLOOD_GROUPS: BloodGroup[] = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];

export const bloodLabel = (g: BloodGroup) => g.replace('_POS', '+').replace('_NEG', '−');

/** Red-cell compatibility: which recipient groups can safely receive this group's red cells. */
const CAN_GIVE_TO: Record<BloodGroup, BloodGroup[]> = {
  O_NEG: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
  O_POS: ['O_POS', 'A_POS', 'B_POS', 'AB_POS'],
  A_NEG: ['A_NEG', 'A_POS', 'AB_NEG', 'AB_POS'],
  A_POS: ['A_POS', 'AB_POS'],
  B_NEG: ['B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
  B_POS: ['B_POS', 'AB_POS'],
  AB_NEG: ['AB_NEG', 'AB_POS'],
  AB_POS: ['AB_POS'],
};

export const canGiveTo = (g: BloodGroup) => CAN_GIVE_TO[g];
export const canReceiveFrom = (g: BloodGroup) => BLOOD_GROUPS.filter((d) => CAN_GIVE_TO[d].includes(g));
