import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CalendarDays, Check, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMeContext } from '../../App';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { UpgradePrompt, isPlanError } from '../../components/ui/UpgradePrompt';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { SplitModal } from '../../components/ui/SplitModal';
import { ApiError, api } from '../../lib/api';
import { bloodLabel } from '../../lib/blood';
import type { Camp, CampAttendee } from '../../lib/types3';
import { campWhen } from '../camps/Camps';

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function CreateCamp({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: '', description: '', venue: '', startsAt: localInput(new Date(Date.now() + 3 * 86_400_000)), endsAt: localInput(new Date(Date.now() + 3 * 86_400_000 + 5 * 3_600_000)), capacity: '50' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [planBlocked, setPlanBlocked] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post<{ alerted: number }>('/camps', b),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['camps'] });
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setErr(e.fields ?? {});
        setFormError(e.fields ? '' : e.message);
        setPlanBlocked(isPlanError(e));
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr({});
    setFormError('');
    setPlanBlocked(false);
    create.mutate({
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      venue: f.venue.trim(),
      startsAt: new Date(f.startsAt).toISOString(),
      endsAt: new Date(f.endsAt).toISOString(),
      capacity: Number(f.capacity),
    });
  };

  return (
    <SplitModal wide label="Schedule a donation camp" onClose={onClose} aside={{ heading: 'Schedule a camp', text: 'Donors within 30 km are alerted the moment you publish. Units collected are added to your stock when you mark attendance.', points: ['Donors are checked for eligibility on the camp day', 'Attendance issues a certificate', 'You can cancel and everyone is told'] }}>
      <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Schedule a camp</h2>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {planBlocked ? <UpgradePrompt compact title="Free plan allows 2 active camps" body="Upgrade to Pro for unlimited camps." /> : formError && <ErrorNote>{formError}</ErrorNote>}
        <Field label="Title" error={err.title}><Input value={f.title} onChange={set('title')} maxLength={100} placeholder="Community blood donation camp" /></Field>
        <Field label="Venue" error={err.venue} hint="Defaults to your hospital's location and city."><Input value={f.venue} onChange={set('venue')} maxLength={160} placeholder="Hall, street, landmark" /></Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" error={err.startsAt}><Input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></Field>
          <Field label="Ends" error={err.endsAt}><Input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></Field>
        </div>
        <Field label="Donor capacity" error={err.capacity}><Input type="number" min={1} max={1000} value={f.capacity} onChange={set('capacity')} /></Field>
        <Field label="About the camp (optional)" error={err.description}><Textarea rows={3} maxLength={600} value={f.description} onChange={set('description')} placeholder="Who can attend, what to bring, refreshments…" /></Field>
        <Button type="submit" size="lg" className="w-full" loading={create.isPending}>Publish camp</Button>
      </form>
    </SplitModal>
  );
}

