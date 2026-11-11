import { clsx } from 'clsx';
import { useState, type FormEvent } from 'react';
import { BLOOD_GROUPS, bloodLabel } from '../../lib/blood';
import { todayIso } from '../../lib/format';
import type { BloodGroup, DonorInfo, Gender, HealthAnswers } from '../../lib/types';
import { Button } from '../ui/Button';
import { Checkbox, Field, Input, Select } from '../ui/Form';
import { LocationPicker, type GeoValue } from './LocationPicker';

export const EMPTY_HEALTH: HealthAnswers = {
  recentIllness: false,
  takingAntibiotics: false,
  recentTattooOrPiercing: false,
  pregnantOrNursing: false,
  chronicCondition: false,
  recentSurgeryOrTransfusion: false,
};

const HEALTH_QUESTIONS: [keyof HealthAnswers, string][] = [
  ['recentIllness', 'I had a fever, cold or infection in the last 14 days'],
  ['takingAntibiotics', 'I am taking antibiotics'],
  ['recentTattooOrPiercing', 'I had a tattoo, piercing or acupuncture in the last 12 months'],
  ['pregnantOrNursing', 'I am pregnant or breastfeeding'],
  ['chronicCondition', 'I have heart disease, epilepsy, or uncontrolled diabetes or blood pressure'],
  ['recentSurgeryOrTransfusion', 'I had surgery or a blood transfusion in the last 6 months'],
];

export interface DonorPayload {
  bloodGroup: BloodGroup;
  dateOfBirth: string;
  gender: Gender;
  weightKg: number;
  city: string;
  lat: number;
  lng: number;
  lastDonationAt: string | null;
  health: HealthAnswers;
}

interface Props {
  initial?: DonorInfo;
  submitLabel: string;
  pending: boolean;
  errors?: Record<string, string>;
  onSubmit: (payload: DonorPayload) => void;
  children?: React.ReactNode;
}

/** The donor health profile. Used when joining and when editing from Profile. */
export function DonorForm({ initial, submitLabel, pending, errors = {}, onSubmit, children }: Props) {
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>(initial?.bloodGroup ?? '');
  const [dob, setDob] = useState(initial?.dateOfBirth ?? '');
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? '');
  const [weight, setWeight] = useState(initial ? String(initial.weightKg) : '');
  const [place, setPlace] = useState<GeoValue | null>(initial ? { city: initial.city, lat: initial.lat, lng: initial.lng } : null);
  const [last, setLast] = useState(initial?.lastDonationAt ?? '');
  const [health, setHealth] = useState<HealthAnswers>(initial?.health ?? EMPTY_HEALTH);
  const [local, setLocal] = useState<Record<string, string>>({});
  const err = { ...local, ...errors };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!bloodGroup) next.bloodGroup = 'Choose your blood group';
    if (!dob) next.dateOfBirth = 'Enter your date of birth';
    if (!gender) next.gender = 'Choose a gender';
    if (!weight || Number(weight) < 30) next.weightKg = 'Enter your weight in kg';
    if (!place) next.city = 'Search and pick your city';
    setLocal(next);
    if (Object.keys(next).length || !bloodGroup || !gender || !place) return;
    onSubmit({
      bloodGroup,
      dateOfBirth: dob,
      gender,
      weightKg: Number(weight),
      city: place.city,
      lat: place.lat,
      lng: place.lng,
      lastDonationAt: last || null,
      health,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      {children}

      <Field label="Blood group" error={err.bloodGroup}>
        <div role="radiogroup" aria-label="Blood group" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {BLOOD_GROUPS.map((g) => (
            <button
              type="button"
              key={g}
              role="radio"
              aria-checked={bloodGroup === g}
              onClick={() => setBloodGroup(g)}
              className={clsx(
                'h-12 cursor-pointer rounded-2xl border text-base font-extrabold transition',
                bloodGroup === g ? 'border-brand-600 bg-brand-600 text-white shadow-glow' : 'border-ink-200 bg-ink-50 text-ink-800 hover:border-ink-300',
              )}
            >
              {bloodLabel(g)}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Date of birth" error={err.dateOfBirth}>
          <Input type="date" value={dob} max={todayIso()} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label="Gender" error={err.gender}>
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="">Select</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
        </Field>
        <Field label="Weight (kg)" error={err.weightKg}>
          <Input type="number" inputMode="decimal" min={30} max={250} step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 62" />
        </Field>
      </div>

      <LocationPicker value={place} onChange={setPlace} error={err.city ?? err.lat} />

      <Field label="Last whole-blood donation" hint="Leave empty if you have never donated" error={err.lastDonationAt}>
        <Input type="date" value={last} max={todayIso()} onChange={(e) => setLast(e.target.value)} className="sm:max-w-xs" />
      </Field>

      <fieldset>
        <legend className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-800">Tick anything that applies to you right now</legend>
        <div className="space-y-3 rounded-2xl border border-ink-200 bg-ink-50 p-5">
          {HEALTH_QUESTIONS.map(([key, text]) => (
            <Checkbox key={key} checked={health[key]} onChange={(v) => setHealth((h) => ({ ...h, [key]: v }))}>
              {text}
            </Checkbox>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-500">This is a self-check to help us reach the right donors. A doctor at the hospital always does the final screening.</p>
      </fieldset>

      <Button type="submit" size="lg" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
