import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { api } from '../../lib/api';
import { ROLE_LABEL, timeAgo } from '../../lib/format';
import type { Role } from '../../lib/types';
import type { FraudFlagRow } from '../../lib/types4';

const TABS = [['OPEN', 'Open'], ['CONFIRMED', 'Confirmed'], ['DISMISSED', 'Dismissed']] as const;
const KIND: Record<string, string> = {
  'request.duplicate_patient': 'Same patient, several hospitals',
  'request.volume': 'Too many requests',
  'request.shared_phone': 'Shared phone number',
  'hospital.licence_reuse': 'Licence reused',
  'handshake.bruteforce': 'Repeated wrong desk codes',
};
const tone = { HIGH: 'brand', MEDIUM: 'warn', LOW: 'neutral' } as const;

export default function Fraud() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('OPEN');
  const [target, setTarget] = useState<FraudFlagRow | null>(null);
  const [note, setNote] = useState('');
  const [suspend, setSuspend] = useState(false);

  const list = useQuery({ queryKey: ['fraud', tab], queryFn: () => api.get<{ flags: FraudFlagRow[] }>(`/admin/fraud?status=${tab}`) });
  const close = () => { setTarget(null); setNote(''); setSuspend(false); };
  const review = useMutation({
    mutationFn: (decision: 'DISMISSED' | 'CONFIRMED') => api.post(`/admin/fraud/${target!.id}/review`, { decision, note, suspendUser: decision === 'CONFIRMED' && suspend }),
    onSuccess: async () => {
      await Promise.all(['fraud', 'admin-overview', 'admin-users'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      close();
    },
  });
  const flags = list.data?.flags ?? [];
  const canSuspend = !!target?.user && target.user.role !== 'ADMIN' && target.user.status === 'ACTIVE';

  return (
    <div>
      <PageHeader title="Fraud review" subtitle="Flags are raised automatically from patterns such as duplicate requests, shared phones, reused licences and repeated wrong desk codes." />
      <div className="mb-6 inline-flex flex-wrap rounded-xl bg-ink-100 p-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition', tab === k ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}>{label}</button>
        ))}
      </div>

      {list.isLoading && <PageLoader />}
      {list.isError && <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load flags.'}</ErrorNote>}
      {list.data && flags.length === 0 && <EmptyState icon={<ShieldAlert className="size-6" />} title={tab === 'OPEN' ? 'Nothing to review' : 'Nothing here yet'} body={tab === 'OPEN' ? 'No suspicious activity is waiting for you.' : undefined} />}

      <div className="space-y-4">
        {flags.map((f) => (
          <Card key={f.id} className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone[f.severity]}>{f.severity}</Badge>
              <span className="font-extrabold text-ink-900">{KIND[f.kind] ?? f.kind}</span>
              <span className="ml-auto text-xs text-ink-500">{timeAgo(f.createdAt)}</span>
            </div>
            <p className="mt-3 text-sm text-ink-800">{f.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
              {f.user && <span>{f.user.name} · {f.user.email}{f.user.role ? ` · ${ROLE_LABEL[f.user.role as Role]}` : ''}{f.user.status === 'SUSPENDED' ? ' · suspended' : ''}</span>}
              <span>{f.subjectType} {f.subjectId.slice(0, 10)}</span>
            </div>
            {f.note && <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">Admin note: {f.note}</p>}
            {f.status === 'OPEN' && <Button className="mt-4" size="sm" variant="outline" onClick={() => setTarget(f)}>Review</Button>}
          </Card>
        ))}
      </div>

      <Modal open={!!target} onClose={close} title="Review flag">
        {target && (
          <div className="space-y-5">
            <p className="text-sm text-ink-700"><span className="font-bold">{KIND[target.kind] ?? target.kind}.</span> {target.summary}</p>
            <Field label="Your note" hint="Required. Saved to the audit log."><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="What you checked and what you decided" /></Field>
            {canSuspend && (
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 p-4 text-sm">
                <input type="checkbox" checked={suspend} onChange={(e) => setSuspend(e.target.checked)} className="mt-1 size-4 accent-[#c8102e]" />
                <span><span className="block font-bold text-ink-900">Also suspend {target.user!.name}</span><span className="text-ink-600">Applies only if you confirm. They are signed out of BloodBridge.</span></span>
              </label>
            )}
            {review.isError && <ErrorNote>{review.error instanceof Error ? review.error.message : 'Could not save.'}</ErrorNote>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="flex-1" loading={review.isPending && review.variables === 'DISMISSED'} disabled={note.trim().length < 3} onClick={() => review.mutate('DISMISSED')}>Dismiss</Button>
              <Button variant="danger" className="flex-1" loading={review.isPending && review.variables === 'CONFIRMED'} disabled={note.trim().length < 3} onClick={() => review.mutate('CONFIRMED')}>Confirm fraud</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
