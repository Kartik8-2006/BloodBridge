import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Check, Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DonorForm, type DonorPayload } from '../components/forms/DonorForm';
import { LocationPicker, type GeoValue } from '../components/forms/LocationPicker';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Form';
import { Badge, Card, CardTitle, ErrorNote, PageHeader } from '../components/ui/Misc';
import { SplitModal } from '../components/ui/SplitModal';
import { useMeContext } from '../App';
import { ApiError, api } from '../lib/api';
import { bloodLabel } from '../lib/blood';
import { ROLE_LABEL, formatDate } from '../lib/format';

const fieldsOf = (e: unknown) => (e instanceof ApiError ? (e.fields ?? {}) : {});

export default function Profile() {
  const me = useMeContext();
  const qc = useQueryClient();
  const { user, donor, eligibility } = me;
  const refresh = () => Promise.all(['me', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [place, setPlace] = useState<GeoValue | null>(user.lat !== null && user.lng !== null && user.city ? { city: user.city, lat: user.lat, lng: user.lng } : null);

  const [editAccount, setEditAccount] = useState(false);
  const [editDonor, setEditDonor] = useState(false);
  const [saved, setSaved] = useState('');
  const saveAccount = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.patch('/users/me', b),
    onSuccess: async () => { await refresh(); setEditAccount(false); setSaved('Saved. Your profile has been updated.'); },
  });
  const saveDonor = useMutation({ mutationFn: (p: DonorPayload) => api.put('/donors/me', p), onSuccess: async () => { await refresh(); setEditDonor(false); setSaved('Saved. Your eligibility has been recalculated.'); } });
  const accountErrors = fieldsOf(saveAccount.error);

  const submitAccount = (e: FormEvent) => {
    e.preventDefault();
    saveAccount.mutate({ name, phone: phone || undefined, ...(user.role === 'REQUESTER' && place ? { city: place.city, lat: place.lat, lng: place.lng } : {}) });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My Profile" subtitle="Keep your details current so the right people can reach you." />

      <div className="mb-8 flex flex-wrap items-center gap-6 rounded-[1.75rem] bg-ink-800 p-7 text-white shadow-card">
        {user.imageUrl ? <img src={user.imageUrl} alt="" className="size-24 rounded-full border-4 border-ink-600 object-cover" /> : <span className="flex size-24 items-center justify-center rounded-full bg-brand-600 text-3xl font-extrabold">{user.name.charAt(0).toUpperCase()}</span>}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-extrabold">{user.name}</h2>
            {user.role && <Badge tone="brand" className="bg-brand-600 text-white"><BadgeCheck className="size-3.5" /> {ROLE_LABEL[user.role]}</Badge>}
          </div>
          <p className="mt-1 text-ink-300">{user.email} · Member since {formatDate(user.createdAt)}</p>
          {donor && eligibility && (
            <p className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span><span className="text-ink-300">Blood group </span><span className="font-extrabold">{bloodLabel(donor.bloodGroup)}</span></span>
              <span><span className="text-ink-300">Status </span><span className="font-extrabold">{eligibility.eligible ? 'Eligible to donate' : eligibility.nextEligibleOn ? `Eligible on ${formatDate(eligibility.nextEligibleOn)}` : 'Not eligible yet'}</span></span>
            </p>
          )}
        </div>
      </div>

      {saved && <p role="status" className="mb-6 rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800">{saved}</p>}

      <Card>
        <CardTitle action={<Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditAccount(true)}>Edit</Button>}>Account details</CardTitle>
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-500">Full name</dt><dd className="mt-0.5 font-bold text-ink-900">{user.name}</dd></div>
          <div><dt className="text-ink-500">Mobile number</dt><dd className="mt-0.5 font-bold text-ink-900">{user.phone ?? 'Not added'}</dd></div>
          <div><dt className="text-ink-500">Email</dt><dd className="mt-0.5 font-bold text-ink-900">{user.email}</dd></div>
          {user.role === 'REQUESTER' && <div><dt className="text-ink-500">Location</dt><dd className="mt-0.5 font-bold text-ink-900">{user.city ?? 'Not set'}</dd></div>}
        </dl>
      </Card>

      {editAccount && (
        <SplitModal label="Edit account details" onClose={() => setEditAccount(false)} aside={{ heading: 'Your details', text: 'Keep your name and number current so hospitals and families can reach you when it matters.' }}>
          <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Account details</h2>
          <form onSubmit={submitAccount} className="space-y-6" noValidate>
            {saveAccount.isError && !Object.keys(accountErrors).length && <ErrorNote>{saveAccount.error instanceof Error ? saveAccount.error.message : 'Could not save.'}</ErrorNote>}
            <Field label="Full name" error={accountErrors.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Mobile number" error={accountErrors.phone}><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+91 98765 43210" /></Field>
            <Field label="Email" hint="Change your email from Settings, under account security"><Input value={user.email} disabled /></Field>
            {user.role === 'REQUESTER' && <LocationPicker label="Your location" value={place} onChange={setPlace} error={accountErrors.city} />}
            <Button type="submit" size="lg" className="w-full" loading={saveAccount.isPending} icon={<Check className="size-4" />}>Save profile</Button>
          </form>
        </SplitModal>
      )}

      {donor && (
        <Card className="mt-8">
          <CardTitle action={<Button variant="outline" size="sm" icon={<Pencil className="size-4" />} onClick={() => setEditDonor(true)}>Edit</Button>}>Donor health profile</CardTitle>
          <dl className="grid gap-5 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-500">Blood group</dt><dd className="mt-0.5 font-bold text-ink-900">{bloodLabel(donor.bloodGroup)}</dd></div>
            <div><dt className="text-ink-500">Weight</dt><dd className="mt-0.5 font-bold text-ink-900">{donor.weightKg} kg</dd></div>
            <div><dt className="text-ink-500">City</dt><dd className="mt-0.5 font-bold text-ink-900">{donor.city}</dd></div>
            <div><dt className="text-ink-500">Date of birth</dt><dd className="mt-0.5 font-bold text-ink-900">{formatDate(donor.dateOfBirth)}</dd></div>
            <div><dt className="text-ink-500">Last donation</dt><dd className="mt-0.5 font-bold text-ink-900">{donor.lastDonationAt ? formatDate(donor.lastDonationAt) : 'Never'}</dd></div>
            <div><dt className="text-ink-500">Alerts</dt><dd className="mt-0.5 font-bold text-ink-900">{donor.available ? 'On' : 'Paused'}</dd></div>
          </dl>
          {eligibility && !eligibility.eligible && (
            <ul className="mt-6 list-disc space-y-1 rounded-2xl bg-plasma-100 p-5 pl-9 text-sm text-ink-800">
              {eligibility.reasons.map((r) => <li key={r}>{r}</li>)}
            </ul>
          )}
        </Card>
      )}

      {donor && editDonor && (
        <SplitModal wide label="Edit donor health profile" onClose={() => setEditDonor(false)} aside={{ heading: 'Donor health profile', text: 'Accurate answers keep donations safe. Eligibility is recalculated the moment you save.', points: ['Final screening is always done by the hospital', 'Your health answers are never shown publicly'] }}>
          <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Donor health profile</h2>
          {saveDonor.isError && !Object.keys(fieldsOf(saveDonor.error)).length && <div className="mb-5"><ErrorNote>{saveDonor.error instanceof Error ? saveDonor.error.message : 'Could not save.'}</ErrorNote></div>}
          <DonorForm initial={donor} submitLabel="Save health profile" pending={saveDonor.isPending} errors={fieldsOf(saveDonor.error)} onSubmit={(p) => saveDonor.mutate(p)} />
        </SplitModal>
      )}
    </div>
  );
}