function Attendees({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['camps', 'attendees', camp.id], queryFn: () => api.get<{ registrations: CampAttendee[] }>(`/camps/${camp.id}/registrations`) });
  const started = new Date(camp.startsAt).getTime() <= Date.now();
  const mark = useMutation({
    mutationFn: (v: { id: string; status: 'ATTENDED' | 'NO_SHOW' }) => api.post(`/camps/${camp.id}/registrations/${v.id}/attendance`, { status: v.status }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['camps'] }), qc.invalidateQueries({ queryKey: ['inventory'] }), qc.invalidateQueries({ queryKey: ['inventory-log'] })]);
    },
  });
  return (
    <SplitModal label="Camp registrations" onClose={onClose} aside={{ heading: camp.title, text: started ? 'Mark who came. Attendance adds one unit to your stock and issues the donor a certificate.' : 'Attendance can be recorded once the camp starts.' }}>
      <h2 className="mb-1 text-2xl font-extrabold text-ink-900">Registrations</h2>
      <p className="mb-5 text-sm text-ink-500">{camp.title}</p>
      {mark.isError && <div className="mb-4"><ErrorNote>{mark.error instanceof Error ? mark.error.message : 'Could not save.'}</ErrorNote></div>}
      {list.isLoading && <PageLoader />}
      {list.data?.registrations.length === 0 && <p className="text-sm text-ink-500">Nobody has registered yet.</p>}
      <ul className="divide-y divide-ink-100">
        {list.data?.registrations.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-sm font-extrabold text-brand-700">{r.bloodGroup ? bloodLabel(r.bloodGroup) : '?'}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{r.donorName}</span>
            {r.status === 'REGISTERED' ? (
              <span className="flex gap-2">
                <Button size="sm" disabled={!started} loading={mark.isPending && mark.variables?.id === r.id && mark.variables.status === 'ATTENDED'} icon={<Check className="size-4" />} onClick={() => mark.mutate({ id: r.id, status: 'ATTENDED' })}>Donated</Button>
                <Button size="sm" variant="outline" disabled={!started} icon={<X className="size-4" />} onClick={() => mark.mutate({ id: r.id, status: 'NO_SHOW' })}>No-show</Button>
              </span>
            ) : r.status === 'ATTENDED' ? <Badge tone="good">Donated</Badge> : <Badge>No-show</Badge>}
          </li>
        ))}
      </ul>
    </SplitModal>
  );
}

export default function ManageCamps() {
  const me = useMeContext();
  const qc = useQueryClient();
  const verified = me.hospital?.status === 'VERIFIED';
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Camp | null>(null);
  const camps = useQuery({ queryKey: ['camps', 'managed'], queryFn: () => api.get<{ camps: Camp[] }>('/camps/managed'), enabled: verified });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/camps/${id}/cancel`), onSuccess: () => qc.invalidateQueries({ queryKey: ['camps'] }) });

  if (!verified) {
    return (
      <div>
        <PageHeader title="Donation camps" />
        <EmptyState icon={<CalendarDays className="size-6" />} title="Available after verification" body="Once your hospital is verified you can schedule camps and alert donors nearby." action={<Link to="/app/my-hospital"><Button>Check verification status</Button></Link>} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Donation camps" subtitle="Schedule camps, see who registered and record attendance." right={<Button icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>Schedule a camp</Button>} />
      {camps.isLoading && <PageLoader />}
      {camps.data?.camps.length === 0 && <EmptyState icon={<CalendarDays className="size-6" />} title="No camps yet" body="Schedule your first camp and donors within 30 km are alerted straight away." action={<Button onClick={() => setCreating(true)}>Schedule a camp</Button>} />}
      <div className="grid gap-5 lg:grid-cols-2">
        {camps.data?.camps.map((c) => (
          <Card key={c.id} className="p-6 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold text-ink-900">{c.title}</h3>
              <Badge tone={c.status === 'SCHEDULED' ? 'good' : c.status === 'COMPLETED' ? 'neutral' : 'brand'}>{c.status.toLowerCase()}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-600">{campWhen(c)} · {c.venue}, {c.city}</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink-800"><Users className="size-4 text-brand-600" /> {c.registered} / {c.capacity} registered</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="sm" variant="outline" onClick={() => setViewing(c)}>Registrations</Button>
              {c.status === 'SCHEDULED' && <Button size="sm" variant="danger" loading={cancel.isPending && cancel.variables === c.id} onClick={() => { if (window.confirm('Cancel this camp? Registered donors will be told.')) cancel.mutate(c.id); }}>Cancel camp</Button>}
            </div>
          </Card>
        ))}
      </div>
      {cancel.isError && <div className="mt-4"><ErrorNote>{cancel.error instanceof Error ? cancel.error.message : 'Could not cancel.'}</ErrorNote></div>}
      {creating && <CreateCamp onClose={() => setCreating(false)} />}
      {viewing && <Attendees camp={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
