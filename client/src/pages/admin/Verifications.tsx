import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useDebounce } from '../../hooks/useDebounce';
import { api, qs } from '../../lib/api';
import { formatDate, timeAgo } from '../../lib/format';
import type { AdminHospital, HospitalStatus, Paged } from '../../lib/types';

const TABS: { status: HospitalStatus; label: string }[] = [
  { status: 'PENDING', label: 'Waiting' },
  { status: 'VERIFIED', label: 'Verified' },
  { status: 'REJECTED', label: 'Rejected' },
  { status: 'SUSPENDED', label: 'Suspended' },
];

type Decision = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REINSTATE';

function ReviewModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState<Decision | null>(null);

  const detail = useQuery({
    queryKey: ['admin-hospital', id],
    queryFn: () => api.get<{ hospital: AdminHospital; documentUrl: string | null }>(`/admin/hospitals/${id}`),
    enabled: !!id,
  });
  const review = useMutation({
    mutationFn: (decision: Decision) => api.post(`/admin/hospitals/${id}/review`, { decision, note: note.trim() || undefined }),
    onSuccess: async () => {
      await Promise.all(['admin-hospitals', 'admin-hospital', 'admin-overview'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      setNote('');
      setConfirm(null);
      onClose();
    },
  });

  const h = detail.data?.hospital;
  const needsNote = confirm === 'REJECT' || confirm === 'SUSPEND';
  const noteError = review.error && 'fields' in review.error ? (review.error as { fields?: Record<string, string> }).fields?.note : undefined;

  const actions: { d: Decision; label: string; variant: 'primary' | 'danger' | 'outline' }[] =
    h?.status === 'PENDING' ? [{ d: 'APPROVE', label: 'Approve', variant: 'primary' }, { d: 'REJECT', label: 'Reject', variant: 'danger' }]
    : h?.status === 'VERIFIED' ? [{ d: 'SUSPEND', label: 'Suspend', variant: 'danger' }]
    : h?.status === 'SUSPENDED' ? [{ d: 'REINSTATE', label: 'Reinstate', variant: 'primary' }]
    : [];

  return (
    <Modal open={!!id} onClose={() => { setConfirm(null); setNote(''); onClose(); }} title="Review hospital" wide>
      {detail.isLoading && <PageLoader />}
      {detail.isError && <ErrorNote>{detail.error instanceof Error ? detail.error.message : 'Could not load.'}</ErrorNote>}
      {h && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-ink-900">{h.name}</p>
              <p className="text-sm text-ink-500">{[h.addressLine, h.city, h.state].filter(Boolean).join(', ')}</p>
            </div>
            <StatusBadge status={h.status} />
          </div>

          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-500">License number</dt><dd className="font-bold text-ink-900">{h.licenseNumber ?? '—'}</dd></div>
            <div><dt className="text-ink-500">Facility type</dt><dd className="font-bold text-ink-900">{h.type === 'BLOOD_BANK' ? 'Blood bank' : 'Hospital'}</dd></div>
            <div><dt className="text-ink-500">Authorised person</dt><dd className="font-bold text-ink-900">{h.contactPerson ?? '—'}{h.contactDesignation && `, ${h.contactDesignation}`}</dd></div>
            <div><dt className="text-ink-500">Facility phone</dt><dd className="font-bold text-ink-900">{h.phone ?? '—'}</dd></div>
            <div><dt className="text-ink-500">Submitted by</dt><dd className="font-bold text-ink-900">{h.claimedBy ? `${h.claimedBy.name} (${h.claimedBy.email})` : '—'}</dd></div>
            <div><dt className="text-ink-500">Submitted</dt><dd className="font-bold text-ink-900">{formatDate(h.submittedAt)}</dd></div>
            <div><dt className="text-ink-500">Listing source</dt><dd className="font-bold text-ink-900">{h.source === 'OSM' ? 'OpenStreetMap' : 'Registered on BloodBridge'}</dd></div>
            {h.reviewNote && <div className="sm:col-span-2"><dt className="text-ink-500">Last note{h.reviewedBy ? ` by ${h.reviewedBy}` : ''}</dt><dd className="font-semibold text-ink-900">{h.reviewNote}</dd></div>}
          </dl>

          <div className="rounded-2xl bg-ink-50 p-4">
            {detail.data?.documentUrl ? (
              <a href={detail.data.documentUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 font-bold text-brand-700 hover:text-brand-800">
                <ExternalLink className="size-4" /> Open license document
              </a>
            ) : (
              <p className="text-sm text-ink-500">No document could be loaded.</p>
            )}
            <p className="mt-1 text-xs text-ink-500">The link works for 10 minutes. Compare the number, the facility name and the issuing authority before approving.</p>
          </div>

          {confirm && (
            <div className="space-y-3">
              {needsNote ? (
                <Field label={confirm === 'REJECT' ? 'What should the hospital fix?' : 'Reason for suspension'} error={noteError}>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the hospital. Be specific." />
                </Field>
              ) : (
                <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
              )}
              {review.isError && !noteError && <ErrorNote>{review.error instanceof Error ? review.error.message : 'Failed.'}</ErrorNote>}
              <div className="flex gap-3">
                <Button loading={review.isPending} variant={confirm === 'APPROVE' || confirm === 'REINSTATE' ? 'primary' : 'danger'} onClick={() => review.mutate(confirm)}>
                  Confirm {confirm.toLowerCase()}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {!confirm && actions.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {actions.map((a) => <Button key={a.d} variant={a.variant} onClick={() => setConfirm(a.d)}>{a.label}</Button>)}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Verifications() {
  const [status, setStatus] = useState<HospitalStatus>('PENDING');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const q = useDebounce(text.trim(), 400);

  const list = useQuery({
    queryKey: ['admin-hospitals', status, q, page],
    queryFn: () => api.get<Paged<AdminHospital>>(`/admin/hospitals${qs({ status, q, page, pageSize: 15 })}`),
    placeholderData: (prev) => prev,
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <div>
      <PageHeader title="Verifications" subtitle="Check every license against the issuing authority before approving a hospital." />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex rounded-xl bg-ink-100 p-1">
          {TABS.map((t) => (
            <button key={t.status} onClick={() => { setStatus(t.status); setPage(1); }} className={clsx('cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition', status === t.status ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-72"><Input value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} placeholder="Search name, city or license" /></div>
      </div>

      {list.isLoading && <PageLoader />}
      {list.isError && <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load.'}</ErrorNote>}
      {list.data && list.data.items.length === 0 && <EmptyState icon={<ShieldCheck className="size-6" />} title="Nothing here" body={status === 'PENDING' ? 'No hospitals are waiting for review.' : 'No hospitals with this status.'} />}

      {list.data && list.data.items.length > 0 && (
        <Card className="overflow-hidden p-0 sm:p-0">
          <ul className="divide-y divide-ink-100">
            {list.data.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div className="min-w-0">
                  <p className="font-bold text-ink-900">{h.name}</p>
                  <p className="text-sm text-ink-500">{[h.city, h.licenseNumber && `License ${h.licenseNumber}`, h.claimedBy?.name].filter(Boolean).join(' · ')}</p>
                  {h.submittedAt && <p className="mt-0.5 text-xs font-semibold text-ink-400">Submitted {timeAgo(h.submittedAt)}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {h.type === 'BLOOD_BANK' && <Badge tone="brand">Blood bank</Badge>}
                  <Button size="sm" variant={h.status === 'PENDING' ? 'primary' : 'outline'} onClick={() => setOpenId(h.id)}>{h.status === 'PENDING' ? 'Review' : 'View'}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm font-semibold">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-ink-600">Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
      <ReviewModal id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
