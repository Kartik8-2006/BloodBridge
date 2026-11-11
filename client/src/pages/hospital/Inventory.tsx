import { ExportButtons } from '../../components/ui/ExportButtons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Minus, Plus, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useMeContext } from '../../App';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Form';
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { SplitModal } from '../../components/ui/SplitModal';
import { StockBadge } from '../../components/ui/Stock';
import { api } from '../../lib/api';
import { bloodLabel } from '../../lib/blood';
import { timeAgo } from '../../lib/format';
import type { BloodGroup } from '../../lib/types';
import type { InventoryResponse, LogRow, StockRow } from '../../lib/types3';

const tone = { OK: 'border-emerald-200 bg-emerald-50/50', LOW: 'border-amber-300 bg-amber-50', OUT: 'border-brand-300 bg-brand-50' } as const;

function ThresholdModal({ current, onClose }: { current: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(String(current));
  const save = useMutation({
    mutationFn: () => api.patch('/inventory/threshold', { lowStockThreshold: Number(v) }),
    onSuccess: async () => {
      await Promise.all(['inventory', 'forecast'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onClose();
    },
  });
  return (
    <SplitModal label="Low-stock alert level" onClose={onClose} aside={{ heading: 'Low-stock alert', text: 'When a blood group falls to this many units we warn your team and mark it Low for requesters.' }}>
      <h2 className="mb-5 text-2xl font-extrabold text-ink-900">Low-stock alert level</h2>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-5">
        {save.isError && <ErrorNote>{save.error instanceof Error ? save.error.message : 'Could not save.'}</ErrorNote>}
        <Field label="Alert at or below (units)"><Input type="number" min={0} max={500} value={v} onChange={(e) => setV(e.target.value)} /></Field>
        <Button type="submit" size="lg" className="w-full" loading={save.isPending}>Save</Button>
      </form>
    </SplitModal>
  );
}

/** One card: tap − / + or type the exact count. Nothing is sent until the bar at the bottom is saved. */
function StockCard({ row, delta, onDelta }: { row: StockRow; delta: number; onDelta: (d: number) => void }) {
  const shown = row.units + delta;
  const status = shown <= 0 ? 'OUT' : row.status === 'LOW' && delta === 0 ? 'LOW' : row.status;
  const bump = (n: number) => onDelta(Math.max(-row.units, delta + n));
  return (
    <div className={clsx('rounded-[1.5rem] border p-4 transition sm:p-5', tone[status], delta !== 0 && 'ring-2 ring-brand-400')}>
      <div className="flex items-center justify-between">
        <span className="text-2xl font-extrabold text-ink-900">{bloodLabel(row.bloodGroup)}</span>
        {delta !== 0 ? <span className={clsx('rounded-full px-2.5 py-1 text-xs font-extrabold', delta > 0 ? 'bg-emerald-600 text-white' : 'bg-brand-600 text-white')}>{delta > 0 ? `+${delta}` : delta}</span> : <StockBadge status={row.status} />}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" aria-label={`Remove one ${bloodLabel(row.bloodGroup)} unit`} disabled={shown <= 0} onClick={() => bump(-1)} className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-white text-ink-800 shadow-card ring-1 ring-ink-200 transition active:scale-95 enabled:hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40">
          <Minus className="size-5" />
        </button>
        <input
          aria-label={`${bloodLabel(row.bloodGroup)} units`}
          inputMode="numeric"
          value={shown}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, '') || 0);
            onDelta(Math.min(n, 9999) - row.units);
          }}
          className="h-12 min-w-0 flex-1 rounded-2xl border border-transparent bg-transparent text-center text-4xl font-extrabold tracking-tight text-ink-900 focus:border-brand-300 focus:bg-white focus:outline-none"
        />
        <button type="button" aria-label={`Add one ${bloodLabel(row.bloodGroup)} unit`} onClick={() => bump(1)} className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-600 text-white shadow-card transition active:scale-95 hover:bg-brand-700">
          <Plus className="size-5" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[5, 10].map((n) => (
          <button key={n} type="button" onClick={() => bump(n)} className="cursor-pointer rounded-xl bg-white/80 py-1.5 text-xs font-bold text-ink-700 ring-1 ring-ink-200 transition hover:bg-white">+{n}</button>
        ))}
      </div>
      {row.status !== 'OK' && delta === 0 && (
        <Link to={`/app/requests/new?group=${row.bloodGroup}&purpose=restock`} className="mt-3 block rounded-xl bg-brand-600 py-2 text-center text-xs font-bold text-white transition hover:bg-brand-700">
          Call {bloodLabel(row.bloodGroup)} donors
        </Link>
      )}
    </div>
  );
}

