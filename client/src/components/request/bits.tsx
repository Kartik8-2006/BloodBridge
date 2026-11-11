import { clsx } from 'clsx';
import { Badge } from '../ui/Misc';
import { bloodLabel } from '../../lib/blood';
import type { BloodGroup, RequestStatus, ResponseStatus, Urgency } from '../../lib/types';

export function BloodChip({ group, size = 'md' }: { group: BloodGroup; size?: 'md' | 'lg' }) {
  return (
    <span className={clsx('flex shrink-0 items-center justify-center rounded-xl bg-brand-700 font-extrabold text-white', size === 'lg' ? 'size-16 text-xl' : 'size-12 text-base')}>
      {bloodLabel(group)}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <Badge tone={urgency === 'CRITICAL' ? 'brand' : urgency === 'URGENT' ? 'warn' : 'neutral'}>
      {urgency === 'CRITICAL' ? 'Critical' : urgency === 'URGENT' ? 'Urgent' : 'Planned'}
    </Badge>
  );
}

const STATUS: Record<RequestStatus, { label: string; tone: 'good' | 'warn' | 'neutral' | 'brand' }> = {
  OPEN: { label: 'Open', tone: 'brand' },
  FULFILLED: { label: 'Fulfilled', tone: 'good' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED: { label: 'Expired', tone: 'warn' },
};
export const RequestStatusBadge = ({ status }: { status: RequestStatus }) => <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;

const RESPONSE: Record<ResponseStatus, { label: string; tone: 'good' | 'warn' | 'neutral' | 'brand' }> = {
  INVITED: { label: 'Waiting for you', tone: 'warn' },
  ACCEPTED: { label: 'You accepted', tone: 'brand' },
  DECLINED: { label: 'Declined', tone: 'neutral' },
  DONATED: { label: 'Donated', tone: 'good' },
  CANCELLED: { label: 'Closed', tone: 'neutral' },
};
export const ResponseBadge = ({ status }: { status: ResponseStatus }) => <Badge tone={RESPONSE[status].tone}>{RESPONSE[status].label}</Badge>;

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-600">
        <span>{done} of {total} {total === 1 ? 'unit' : 'units'} received</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function whenLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'overdue';
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
  if (h < 48) return `${h} h left`;
  return `${Math.floor(h / 24)} days left`;
}
