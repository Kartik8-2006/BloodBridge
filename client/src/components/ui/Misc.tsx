import { AlertCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card sm:p-8', className)}>{children}</div>
  );
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 border-b border-ink-100 pb-4">
      <h2 className="text-lg font-bold text-ink-900">{children}</h2>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'dark';
const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  dark: 'bg-ink-800 text-white',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-5 animate-spin text-brand-600', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="size-8" />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-ink-200 bg-ink-50/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white text-ink-400 shadow-card">{icon}</div>}
      <p className="font-bold text-ink-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-base text-ink-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5 leading-none', className)}>
      <span className="grid size-10 place-items-center rounded-full bg-brand-700 text-white shadow-glow ring-4 ring-brand-100/70">
        <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
          <path d="M16 3.5C12.5 8.7 7.7 12.8 7.7 19A8.3 8.3 0 0 0 16 27.3 8.3 8.3 0 0 0 24.3 19c0-6.2-4.8-10.3-8.3-15.5Z" fill="currentColor" />
          <path d="M9.5 18h3.2l1.8-3.1 2.8 6.1 1.8-3h3.2" fill="none" stroke="#f1cd6b" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
        </svg>
      </span>
      <span className="flex flex-col gap-1">
        <span className={clsx('text-[8px] font-extrabold uppercase tracking-[.26em]', light ? 'text-brand-100' : 'text-ink-500')}>Care network</span>
        <span className={clsx('text-[1.38rem] font-black tracking-[-.065em]', light ? 'text-white' : 'text-ink-800')}>Blood<span className={light ? 'text-plasma-300' : 'text-brand-700'}>Bridge</span></span>
      </span>
    </span>
  );
}
