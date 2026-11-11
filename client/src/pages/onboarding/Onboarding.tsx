import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Droplets, UsersRound, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { SplitModal } from '../../components/ui/SplitModal';
import { DonorForm } from '../../components/forms/DonorForm';
import { LocationPicker, type GeoValue } from '../../components/forms/LocationPicker';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { ErrorNote, PageLoader } from '../../components/ui/Misc';
import { useMe } from '../../hooks/useMe';
import { ApiError, api } from '../../lib/api';
import type { Role } from '../../lib/types';

type Choice = Exclude<Role, 'ADMIN'>;

const CHOICES: { role: Choice; icon: LucideIcon; title: string; body: string }[] = [
  { role: 'DONOR', icon: Droplets, title: 'I want to donate blood', body: 'Get reached when your blood group is needed near you.' },
  { role: 'REQUESTER', icon: UsersRound, title: 'I need blood for a patient', body: 'Find verified hospitals and blood banks around you.' },
  { role: 'HOSPITAL', icon: Building2, title: 'I represent a hospital or blood bank', body: 'Claim your facility and get it verified.' },
];

function useOnboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post('/users/onboard', body),
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(vars.role === 'HOSPITAL' ? '/app/my-hospital' : '/app/dashboard', { replace: true });
    },
  });
}

const fieldsOf = (e: unknown) => (e instanceof ApiError ? (e.fields ?? {}) : {});
const messageOf = (e: unknown) => (e instanceof Error ? e.message : '');

function PhoneAndName({ name, setName, phone, setPhone, errors }: { name: string; setName: (v: string) => void; phone: string; setPhone: (v: string) => void; errors: Record<string, string> }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <Field label="Mobile number" error={errors.phone} hint="Hospitals use this to reach you. It is never shown publicly.">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" />
      </Field>
    </div>
  );
}

function DonorOnboarding({ defaultName }: { defaultName: string }) {
  const onboard = useOnboard();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const fieldErrors = fieldsOf(onboard.error);
  return (
    <>
      {onboard.isError && !Object.keys(fieldErrors).length && <ErrorNote>{messageOf(onboard.error)}</ErrorNote>}
      <DonorForm
        submitLabel="Join the donor network"
        pending={onboard.isPending}
        errors={fieldErrors}
        onSubmit={(p) => onboard.mutate({ role: 'DONOR', name, phone, ...p })}
      >
        <PhoneAndName name={name} setName={setName} phone={phone} setPhone={setPhone} errors={fieldErrors} />
      </DonorForm>
    </>
  );
}

function RequesterOnboarding({ defaultName }: { defaultName: string }) {
  const onboard = useOnboard();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState<GeoValue | null>(null);
  const [missing, setMissing] = useState(false);
  const errors = fieldsOf(onboard.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!place) return setMissing(true);
    onboard.mutate({ role: 'REQUESTER', name, phone, city: place.city, lat: place.lat, lng: place.lng });
  };

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      {onboard.isError && !Object.keys(errors).length && <ErrorNote>{messageOf(onboard.error)}</ErrorNote>}
      <PhoneAndName name={name} setName={setName} phone={phone} setPhone={setPhone} errors={errors} />
      <LocationPicker label="Where is the patient?" value={place} onChange={(v) => { setPlace(v); setMissing(false); }} error={missing ? 'Search and pick a city' : (errors.city ?? errors.lat)} />
      <Button type="submit" size="lg" loading={onboard.isPending}>Continue</Button>
    </form>
  );
}

function HospitalOnboarding({ defaultName }: { defaultName: string }) {
  const onboard = useOnboard();
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const errors = fieldsOf(onboard.error);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onboard.mutate({ role: 'HOSPITAL', name, phone });
      }}
      className="space-y-7"
      noValidate
    >
      {onboard.isError && !Object.keys(errors).length && <ErrorNote>{messageOf(onboard.error)}</ErrorNote>}
      <PhoneAndName name={name} setName={setName} phone={phone} setPhone={setPhone} errors={errors} />
      <p className="text-sm text-ink-500">Next you will find your hospital in the directory and submit its license for verification.</p>
      <Button type="submit" size="lg" loading={onboard.isPending}>Continue</Button>
    </form>
  );
}

export default function Onboarding() {
  const { data: me, isLoading } = useMe();
  const navigate = useNavigate();
  const [choice, setChoice] = useState<Choice | null>(null);

  if (isLoading || !me) return <PageLoader />;
  if (me.user.onboarded) return <Navigate to={me.user.role === 'HOSPITAL' ? '/app/my-hospital' : '/app/dashboard'} replace />;
  const active = CHOICES.find((c) => c.role === choice);

  return (
    <SplitModal
      wide
      label="Set up your account"
      onClose={() => navigate('/')}
      aside={{
        heading: active ? active.title : 'Welcome to BloodBridge',
        text: active ? active.body : 'Tell us how you will use the network. This sets up the dashboard that fits your role.',
        points: ['Takes about two minutes', 'You can update everything later', 'Your phone is never shown publicly'],
      }}
    >
      {!active ? (
        <>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">How will you use BloodBridge?</h1>
          <p className="mt-1.5 text-ink-600">Pick the option that fits you best.</p>
          <div className="mt-6 grid gap-3">
            {CHOICES.map(({ role, icon: Icon, title, body }) => (
              <button key={role} onClick={() => setChoice(role)} className="flex cursor-pointer items-center gap-4 rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50 sm:p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="size-6" /></span>
                <span>
                  <span className="block font-bold text-ink-900">{title}</span>
                  <span className="mt-0.5 block text-sm text-ink-600">{body}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button onClick={() => setChoice(null)} className="mb-3 cursor-pointer text-sm font-semibold text-brand-700 hover:text-brand-800">Back</button>
          <h1 className="mb-6 text-2xl font-extrabold tracking-tight text-ink-900">{active.title}</h1>
          {active.role === 'DONOR' && <DonorOnboarding defaultName={me.user.name} />}
          {active.role === 'REQUESTER' && <RequesterOnboarding defaultName={me.user.name} />}
          {active.role === 'HOSPITAL' && <HospitalOnboarding defaultName={me.user.name} />}
        </>
      )}
    </SplitModal>
  );
}
