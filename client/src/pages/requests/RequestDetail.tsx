import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CheckCircle2, Clock, MapPin, Phone, Radar, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMeContext } from '../../App';
import { BloodChip, Progress, RequestStatusBadge, ResponseBadge, UrgencyBadge, formatWhen, whenLeft } from '../../components/request/bits';
import { CodePanel } from '../../components/request/CodePanel';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { StatCard } from '../../components/ui/StatCard';
import { Modal } from '../../components/ui/Modal';
import { ApiError, api } from '../../lib/api';
import type { RequestDetail as Detail } from '../../lib/types';

interface HandshakeResult { donation: { certificateNo: string; donor: string }; unitsFulfilled: number; status: string }

function DeskVerify({ requestId, open, done, setDone }: { requestId: string; open: boolean; done: HandshakeResult | null; setDone: (r: HandshakeResult | null) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const verify = useMutation({
    mutationFn: () => api.post<HandshakeResult>(`/requests/${requestId}/handshake`, { code }),
    onSuccess: (r) => {
      setDone(r);
      setCode('');
      for (const k of ['request', 'requests', 'dashboard']) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) verify.mutate();
  };

  return (
    <Card>
      <CardTitle>Desk verification</CardTitle>
      <p className="mb-4 text-sm text-ink-600">When a donor arrives and completes screening and donation, ask for the 6 digit code from their app and enter it here. This records the donation and issues their certificate.</p>
      {open && (
      <form onSubmit={submit} className="flex flex-wrap items-start gap-3">
        <Input aria-label="6 digit donor code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); verify.reset(); }}
          placeholder="000000" className="h-12 w-44 text-center font-mono text-xl font-bold tracking-[0.3em]" />
        <Button type="submit" size="lg" loading={verify.isPending} disabled={code.length !== 6} icon={<ShieldCheck className="size-5" />}>Confirm donation</Button>
      </form>
      )}
      {verify.isError && <div className="mt-4"><ErrorNote>{verify.error instanceof ApiError ? verify.error.message : 'Could not verify the code.'}</ErrorNote></div>}
      {done && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <p><strong>{done.donation.donor}</strong> donated. Certificate <span className="font-mono font-bold">{done.donation.certificateNo}</span> issued. {done.unitsFulfilled} unit(s) received so far{done.status === 'FULFILLED' ? ', request fulfilled.' : '.'}</p>
        </div>
      )}
    </Card>
  );
}

export default function RequestDetail() {
  const { id = '' } = useParams();
  const me = useMeContext();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { state } = useLocation() as { state: { alerted?: number; radiusKm?: number } | null };
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deskResult, setDeskResult] = useState<HandshakeResult | null>(null);
  const [notice, setNotice] = useState(state?.alerted !== undefined ? `Request sent. ${state.alerted} compatible ${state.alerted === 1 ? 'donor was' : 'donors were'} alerted within ${state.radiusKm} km.` : '');

  const q = useQuery({ queryKey: ['request', id], queryFn: () => api.get<Detail>(`/requests/${id}`), refetchInterval: 30_000 });
  const refresh = () => Promise.all(['request', 'requests', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const cancel = useMutation({ mutationFn: () => api.post(`/requests/${id}/cancel`), onSuccess: () => { setConfirmCancel(false); void refresh(); } });
  const widen = useMutation({
    mutationFn: () => api.post<{ alerted: number; radiusKm: number }>(`/requests/${id}/escalate`),
    onSuccess: (r) => { setNotice(r.alerted ? `Search widened to ${r.radiusKm} km. ${r.alerted} more ${r.alerted === 1 ? 'donor was' : 'donors were'} alerted.` : `Search widened to ${r.radiusKm} km. No additional eligible donors found yet.`); void refresh(); },
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) {
    return <EmptyState title="Request not found" body={q.error instanceof Error ? q.error.message : undefined} action={<Button onClick={() => nav(-1)}>Go back</Button>} />;
  }
  const r = q.data;
  const open = r.status === 'OPEN';
  const manage = r.viewer !== 'DONOR';
  const isDesk = r.viewer === 'HOSPITAL' && me.user.role === 'HOSPITAL';

  return (
    <div>
      <PageHeader
        title={r.viewer === 'DONOR' ? `${r.patientName} needs blood` : `Request for ${r.patientName}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><UrgencyBadge urgency={r.urgency} /><RequestStatusBadge status={r.status} /><span>Created {formatWhen(r.createdAt)}</span></span>}
        right={manage && open && r.viewer !== 'ADMIN' ? <Button variant="danger" icon={<Ban className="size-4" />} onClick={() => setConfirmCancel(true)}>Cancel request</Button> : undefined}
      />
      {notice && <div role="status" className="mb-6 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-start gap-5">
              <BloodChip group={r.bloodGroup} size="lg" />
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-lg font-extrabold text-ink-900">{r.unitsNeeded} {r.unitsNeeded === 1 ? 'unit' : 'units'} needed</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600"><Clock className="size-4" /> By {formatWhen(r.neededBy)}{open ? ` · ${whenLeft(r.neededBy)}` : ''}</p>
                </div>
                <Progress done={r.unitsFulfilled} total={r.unitsNeeded} />
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-ink-50 p-4">
              <p className="font-bold text-ink-900">{r.hospital.name}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-600"><MapPin className="mt-0.5 size-4 shrink-0" /> {[r.hospital.addressLine, r.hospital.city].filter(Boolean).join(', ') || 'Address on file'}</p>
              {r.hospital.phone && <a href={`tel:${r.hospital.phone}`} className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Phone className="size-4" /> {r.hospital.phone}</a>}
              <a className="mt-3 inline-block text-sm font-bold text-brand-700" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?to=${r.hospital.lat}%2C${r.hospital.lng}`}>Get directions</a>
            </div>
            {r.note && <p className="mt-4 rounded-2xl border border-ink-100 p-4 text-sm text-ink-700"><span className="font-bold">Note: </span>{r.note}</p>}
            {r.contactPhone && <a href={`tel:${r.contactPhone}`} className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-800"><Phone className="size-4" /> Family contact: {r.contactPhone}{r.viewer !== 'DONOR' ? ` (${r.requester.name})` : ''}</a>}
          </Card>

          {r.viewer === 'DONOR' && (
            <Card>
              <CardTitle action={<ResponseBadge status={r.response.status} />}>Your response</CardTitle>
              {r.response.status === 'ACCEPTED' && <CodePanel responseId={r.response.id} onChange={refresh} />}
              {r.response.status === 'INVITED' && open && <p className="text-sm text-ink-600">You have not responded yet. <Link to="/app/inbox" className="font-bold text-brand-700">Open Requests for you</Link> to accept.</p>}
              {r.response.status === 'DONATED' && <p className="text-sm text-ink-600">Thank you for donating. <Link to="/app/certificates" className="font-bold text-brand-700">See your certificate</Link>.</p>}
              {(r.response.status === 'DECLINED' || r.response.status === 'CANCELLED') && <p className="text-sm text-ink-600">This invitation is closed.</p>}
            </Card>
          )}

          {isDesk && (open || deskResult) && <DeskVerify requestId={r.id} open={open} done={deskResult} setDone={setDeskResult} />}

          {manage && (
            <Card>
              <CardTitle>Donors on the way</CardTitle>
              {r.donors.length === 0 ? (
                <p className="text-sm text-ink-500">No donor has accepted yet. {r.invited} {r.invited === 1 ? 'is' : 'are'} still deciding.</p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {r.donors.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 font-bold text-brand-700">{d.name.charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-ink-900">{d.name}</span>
                        <span className="block text-xs text-ink-500">{d.distanceKm} km away{d.completedAt ? ` · donated ${formatWhen(d.completedAt)}` : d.acceptedAt ? ` · accepted ${formatWhen(d.acceptedAt)}` : ''}</span>
                      </span>
                      {d.phone && d.status === 'ACCEPTED' && <a href={`tel:${d.phone}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><Phone className="size-4" /> Call</a>}
                      <ResponseBadge status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        {manage && (
          <div className="space-y-5">
            <StatCard icon={Radar} label="Donors alerted" value={r.matchedCount} hint={`Within ${r.radiusKm} km of the hospital`} tone="brand" />
            <StatCard icon={CheckCircle2} label="On the way" value={r.accepted} hint={`${r.declined} declined`} tone="good" />
            {open && r.viewer !== 'ADMIN' && (
              <Card className="p-6">
                <p className="font-bold text-ink-900">Not enough responses?</p>
                <p className="mt-1 text-sm text-ink-600">Widen the search area by 50% to alert more eligible donors.</p>
                <Button className="mt-4 w-full" variant="outline" loading={widen.isPending} onClick={() => widen.mutate()}>Widen search</Button>
                {widen.isError && <div className="mt-3"><ErrorNote>{widen.error instanceof Error ? widen.error.message : 'Could not widen the search.'}</ErrorNote></div>}
              </Card>
            )}
          </div>
        )}
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this request?">
        <p className="text-sm text-ink-600">Donors who accepted will be told the request is closed. This cannot be undone.</p>
        {cancel.isError && <div className="mt-4"><ErrorNote>{cancel.error instanceof Error ? cancel.error.message : 'Could not cancel.'}</ErrorNote></div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep request</Button>
          <Button loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel request</Button>
        </div>
      </Modal>
    </div>
  );
}
