import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Search, ShieldAlert, XCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { FileField } from '../../components/forms/FileField';
import { LocationPicker, type GeoValue } from '../../components/forms/LocationPicker';
import { Button } from '../../components/ui/Button';
import { Checkbox, Field, Input, Select } from '../../components/ui/Form';
import { SplitModal } from '../../components/ui/SplitModal';
import { Badge, Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useMeContext } from '../../App';
import { ApiError, api, qs } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { HospitalSearch, OwnHospital, PublicHospital } from '../../lib/types';

const fieldsOf = (e: unknown) => (e instanceof ApiError ? (e.fields ?? {}) : {});
const messageOf = (e: unknown) => (e instanceof Error ? e.message : '');

function useRefreshHospital() {
  const qc = useQueryClient();
  return () => Promise.all(['me', 'my-hospital', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

/* ───────────── Claim an existing listing ───────────── */

function ClaimModal({ target, onClose }: { target: PublicHospital | null; onClose: () => void }) {
  const me = useMeContext();
  const refresh = useRefreshHospital();
  const [license, setLicense] = useState('');
  const [person, setPerson] = useState(me.user.name);
  const [designation, setDesignation] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();

  const claim = useMutation({
    mutationFn: (fd: FormData) => api.post('/hospitals/claim', fd),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
  });
  const errors = fieldsOf(claim.error);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (!file) return setFileError('Attach a PDF, JPG or PNG of the license');
    setFileError(undefined);
    const fd = new FormData();
    fd.set('hospitalId', target.id);
    fd.set('licenseNumber', license);
    fd.set('contactPerson', person);
    fd.set('contactDesignation', designation);
    fd.set('file', file);
    claim.mutate(fd);
  };

  return (
    <>
      {target && (
        <SplitModal label="Claim this hospital" onClose={onClose} aside={{ heading: 'Claim your facility', text: 'Submit your licence so our team can verify it. Once approved, you appear as verified and can receive blood requests.', points: ['Licence is seen only by our review team', 'PDF, JPG or PNG up to 5 MB', 'You can resubmit if changes are needed'] }}>
        <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Claim this hospital</h2>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="rounded-2xl bg-ink-50 p-4">
            <p className="font-bold text-ink-900">{target.name}</p>
            <p className="text-sm text-ink-500">{[target.addressLine, target.city].filter(Boolean).join(', ')}</p>
          </div>
          {claim.isError && !Object.keys(errors).length && <ErrorNote>{messageOf(claim.error)}</ErrorNote>}
          <Field label="License or registration number" error={errors.licenseNumber}>
            <Input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="As printed on the document" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Authorised person" error={errors.contactPerson}>
              <Input value={person} onChange={(e) => setPerson(e.target.value)} />
            </Field>
            <Field label="Designation" error={errors.contactDesignation}>
              <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Medical superintendent" />
            </Field>
          </div>
          <FileField label="License document" file={file} onChange={setFile} error={fileError ?? errors.file} />
          <Button type="submit" size="lg" className="w-full" loading={claim.isPending}>Submit for verification</Button>
        </form>
        </SplitModal>
      )}
    </>
  );
}

/* ───────────── Register a facility missing from the directory ───────────── */

function RegisterForm() {
  const me = useMeContext();
  const refresh = useRefreshHospital();
  const [v, setV] = useState({ name: '', type: 'HOSPITAL', addressLine: '', state: '', postcode: '', phone: me.user.phone ?? '', email: '', website: '', ownership: 'private', licenseNumber: '', contactPerson: me.user.name, contactDesignation: '' });
  const [emergency, setEmergency] = useState(false);
  const [place, setPlace] = useState<GeoValue | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [local, setLocal] = useState<Record<string, string>>({});
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const register = useMutation({ mutationFn: (fd: FormData) => api.post('/hospitals/register', fd), onSuccess: refresh });
  const errors = { ...local, ...fieldsOf(register.error) };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!place) next.city = 'Search and pick the city';
    if (!file) next.file = 'Attach a PDF, JPG or PNG of the license';
    setLocal(next);
    if (!place || !file) return;
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => val && fd.set(k, val));
    fd.set('city', place.city);
    fd.set('lat', String(place.lat));
    fd.set('lng', String(place.lng));
    fd.set('hasEmergency', String(emergency));
    fd.set('file', file);
    register.mutate(fd);
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-6" noValidate>
        {register.isError && !Object.keys(fieldsOf(register.error)).length && <ErrorNote>{messageOf(register.error)}</ErrorNote>}
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field label="Facility name" error={errors.name}><Input value={v.name} onChange={set('name')} /></Field>
          <Field label="Type" error={errors.type}>
            <Select value={v.type} onChange={set('type')}>
              <option value="HOSPITAL">Hospital</option>
              <option value="BLOOD_BANK">Blood bank</option>
            </Select>
          </Field>
        </div>
        <Field label="Street address" error={errors.addressLine}><Input value={v.addressLine} onChange={set('addressLine')} /></Field>
        <LocationPicker label="City" value={place} onChange={setPlace} error={errors.city ?? errors.lat} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="State" error={errors.state}><Input value={v.state} onChange={set('state')} /></Field>
          <Field label="PIN code" error={errors.postcode}><Input value={v.postcode} onChange={set('postcode')} inputMode="numeric" /></Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Facility phone" error={errors.phone}><Input value={v.phone} onChange={set('phone')} inputMode="tel" /></Field>
          <Field label="Ownership" error={errors.ownership}>
            <Select value={v.ownership} onChange={set('ownership')}>
              <option value="private">Private</option>
              <option value="government">Government</option>
              <option value="charity">Charitable or trust</option>
            </Select>
          </Field>
          <Field label="Email (optional)" error={errors.email}><Input type="email" value={v.email} onChange={set('email')} /></Field>
          <Field label="Website (optional)" error={errors.website}><Input value={v.website} onChange={set('website')} placeholder="https://" /></Field>
        </div>
        <Checkbox checked={emergency} onChange={setEmergency}>This facility has 24x7 emergency care</Checkbox>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="License number" error={errors.licenseNumber}><Input value={v.licenseNumber} onChange={set('licenseNumber')} /></Field>
          <Field label="Authorised person" error={errors.contactPerson}><Input value={v.contactPerson} onChange={set('contactPerson')} /></Field>
          <Field label="Designation" error={errors.contactDesignation}><Input value={v.contactDesignation} onChange={set('contactDesignation')} /></Field>
        </div>
        <FileField label="License document" file={file} onChange={setFile} error={errors.file} />
        <Button type="submit" size="lg" loading={register.isPending}>Submit for verification</Button>
      </form>
    </>
  );
}

