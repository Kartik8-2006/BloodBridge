import { clsx } from 'clsx';
import type { Risk, StockStatus } from '../../lib/types3';
import { Badge } from './Misc';

export function StockBadge({ status }: { status: StockStatus }) {
  return status === 'OK' ? <Badge tone="good">In stock</Badge> : status === 'LOW' ? <Badge tone="warn">Low</Badge> : <Badge tone="brand">Out</Badge>;
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const tone = risk === 'LOW' ? 'good' : risk === 'MEDIUM' ? 'warn' : 'brand';
  const label = { LOW: 'Low risk', MEDIUM: 'Watch', HIGH: 'High risk', CRITICAL: 'Critical' }[risk];
  return <span className={clsx(risk === 'CRITICAL' && 'animate-pulse')}><Badge tone={tone}>{label}</Badge></span>;
}