export default function Inventory() {
  const me = useMeContext();
  const qc = useQueryClient();
  const verified = me.hospital?.status === 'VERIFIED';
  const [thresholdOpen, setThresholdOpen] = useState(false);
  /** Unsaved change per group, relative to what the server holds, so a live refresh never overwrites typing. */
  const [draft, setDraft] = useState<Partial<Record<BloodGroup, number>>>({});
  const [removeReason, setRemoveReason] = useState<'ISSUED' | 'EXPIRED'>('ISSUED');
  const [note, setNote] = useState('');

  const inv = useQuery({ queryKey: ['inventory'], queryFn: () => api.get<InventoryResponse>('/inventory'), enabled: verified });
  const log = useQuery({ queryKey: ['inventory-log'], queryFn: () => api.get<{ log: LogRow[] }>('/inventory/log'), enabled: verified });

  const save = useMutation({
    mutationFn: (changes: { bloodGroup: BloodGroup; delta: number; reason: string }[]) => api.post('/inventory/batch', { changes, note: note.trim() || undefined }),
    onSuccess: async () => {
      setDraft({});
      setNote('');
      await Promise.all(['inventory', 'inventory-log', 'forecast', 'analytics'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
  });

  if (!verified) {
    return (
      <div>
        <PageHeader title="Blood inventory" />
        <EmptyState icon={<Boxes className="size-6" />} title="Available after verification" body="Once our team verifies your hospital you can track stock here and requesters see whether you have their group." action={<Link to="/app/my-hospital"><Button>Check verification status</Button></Link>} />
      </div>
    );
  }
  if (inv.isLoading) return <PageLoader />;
  if (inv.isError || !inv.data) return <ErrorNote>{inv.error instanceof Error ? inv.error.message : 'Could not load inventory.'}</ErrorNote>;
  const { stock, total, threshold } = inv.data;

  const changed = stock.filter((s) => (draft[s.bloodGroup] ?? 0) !== 0);
  const added = changed.reduce((n, s) => n + Math.max(0, draft[s.bloodGroup]!), 0);
  const removed = changed.reduce((n, s) => n + Math.max(0, -draft[s.bloodGroup]!), 0);
  const submit = () => save.mutate(changed.map((s) => ({ bloodGroup: s.bloodGroup, delta: draft[s.bloodGroup]!, reason: draft[s.bloodGroup]! > 0 ? 'RECEIVED' : removeReason })));

  return (
    <div className={clsx(changed.length > 0 && 'pb-44 sm:pb-32')}>
      <PageHeader
        title="Blood inventory"
        subtitle={`${total} unit${total === 1 ? '' : 's'} in stock. Tap + or − on any group, or type the exact count, then save once.`}
        right={<div className="flex flex-wrap items-center gap-2"><ExportButtons /><Button variant="outline" icon={<Settings2 className="size-4" />} onClick={() => setThresholdOpen(true)}>Alert level: {threshold}</Button></div>}
      />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {stock.map((s) => (
          <StockCard key={s.bloodGroup} row={s} delta={draft[s.bloodGroup] ?? 0} onDelta={(d) => setDraft((p) => ({ ...p, [s.bloodGroup]: d }))} />
        ))}
      </div>

      <Card className="mt-8">
        <CardTitle>Recent activity</CardTitle>
        {log.data && log.data.log.length === 0 && <p className="text-sm text-ink-500">No stock movements yet. Add the units you hold now and save.</p>}
        <ul className="divide-y divide-ink-100">
          {log.data?.log.map((l) => (
            <li key={l.id} className="flex items-center gap-4 py-3">
              <span className={clsx('flex size-9 shrink-0 items-center justify-center rounded-xl', l.delta > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-50 text-brand-700')}>{l.delta > 0 ? <Plus className="size-4" /> : <Minus className="size-4" />}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-bold text-ink-900">{Math.abs(l.delta)} × {bloodLabel(l.bloodGroup)}</span>
                <span className="text-ink-600"> {l.reason.toLowerCase()}{l.note ? ` · ${l.note}` : ''}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-500">{timeAgo(l.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>

      {changed.length > 0 && (
        <div role="region" aria-label="Unsaved stock changes" className="rise-in fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:left-[288px] sm:p-4">
          <div className="mx-auto flex max-w-6xl pr-24 sm:pr-28 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-ink-900">
                {changed.length} group{changed.length === 1 ? '' : 's'} changed
                <span className="ml-2 font-semibold text-ink-500">{added > 0 && <span className="text-emerald-700">+{added} in</span>}{added > 0 && removed > 0 && ' · '}{removed > 0 && <span className="text-brand-700">−{removed} out</span>}</span>
              </p>
              {save.isError && <p className="mt-1 text-xs font-semibold text-brand-700">{save.error instanceof Error ? save.error.message : 'Could not save.'}</p>}
            </div>
            {removed > 0 && (
              <div className="inline-flex rounded-xl bg-ink-100 p-1 text-xs font-bold" role="group" aria-label="Why were units removed">
                {(['ISSUED', 'EXPIRED'] as const).map((r) => (
                  <button key={r} type="button" aria-pressed={removeReason === r} onClick={() => setRemoveReason(r)} className={clsx('cursor-pointer rounded-lg px-3 py-1.5', removeReason === r ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500')}>
                    {r === 'ISSUED' ? 'Issued to patients' : 'Expired'}
                  </button>
                ))}
              </div>
            )}
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} aria-label="Note (optional)" placeholder="Note (optional)" className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm sm:w-48" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setDraft({}); save.reset(); }}>Discard</Button>
              <Button className="flex-1 sm:flex-none" loading={save.isPending} onClick={submit}>Save changes</Button>
            </div>
          </div>
        </div>
      )}
      {thresholdOpen && <ThresholdModal current={threshold} onClose={() => setThresholdOpen(false)} />}
    </div>
  );
}
