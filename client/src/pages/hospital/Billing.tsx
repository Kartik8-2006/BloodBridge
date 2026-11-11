import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Check, Crown, Receipt, ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useMeContext } from '../../App';
import { Button } from '../../components/ui/Button';
import { Badge, Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { api } from '../../lib/api';
import { formatDate, formatINR } from '../../lib/format';
import type { BillingInfo, CheckoutOrder } from '../../lib/types4';

interface RazorpayResponse { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
interface RazorpayInstance { open(): void; on(event: 'payment.failed', cb: (r: { error?: { description?: string } }) => void): void }
declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance }
}

let scriptPromise: Promise<boolean> | null = null;
/** Loads Razorpay Checkout once. Resolves false when the script is blocked (ad blocker, offline). */
function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  scriptPromise ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => { scriptPromise = null; resolve(false); };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export default function Billing() {
  const me = useMeContext();
  const qc = useQueryClient();
  const verified = me.hospital?.status === 'VERIFIED';
  const [interval, setInterval] = useState<'MONTHLY' | 'YEARLY'>('YEARLY');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const info = useQuery({ queryKey: ['billing'], queryFn: () => api.get<BillingInfo>('/billing'), enabled: !!me.hospital });
  const verify = useMutation({
    mutationFn: (r: RazorpayResponse) => api.post('/billing/verify', { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
    onSuccess: async () => {
      setNotice('Payment received. Pro is now active for your hospital.');
      await Promise.all(['billing', 'notifications', 'analytics', 'forecast', 'my-camps'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not confirm the payment.'),
  });

  const pay = useMutation({
    mutationFn: async () => {
      setError('');
      setNotice('');
      if (!(await loadCheckout()) || !window.Razorpay) throw new Error('Could not load the payment window. Turn off any ad blocker and try again.');
      const o = await api.post<CheckoutOrder>('/billing/checkout', { interval });
      await new Promise<void>((resolve, reject) => {
        const rz = new window.Razorpay!({
          key: o.keyId,
          amount: o.amount,
          currency: o.currency,
          name: o.name,
          description: o.description,
          order_id: o.orderId,
          prefill: o.prefill,
          theme: { color: '#c8102e' },
          handler: (r: RazorpayResponse) => { verify.mutate(r); resolve(); },
          modal: { ondismiss: () => resolve() },
        });
        rz.on('payment.failed', (r) => reject(new Error(r.error?.description ?? 'The payment failed. You have not been charged.')));
        rz.open();
      });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'),
  });

  if (!me.hospital) return <div><PageHeader title="Billing" /><EmptyState icon={<Receipt className="size-6" />} title="Link your hospital first" action={<Link to="/app/my-hospital"><Button>Open My Hospital</Button></Link>} /></div>;
  if (info.isLoading) return <PageLoader />;
  if (info.isError || !info.data) return <ErrorNote>{info.error instanceof Error ? info.error.message : 'Could not load billing.'}</ErrorNote>;
  const b = info.data;
  const sub = b.subscription;
  const price = interval === 'MONTHLY' ? b.plans.pro.monthlyPaise : b.plans.pro.yearlyPaise;
  const saving = Math.max(0, Math.round((1 - b.plans.pro.yearlyPaise / (b.plans.pro.monthlyPaise * 12)) * 100));

  return (
    <div>
      <PageHeader title="Billing" subtitle="Free keeps you on the network. Pro adds the tools to plan ahead." />

      {!b.billingEnabled && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
          <Check className="mt-0.5 size-5 shrink-0" /> Payments are not switched on for this deployment, so every Pro feature is unlocked for you.
        </div>
      )}
      {notice && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">{notice}</div>}
      {error && <div className="mb-6"><ErrorNote>{error}</ErrorNote></div>}

      {b.billingEnabled && sub.active && (
        <div className="mb-6 flex flex-col gap-2 rounded-[1.75rem] bg-gradient-to-r from-brand-700 to-wine-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3"><Crown className="size-7 text-plasma-400" /><div><p className="text-lg font-extrabold">Pro is active</p><p className="text-sm text-brand-100">Renews or ends on {formatDate(sub.currentPeriodEnd)}. Paying again adds time to this date.</p></div></div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-ink-900">Free</h2>{(!b.billingEnabled || !sub.active) && <Badge>Current</Badge>}</div>
          <p className="mt-2 text-4xl font-extrabold text-ink-900">{formatINR(0)}</p>
          <ul className="mt-6 space-y-3 text-sm text-ink-700">
            {b.plans.free.features.map((f) => <li key={f} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />{f}</li>)}
          </ul>
        </Card>

        <Card className="border-plasma-400/60 ring-2 ring-plasma-400/40">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-xl font-extrabold text-ink-900"><Crown className="size-5 text-plasma-600" /> Pro</h2>{sub.active && b.billingEnabled && <Badge tone="good">Active</Badge>}</div>
          <div className="mt-4 inline-flex rounded-xl bg-ink-100 p-1" role="group" aria-label="Billing period">
            {([['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={interval === k} onClick={() => setInterval(k)} className={clsx('cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition', interval === k ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}>
                {label}{k === 'YEARLY' && saving > 0 ? ` · save ${saving}%` : ''}
              </button>
            ))}
          </div>
          <p className="mt-4 text-4xl font-extrabold text-ink-900">{formatINR(price)}<span className="text-base font-semibold text-ink-500"> / {interval === 'MONTHLY' ? 'month' : 'year'}</span></p>
          <ul className="mt-6 space-y-3 text-sm text-ink-700">
            {b.plans.pro.features.map((f) => <li key={f} className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-plasma-600" />{f}</li>)}
          </ul>
          {b.billingEnabled && (
            <>
              <Button size="lg" className="mt-7 w-full" loading={pay.isPending || verify.isPending} disabled={!verified} icon={<Crown className="size-5" />} onClick={() => pay.mutate()}>
                {sub.active ? 'Extend Pro' : 'Upgrade to Pro'}
              </Button>
              {!verified && <p className="mt-3 text-xs font-medium text-ink-500">Available after your hospital is verified.</p>}
              <p className="mt-3 flex items-center gap-2 text-xs text-ink-500"><ShieldCheck className="size-4" /> Secure payment by Razorpay. UPI, cards and netbanking. We never see your card details.</p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        {[[BarChart3, 'Analytics', 'Fulfilment rate, demand by group, donations by month.'], [Sparkles, 'Stock forecast', 'A 7 day outlook that tells you which group runs short first.'], [CalendarDays, 'Unlimited camps', 'Free allows 2 active camps at a time.']].map(([Icon, t, d]) => {
          const I = Icon as typeof BarChart3;
          return <div key={t as string} className="rounded-2xl border border-ink-100 bg-white p-5"><I className="size-6 text-brand-600" /><p className="mt-3 font-bold text-ink-900">{t as string}</p><p className="mt-1 text-sm text-ink-600">{d as string}</p></div>;
        })}
      </div>

      <Card className="mt-8">
        <CardTitle>Payment history</CardTitle>
        {b.payments.length === 0 ? <p className="text-sm text-ink-500">No payments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-ink-500"><tr><th className="pb-3">Date</th><th className="pb-3">Plan</th><th className="pb-3 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {b.payments.map((p) => <tr key={p.id}><td className="py-3">{formatDate(p.paidAt)}</td><td className="py-3">Pro · {p.interval === 'MONTHLY' ? 'Monthly' : 'Yearly'}</td><td className="py-3 text-right font-bold">{formatINR(p.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