/* ───────────── First step: link a facility ───────────── */

function LinkHospital() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'find' | 'register'>('find');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [place, setPlace] = useState<GeoValue | null>(null);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<PublicHospital | null>(null);
  const claimId = params.get('claim');

  const preset = useQuery({ queryKey: ['hospital', claimId], queryFn: () => api.get<{ hospital: PublicHospital }>(`/hospitals/${claimId}`), enabled: !!claimId });
  useEffect(() => {
    if (preset.data) setTarget(preset.data.hospital);
  }, [preset.data]);

  const search = useQuery({
    queryKey: ['claim-search', place?.lat, place?.lng, text],
    queryFn: () => api.get<HospitalSearch>(`/hospitals${qs({ lat: place!.lat, lng: place!.lng, radiusKm: 15, q: text.trim() || undefined })}`),
    enabled: !!place,
    staleTime: 2 * 60_000,
  });
  const claimable = (search.data?.items ?? []).filter((h) => !h.verified);

  const closeClaim = () => {
    setTarget(null);
    if (claimId) {
      const next = new URLSearchParams(params);
      next.delete('claim');
      setParams(next, { replace: true });
    }
  };

  return (
    <>
      <PageHeader title="My Hospital" subtitle="Link your facility and submit its license. Our team reviews every submission before it shows as verified." />
      <div className="mb-6 inline-flex rounded-xl bg-ink-100 p-1">
        {([['find', 'Find my hospital'], ['register', 'It is not listed']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={clsx('cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition', tab === t ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'register' ? (
        <Card className="text-center">
          <p className="mx-auto max-w-lg text-ink-600">Not in the directory? Register your facility with its address and licence. It stays hidden from the public until our team verifies it.</p>
          <Button size="lg" className="mt-6" onClick={() => setRegisterOpen(true)}>Register my facility</Button>
          {registerOpen && (
            <SplitModal wide label="Register your facility" onClose={() => setRegisterOpen(false)} aside={{ heading: 'Register your facility', text: 'Add your hospital or blood bank with its licence. Our team reviews every submission before it goes live.', points: ['Hidden publicly until verified', 'Duplicates within 150 m are blocked', 'Licence is seen only by reviewers'] }}>
              <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Register your facility</h2>
              <RegisterForm />
            </SplitModal>
          )}
        </Card>
      ) : (
        <Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <LocationPicker label="City" value={place} onChange={setPlace} />
            <Field label="Facility name (optional)">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type part of the name" icon={<Search className="size-4" />} />
            </Field>
          </div>
          <div className="mt-6">
            {!place && <EmptyState title="Start with your city" body="We search real hospitals and blood banks around it." />}
            {place && search.isFetching && <PageLoader />}
            {search.isError && <ErrorNote>{messageOf(search.error)}</ErrorNote>}
            {place && !search.isFetching && claimable.length === 0 && !search.isError && (
              <EmptyState title="No unclaimed facilities found" body="If yours is missing, switch to “It is not listed” and add it." action={<Button variant="outline" onClick={() => setTab('register')}>Add my facility</Button>} />
            )}
            <ul className="divide-y divide-ink-100">
              {claimable.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-bold text-ink-900">{h.name}</p>
                    <p className="text-sm text-ink-500">{[h.addressLine, h.city].filter(Boolean).join(', ') || 'Address not listed'}{h.distanceKm !== undefined && ` · ${h.distanceKm} km`}</p>
                  </div>
                  <Button size="sm" onClick={() => setTarget(h)}>Claim</Button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      <ClaimModal target={target} onClose={closeClaim} />
    </>
  );
}

/* ───────────── After linking: status, resubmit, details ───────────── */

function Timeline({ h }: { h: OwnHospital }) {
  const decided = h.status !== 'PENDING';
  const items = [
    { label: 'Submitted', text: h.submittedAt ? formatDate(h.submittedAt) : 'Done', done: true },
    { label: 'Review by our team', text: decided ? `Completed ${formatDate(h.reviewedAt)}` : 'Usually within two working days', done: decided, active: !decided },
    { label: h.status === 'REJECTED' ? 'Needs changes' : h.status === 'SUSPENDED' ? 'Suspended' : 'Verified', text: h.reviewNote ?? (h.status === 'VERIFIED' ? `Approved ${formatDate(h.verifiedAt)}` : 'Waiting'), done: h.status === 'VERIFIED', bad: h.status === 'REJECTED' || h.status === 'SUSPENDED' },
  ];
  return (
    <ol className="space-y-5">
      {items.map((s) => (
        <li key={s.label} className="flex items-start gap-4">
          <span className={clsx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', s.done ? 'bg-emerald-600 text-white' : s.bad ? 'bg-brand-600 text-white' : s.active ? 'bg-plasma-400 text-ink-900' : 'bg-ink-100 text-ink-400')}>
            {s.done ? <CheckCircle2 className="size-5" /> : s.bad ? <XCircle className="size-5" /> : <Clock className="size-5" />}
          </span>
          <div>
            <p className="font-bold text-ink-900">{s.label}</p>
            <p className="text-sm text-ink-500">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ResubmitForm({ h }: { h: OwnHospital }) {
  const refresh = useRefreshHospital();
  const [license, setLicense] = useState(h.licenseNumber ?? '');
  const [file, setFile] = useState<File | null>(null);
  const resubmit = useMutation({ mutationFn: (fd: FormData) => api.post('/hospitals/mine/resubmit', fd), onSuccess: refresh });
  const errors = fieldsOf(resubmit.error);
  return (
    <Card>
      <CardTitle>Fix and resubmit</CardTitle>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData();
          fd.set('licenseNumber', license);
          if (file) fd.set('file', file);
          resubmit.mutate(fd);
        }}
      >
        {resubmit.isError && !Object.keys(errors).length && <ErrorNote>{messageOf(resubmit.error)}</ErrorNote>}
        <Field label="License number" error={errors.licenseNumber}><Input value={license} onChange={(e) => setLicense(e.target.value)} /></Field>
        <FileField label="New license document (optional)" file={file} onChange={setFile} error={errors.file} hint="Upload a clearer copy if that was the problem. PDF, JPG or PNG, up to 5 MB" />
        <Button type="submit" loading={resubmit.isPending}>Resubmit for review</Button>
      </form>
    </Card>
  );
}

function DetailsForm({ h }: { h: OwnHospital }) {
  const refresh = useRefreshHospital();
  const [v, setV] = useState({ phone: h.phone ?? '', email: h.email ?? '', website: h.website ?? '', addressLine: h.addressLine ?? '', contactPerson: h.contactPerson ?? '' });
  const [emergency, setEmergency] = useState(h.hasEmergency);
  const save = useMutation({ mutationFn: (b: Record<string, unknown>) => api.patch('/hospitals/mine', b), onSuccess: refresh });
  const errors = fieldsOf(save.error);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card>
      <CardTitle>Facility details</CardTitle>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ phone: v.phone || undefined, email: v.email || null, website: v.website || null, addressLine: v.addressLine || undefined, contactPerson: v.contactPerson || undefined, hasEmergency: emergency });
        }}
      >
        {save.isError && !Object.keys(errors).length && <ErrorNote>{messageOf(save.error)}</ErrorNote>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Facility phone" error={errors.phone}><Input value={v.phone} onChange={set('phone')} inputMode="tel" /></Field>
          <Field label="Authorised person" error={errors.contactPerson}><Input value={v.contactPerson} onChange={set('contactPerson')} /></Field>
          <Field label="Email" error={errors.email}><Input type="email" value={v.email} onChange={set('email')} /></Field>
          <Field label="Website" error={errors.website}><Input value={v.website} onChange={set('website')} placeholder="https://" /></Field>
        </div>
        <Field label="Street address" error={errors.addressLine}><Input value={v.addressLine} onChange={set('addressLine')} /></Field>
        <Checkbox checked={emergency} onChange={setEmergency}>This facility has 24x7 emergency care</Checkbox>
        <div className="flex items-center gap-4">
          <Button type="submit" loading={save.isPending}>Save changes</Button>
          {save.isSuccess && <span className="text-sm font-semibold text-emerald-600">Saved</span>}
        </div>
      </form>
    </Card>
  );
}

function OwnHospitalView() {
  const q = useQuery({ queryKey: ['my-hospital'], queryFn: () => api.get<{ hospital: OwnHospital }>('/hospitals/mine') });
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorNote>{messageOf(q.error) || 'Could not load your hospital.'}</ErrorNote>;
  const h = q.data.hospital;

  return (
    <>
      <PageHeader title="My Hospital" subtitle={h.name} right={<StatusBadge status={h.status} />} />
      {h.status === 'VERIFIED' && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
          <CheckCircle2 className="size-5 shrink-0" /> <p className="font-semibold">Verified. Donors and families see your facility first in searches.</p>
        </div>
      )}
      {h.status === 'SUSPENDED' && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-brand-800">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div><p className="font-bold">This facility is suspended.</p>{h.reviewNote && <p className="mt-1 text-sm">{h.reviewNote}</p>}</div>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-6">
          <Card>
            <CardTitle>Verification</CardTitle>
            <Timeline h={h} />
          </Card>
          <Card>
            <CardTitle>Submitted details</CardTitle>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-ink-500">License number</dt><dd className="font-bold text-ink-900">{h.licenseNumber ?? '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Document</dt><dd>{h.hasLicenseDocument ? <Badge tone="good">Uploaded</Badge> : <Badge tone="warn">Missing</Badge>}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Authorised person</dt><dd className="text-right font-bold text-ink-900">{h.contactPerson ?? '—'}{h.contactDesignation && <span className="block font-normal text-ink-500">{h.contactDesignation}</span>}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-ink-500">Source</dt><dd className="font-bold text-ink-900">{h.source === 'OSM' ? 'OpenStreetMap listing' : 'Registered here'}</dd></div>
            </dl>
          </Card>
        </div>
        <div className="space-y-6">
          {h.status === 'REJECTED' && (
            <>
              <ErrorNote><p className="font-bold">Your submission needs changes</p><p className="mt-1">{h.reviewNote}</p></ErrorNote>
              <ResubmitForm h={h} />
            </>
          )}
          {h.status !== 'SUSPENDED' && <DetailsForm key={h.id + (h.reviewedAt ?? '')} h={h} />}
        </div>
      </div>
    </>
  );
}

export default function MyHospital() {
  const me = useMeContext();
  return me.hospital ? <OwnHospitalView /> : <LinkHospital />;
}
