import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Check, Droplets, Send, Sparkles } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { useMeContext } from '../../App';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Form';
import { EmptyState, ErrorNote, Spinner } from '../../components/ui/Misc';
import { SplitModal } from '../../components/ui/SplitModal';
import { ApiError, api, qs } from '../../lib/api';
import { BLOOD_GROUPS, bloodLabel } from '../../lib/blood';
import type { BloodGroup, HospitalSearch, Urgency } from '../../lib/types';
import type { StockRow, TriageSuggestion } from '../../lib/types3';
import { StockBadge } from '../../components/ui/Stock';

const URGENCY: { key: Urgency; title: string; text: string; hours: number }[] = [
  { key: 'CRITICAL', title: 'Critical', text: 'Needed within hours. Alerts donors within 30 km.', hours: 3 },
  { key: 'URGENT', title: 'Urgent', text: 'Needed today or tomorrow. Alerts donors within 20 km.', hours: 12 },
  { key: 'PLANNED', title: 'Planned', text: 'Surgery or treatment ahead. Alerts donors within 10 km.', hours: 72 },
];

const Block = ({ children }: { children: ReactNode }) => <section className="rounded-2xl border border-ink-100 p-5 sm:p-6">{children}</section>;
const BlockTitle = ({ children }: { children: ReactNode }) => <h3 className="mb-4 text-base font-extrabold text-ink-900">{children}</h3>;

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function NewRequest() {
  const me = useMeContext();
  const navigate = useNavigate();
  const isHospital = me.user.role === 'HOSPITAL';
  const { lat, lng, city } = me.user;

  const [params] = useSearchParams();
  const preselect = params.get('hospital') ?? '';
  const groupParam = params.get('group') as BloodGroup | null;
  // A hospital either calls donors for a walk-in patient, or to refill its own blood bank.
  const [purpose, setPurpose] = useState<'PATIENT' | 'RESTOCK'>(params.get('purpose') === 'restock' ? 'RESTOCK' : 'PATIENT');
  const restock = isHospital && purpose === 'RESTOCK';
  const [hospitalId, setHospitalId] = useState(preselect);
  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>(groupParam && BLOOD_GROUPS.includes(groupParam) ? groupParam : '');
  const [units, setUnits] = useState('1');
  const [urgency, setUrgency] = useState<Urgency>('URGENT');
  const [neededBy, setNeededBy] = useState(() => localInput(new Date(Date.now() + 12 * 3600_000)));
  const [phone, setPhone] = useState(me.user.phone ?? '');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [story, setStory] = useState('');
  const [suggestion, setSuggestion] = useState<TriageSuggestion | null>(null);

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<{ available: boolean }>('/ai/status'), staleTime: 10 * 60_000, retry: false });
  const triage = useMutation({
    mutationFn: () => api.post<{ suggestion: TriageSuggestion }>('/ai/triage', { description: story }),
    onSuccess: (r) => {
      const t = r.suggestion;
      setSuggestion(t);
      setUrgency(t.urgency);
      const hours = URGENCY.find((u) => u.key === t.urgency)!.hours;
      setNeededBy(localInput(new Date(Date.now() + hours * 3600_000)));
      if (t.bloodGroup) setBloodGroup(t.bloodGroup);
      if (t.unitsNeeded) setUnits(String(t.unitsNeeded));
    },
  });

  const hospitals = useQuery({
    queryKey: ['hospitals', 'verified-near', lat, lng],
    queryFn: () => api.get<HospitalSearch>(`/hospitals${qs({ lat, lng, radiusKm: 50, verifiedOnly: true })}`),
    enabled: !isHospital && lat !== null && lng !== null,
    staleTime: 2 * 60_000,
  });

  // A hospital chosen from the directory may be farther than the nearby list covers; fetch it so it can still be picked.
  const picked = useQuery({
    queryKey: ['hospital', preselect],
    queryFn: () => api.get<{ hospital: HospitalSearch['items'][number] }>(`/hospitals/${preselect}`),
    enabled: !isHospital && !!preselect,
    retry: false,
  });
  const hospitalOptions = (() => {
    const list = hospitals.data?.items ?? [];
    const p = picked.data?.hospital;
    return p && p.verified && !list.some((x) => x.id === p.id) ? [p, ...list] : list;
  })();

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<{ id: string; alerted: number; radiusKm: number }>('/requests', payload),
    onSuccess: (r) => navigate(`/app/requests/${r.id}`, { state: { alerted: r.alerted, radiusKm: r.radiusKm } }),
    onError: (e) => {
      if (e instanceof ApiError) {
        setErrors(e.fields ?? {});
        setFormError(e.fields ? 'Please fix the highlighted fields.' : e.message);
      } else setFormError('Something went wrong. Please try again.');
    },
  });

  const stockHospital = isHospital ? me.hospital?.id : hospitalId;
  const stock = useQuery({
    queryKey: ['stock-status', stockHospital],
    queryFn: () => api.get<{ stock: Pick<StockRow, 'bloodGroup' | 'status'>[] }>(`/inventory/status/${stockHospital}`),
    enabled: !!stockHospital && !isHospital,
    staleTime: 60_000,
  });
  const chosenStock = bloodGroup ? stock.data?.stock.find((x) => x.bloodGroup === bloodGroup)?.status : undefined;

  const minTime = useMemo(() => localInput(new Date()), []);

  if (isHospital && me.hospital?.status !== 'VERIFIED') return <Navigate to="/app/requests" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!isHospital && !hospitalId) next.hospitalId = 'Choose the hospital where blood is needed';
    if (!restock && patientName.trim().length < 2) next.patientName = 'Enter the patient name';
    if (!bloodGroup) next.bloodGroup = 'Choose the blood group';
    if (!neededBy) next.neededBy = 'Enter when it is needed';
    if (!isHospital && !phone.trim()) next.contactPhone = 'Add a number the hospital can call';
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;
    create.mutate({
      hospitalId: isHospital ? me.hospital!.id : hospitalId,
      patientName: restock ? 'Blood bank restock' : patientName.trim(),
      bloodGroup,
      unitsNeeded: Number(units),
      urgency,
      neededBy: new Date(neededBy).toISOString(),
      contactPhone: phone.trim() || undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <SplitModal
      wide
      label={isHospital ? 'Call donors' : 'Request blood'}
      onClose={() => navigate('/app/requests')}
      aside={isHospital
        ? { heading: 'Call donors', text: 'Alert compatible, eligible donors near your hospital. They accept, walk in, and you verify them at the desk with their code.', points: ['Donor shows a 6 digit code at your desk', 'You confirm it and the certificate is issued', 'Stock is updated from Inventory after collection'] }
        : { heading: 'Request blood', text: 'We alert compatible, eligible donors near the hospital the moment you submit.', points: ['Only verified hospitals receive requests', 'Donors only see the patient’s first name', 'Widen the search any time'] }}
    >
    <form onSubmit={submit} noValidate>
      <h1 className="mb-5 text-2xl font-extrabold tracking-tight text-ink-900">{isHospital ? 'Call donors' : 'Request blood'}</h1>
      <div className="space-y-5">
        {!isHospital && (
          <Block>
            <BlockTitle>Where is the patient?</BlockTitle>
            {(lat === null || lng === null) && hospitalOptions.length === 0 ? (
              <EmptyState icon={<Building2 className="size-6" />} title="Add your location first" body="We show verified hospitals around your saved location." action={<Link to="/app/profile"><Button>Open profile</Button></Link>} />
            ) : hospitals.isLoading && hospitalOptions.length === 0 ? (
              <div className="py-6 text-center"><Spinner /></div>
            ) : hospitals.isError ? (
              <ErrorNote>Could not load hospitals. Please try again.</ErrorNote>
            ) : hospitalOptions.length === 0 ? (
              <EmptyState icon={<Building2 className="size-6" />} title={`No verified hospital within 50 km of ${city ?? 'you'} yet`} body="Blood requests go only to verified hospitals so donors arrive somewhere that can receive them. Ask the hospital to join BloodBridge." action={<Link to="/app/hospitals"><Button variant="outline">Browse hospitals</Button></Link>} />
            ) : (
              <fieldset className="min-w-0">
                <legend className="sr-only">Hospital</legend>
                <div className="space-y-2">
                  {hospitalOptions.map((h) => (
                    <label key={h.id} className={clsx('flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition', hospitalId === h.id ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}>
                      <input type="radio" name="hospital" value={h.id} checked={hospitalId === h.id} onChange={() => setHospitalId(h.id)} className="sr-only" />
                      <span className={clsx('flex size-6 shrink-0 items-center justify-center rounded-full border-2', hospitalId === h.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300')}>
                        {hospitalId === h.id && <Check className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-ink-900">{h.name}</span>
                        <span className="block truncate text-sm text-ink-500">{[h.addressLine, h.city].filter(Boolean).join(', ') || 'Address on file'}</span>
                      </span>
                      {h.distanceKm !== undefined && <span className="shrink-0 text-sm font-semibold text-ink-600">{h.distanceKm} km</span>}
                    </label>
                  ))}
                </div>
                {errors.hospitalId && <p className="mt-2 text-xs font-medium text-brand-700">{errors.hospitalId}</p>}
              </fieldset>
            )}
          </Block>
        )}

        {isHospital && (
          <Block>
            <BlockTitle>What is this call for?</BlockTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {([['PATIENT', 'A patient at the hospital', 'Someone walked in or is admitted and needs blood.'], ['RESTOCK', 'Restock our blood bank', 'Stock is low. Invite donors to come and donate.']] as const).map(([k, title, text]) => (
                <button type="button" key={k} aria-pressed={purpose === k} onClick={() => setPurpose(k)}
                  className={clsx('cursor-pointer rounded-2xl border p-4 text-left transition', purpose === k ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}>
                  <span className="block font-bold text-ink-900">{title}</span>
                  <span className="mt-1 block text-xs text-ink-600">{text}</span>
                </button>
              ))}
            </div>
          </Block>
        )}

        {aiStatus.data?.available && !restock && (
          <Block>
            <BlockTitle><span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-plasma-600" /> Describe the situation (optional)</span></BlockTitle>
            <Textarea rows={3} maxLength={800} value={story} onChange={(e) => setStory(e.target.value)} placeholder="For example: my father is having heart surgery tomorrow morning and needs 2 units of B positive." />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" size="sm" icon={<Sparkles className="size-4" />} loading={triage.isPending} disabled={story.trim().length < 10} onClick={() => triage.mutate()}>Suggest urgency and details</Button>
              <span className="text-xs text-ink-500">AI suggestion only. You confirm every field below.</span>
            </div>
            {triage.isError && <div className="mt-3"><ErrorNote>{triage.error instanceof Error ? triage.error.message : 'Could not get a suggestion.'}</ErrorNote></div>}
            {suggestion && (
              <div className="mt-4 space-y-2 rounded-2xl bg-plasma-100 p-4 text-sm text-ink-800">
                {suggestion.callEmergency && <p className="font-bold text-brand-700">If the patient is in danger right now, call 112 or go to the nearest hospital first.</p>}
                {suggestion.summary && <p>{suggestion.summary}</p>}
                {suggestion.advice && <p className="text-ink-600">{suggestion.advice}</p>}
              </div>
            )}
          </Block>
        )}

        <Block>
          <BlockTitle>{restock ? 'Blood needed' : 'Patient and blood'}</BlockTitle>
          <div className="grid gap-5 sm:grid-cols-2">
            {!restock && (
            <Field label="Patient name" error={errors.patientName} hint="Donors only see the first name.">
              <Input className="h-12" value={patientName} onChange={(e) => setPatientName(e.target.value)} maxLength={80} placeholder="Full name" />
            </Field>
            )}
            <Field label="Units needed" error={errors.unitsNeeded}>
              <Select className="h-12" value={units} onChange={(e) => setUnits(e.target.value)}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'unit' : 'units'}</option>)}
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.08em] text-ink-800">Blood group needed</span>
            <div className="grid grid-cols-4 gap-2">
              {BLOOD_GROUPS.map((g) => (
                <button type="button" key={g} onClick={() => setBloodGroup(g)} aria-pressed={bloodGroup === g}
                  className={clsx('flex h-12 cursor-pointer items-center justify-center rounded-xl border text-base font-extrabold transition', bloodGroup === g ? 'border-brand-600 bg-brand-600 text-white shadow-glow' : 'border-ink-200 bg-white text-ink-800 hover:bg-ink-50')}>
                  {bloodLabel(g)}
                </button>
              ))}
            </div>
            {errors.bloodGroup && <p className="mt-1.5 text-xs font-medium text-brand-700">{errors.bloodGroup}</p>}
            {chosenStock && <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">This hospital’s stock of {bloodLabel(bloodGroup as BloodGroup)}: <StockBadge status={chosenStock} /></p>}
          </div>
        </Block>

        <Block>
          <BlockTitle>How urgent is it?</BlockTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {URGENCY.map((u) => (
              <button type="button" key={u.key} aria-pressed={urgency === u.key}
                onClick={() => { setUrgency(u.key); setNeededBy(localInput(new Date(Date.now() + u.hours * 3600_000))); }}
                className={clsx('cursor-pointer rounded-2xl border p-4 text-left transition', urgency === u.key ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:bg-ink-50')}>
                <span className="block font-bold text-ink-900">{u.title}</span>
                <span className="mt-1 block text-xs text-ink-600">{u.text}</span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Needed by" error={errors.neededBy}>
              <Input className="h-12" type="datetime-local" min={minTime} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </Field>
            <Field label={isHospital ? 'Desk phone' : 'Contact phone'} error={errors.contactPhone} hint="Shared only with donors who accept.">
              <Input className="h-12" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" />
            </Field>
          </div>
          <Field label="Note for donors (optional)" className="mt-5" error={errors.note}>
            <Textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ward, floor, who to ask for at the desk…" className="py-3" />
          </Field>
        </Block>

        {formError && <ErrorNote>{formError}</ErrorNote>}
        <Button type="submit" size="lg" className="w-full" loading={create.isPending} icon={<Send className="size-5" />}>
          {isHospital ? 'Call donors now' : 'Alert donors now'}
        </Button>
        <p className="flex items-center justify-center gap-2 text-center text-xs text-ink-500"><Droplets className="size-4" /> Final screening is always done by the hospital before any donation.</p>
      </div>
    </form>
    </SplitModal>
  );
}
