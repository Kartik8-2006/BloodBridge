import { Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

/** True when the server refused because the hospital is on the Free plan. */
export const isPlanError = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 402 && e.code === 'plan_required';

export function UpgradePrompt({ title = 'This is part of the Pro plan', body, compact }: { title?: string; body?: string; compact?: boolean }) {
  return (
    <div className={compact ? 'rounded-2xl border border-plasma-400/50 bg-plasma-100 p-4' : 'rounded-[1.75rem] border border-plasma-400/50 bg-gradient-to-br from-plasma-100 to-white p-6 sm:p-8'}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-plasma-500 text-white"><Crown className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-ink-900">{title}</p>
          <p className="mt-1 text-sm text-ink-600">{body ?? 'Upgrade from the Billing page to unlock analytics, the stock forecast and unlimited camps.'}</p>
        </div>
        <Link to="/app/billing"><Button className="w-full sm:w-auto">See Pro plan</Button></Link>
      </div>
    </div>
  );
}
