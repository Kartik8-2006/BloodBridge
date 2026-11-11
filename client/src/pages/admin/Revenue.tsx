import { useQuery } from '@tanstack/react-query';
import { Crown, IndianRupee, Receipt } from 'lucide-react';
import { Card, CardTitle, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { StatCard } from '../../components/ui/StatCard';
import { api } from '../../lib/api';
import { formatDate, formatINR } from '../../lib/format';
import type { RevenueSummary } from '../../lib/types4';

export default function Revenue() {
  const q = useQuery({ queryKey: ['admin-revenue'], queryFn: () => api.get<RevenueSummary>('/admin/billing') });
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorNote>{q.error instanceof Error ? q.error.message : 'Could not load revenue.'}</ErrorNote>;
  const r = q.data;
  return (
    <div>
      <PageHeader title="Revenue" subtitle="Pro plan payments from hospitals, confirmed by Razorpay." />
      {!r.billingEnabled && <div className="mb-6 rounded-2xl border border-plasma-400/40 bg-plasma-100 p-4 text-sm font-medium text-ink-800">Razorpay keys are not set on this deployment, so every hospital has Pro unlocked and no payments are taken.</div>}
      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard icon={IndianRupee} tone="brand" label="Total collected" value={formatINR(r.revenuePaise)} />
        <StatCard icon={Receipt} label="Payments" value={r.paidCount} />
        <StatCard icon={Crown} label="Active Pro hospitals" value={r.activeSubscriptions} tone="good" />
      </div>
      <Card className="mt-8">
        <CardTitle>Recent payments</CardTitle>
        {r.recent.length === 0 ? <p className="text-sm text-ink-500">No payments yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-ink-500"><tr><th className="pb-3">Hospital</th><th className="pb-3">Plan</th><th className="pb-3">Date</th><th className="pb-3 text-right">Amount</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {r.recent.map((p) => <tr key={p.id}><td className="py-3"><span className="font-bold text-ink-900">{p.hospital}</span>{p.city && <span className="text-ink-500"> · {p.city}</span>}</td><td className="py-3">{p.interval === 'MONTHLY' ? 'Monthly' : 'Yearly'}</td><td className="py-3">{formatDate(p.paidAt)}</td><td className="py-3 text-right font-bold">{formatINR(p.amount)}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
