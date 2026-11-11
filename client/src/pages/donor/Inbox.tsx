import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, HeartHandshake, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMeContext } from '../../App';
import { BloodChip, ResponseBadge, UrgencyBadge, formatWhen, whenLeft } from '../../components/request/bits';
import { CodePanel } from '../../components/request/CodePanel';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { api } from '../../lib/api';
import type { InboxItem } from '../../lib/types';

interface Inbox { active: InboxItem[]; history: InboxItem[] }
interface Issued { code: string; codeExpiresAt: string }

function Item({ item, codes, onAccepted }: { item: InboxItem; codes: Record<string, Issued>; onAccepted: (id: string, c: Issued) => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const refresh = () => Promise.all(['inbox', 'dashboard', 'me', 'request'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const run = (path: string, after?: (r: Issued) => void) => api.post<Issued>(`/responses/${item.responseId}/${path}`).then((r) => { after?.(r); return r; });
  const accept = useMutation({ mutationFn: () => run('accept', (r) => onAccepted(item.responseId, r)), onSuccess: refresh, onError: (e) => setError(e.message) });
  const decline = useMutation({ mutationFn: () => run('decline'), onSuccess: refresh, onError: (e) => setError(e.message) });
  const withdraw = useMutation({ mutationFn: () => run('withdraw'), onSuccess: refresh, onError: (e) => setError(e.message) });
  const r = item.request;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <BloodChip group={r.bloodGroup} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-ink-900">{r.patientName} needs {r.unitsNeeded} {r.unitsNeeded === 1 ? 'unit' : 'units'}</p>
            <UrgencyBadge urgency={r.urgency} />
            <ResponseBadge status={item.status} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600"><MapPin className="size-4 shrink-0" /> {r.hospital.name}{r.hospital.city ? `, ${r.hospital.city}` : ''} · {item.distanceKm} km from you</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500"><Clock className="size-4 shrink-0" /> Needed by {formatWhen(r.neededBy)}{r.status === 'OPEN' ? ` · ${whenLeft(r.neededBy)}` : ''}</p>
        </div>
      </div>

      {item.status === 'INVITED' && r.status === 'OPEN' && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button loading={accept.isPending} onClick={() => { setError(''); accept.mutate(); }} icon={<HeartHandshake className="size-4" />}>I can donate</Button>
          <Button variant="outline" loading={decline.isPending} onClick={() => { setError(''); decline.mutate(); }}>Not now</Button>
          <Link to={`/app/requests/${r.id}`} className="inline-flex h-11 items-center px-2 text-sm font-bold text-brand-700">Details</Link>
        </div>
      )}

      {item.status === 'ACCEPTED' && (
        <div className="mt-5 space-y-4">
          <CodePanel responseId={item.responseId} initial={codes[item.responseId]} onChange={refresh} />
          <div className="flex flex-wrap gap-3">
            <Link to={`/app/requests/${r.id}`}><Button variant="outline" size="sm">Hospital details and directions</Button></Link>
            <Button variant="danger" size="sm" loading={withdraw.isPending} onClick={() => { if (confirm('Let the family know you can no longer make it?')) withdraw.mutate(); }}>I can’t make it</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

export default function DonorInbox() {
  const me = useMeContext();
  const [codes, setCodes] = useState<Record<string, Issued>>({});
  const inbox = useQuery({ queryKey: ['inbox'], queryFn: () => api.get<Inbox>('/requests/inbox'), refetchInterval: 30_000 });
  const available = me.donor?.available;

  return (
    <div>
      <PageHeader title="Requests for you" subtitle="Compatible patients near you, most urgent first. Final screening is always done by the hospital." />
      {available === false && (
        <div className="mb-6 rounded-2xl border border-plasma-400/40 bg-plasma-100 p-4 text-sm font-medium text-ink-800">You are paused, so new requests will not reach you. Turn availability back on from your dashboard.</div>
      )}
      {me.eligibility && !me.eligibility.eligible && (
        <div className="mb-6 rounded-2xl border border-plasma-400/40 bg-plasma-100 p-4 text-sm font-medium text-ink-800">You are not eligible to donate right now: {me.eligibility.reasons[0]}</div>
      )}
      {inbox.isLoading && <PageLoader />}
      {inbox.isError && <ErrorNote>{inbox.error instanceof Error ? inbox.error.message : 'Could not load requests.'}</ErrorNote>}
      {inbox.data && (
        <>
          {inbox.data.active.length === 0 ? (
            <EmptyState icon={<HeartHandshake className="size-6" />} title="No one needs you right now" body="When a matching request opens near you, it appears here and we notify you instantly." />
          ) : (
            <div className="space-y-4">
              {inbox.data.active.map((i) => <Item key={i.responseId} item={i} codes={codes} onAccepted={(id, c) => setCodes((p) => ({ ...p, [id]: c }))} />)}
            </div>
          )}
          {inbox.data.history.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 text-lg font-bold text-ink-900">Earlier</h2>
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-ink-100">
                  {inbox.data.history.map((h) => (
                    <li key={h.responseId}>
                      <Link to={`/app/requests/${h.request.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-ink-50">
                        <BloodChip group={h.request.bloodGroup} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold text-ink-900">{h.request.hospital.name}</span>
                          <span className="block text-sm text-ink-500">{formatWhen(h.request.neededBy)}</span>
                        </span>
                        <ResponseBadge status={h.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
