import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

export function StatCard({ icon: Icon, label, value, hint, tone = 'neutral' }: { icon: LucideIcon; label: string; value: string | number; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'brand' }) {
  return (
    <div className="rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card">
      <div className={clsx('mb-5 flex size-12 items-center justify-center rounded-2xl', tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-700')}>
        <Icon className="size-6" />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-500">{label}</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink-900">{value}</p>
      {hint && (
        <p className={clsx('mt-2 text-sm font-medium', tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-plasma-600' : 'text-ink-500')}>{hint}</p>
      )}
    </div>
  );
}
