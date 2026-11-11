import { useQuery } from '@tanstack/react-query';
import { Activity, BarChart3, Droplets, RefreshCw, Sparkles, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMeContext } from '../../App';
import { BarsCard, CHART } from '../../components/charts/BarsCard';
import { Button } from '../../components/ui/Button';
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { RiskBadge, StockBadge } from '../../components/ui/Stock';
import { StatCard } from '../../components/ui/StatCard';
import { UpgradePrompt, isPlanError } from '../../components/ui/UpgradePrompt';
import { api } from '../../lib/api';
import { bloodLabel } from '../../lib/blood';
import type { ForecastResponse, HospitalAnalytics } from '../../lib/types3';

const shortWeek = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' });

function Forecast() {
  const f = useQuery({ queryKey: ['forecast'], queryFn: () => api.get<ForecastResponse>('/ai/forecast'), staleTime: 5 * 60_000 });
  return (
    <Card className="mt-8">
      <CardTitle action={<Button size="sm" variant="outline" icon={<RefreshCw className="size-4" />} loading={f.isFetching} onClick={() => f.refetch()}>Refresh</Button>}>Next 7 days: stock outlook</CardTitle>
      {f.isLoading && <PageLoader />}
      {f.isError && (isPlanError(f.error) ? <UpgradePrompt compact title="Stock forecast is a Pro feature" /> : <ErrorNote>{f.error instanceof Error ? f.error.message : 'Could not build the forecast.'}</ErrorNote>)}
      {f.data && (
        <>
          {f.data.narrative ? (
            <div className="mb-6 flex gap-3 rounded-2xl bg-plasma-100 p-4 text-sm leading-relaxed text-ink-800">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-plasma-700" />
              <p>{f.data.narrative}</p>
            </div>
          ) : (
            <p className="mb-6 text-sm text-ink-500">{f.data.aiAvailable ? 'The written summary is unavailable right now. The numbers below are still current.' : 'The AI summary is switched off for this deployment. The numbers below are calculated from your own requests and stock.'}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                <tr><th className="pb-3">Group</th><th className="pb-3">In stock</th><th className="pb-3">Expected / week</th><th className="pb-3">Days of cover</th><th className="pb-3">Donors nearby</th><th className="pb-3">Risk</th></tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {f.data.groups.map((g) => (
                  <tr key={g.bloodGroup}>
                    <td className="py-3 text-base font-extrabold text-ink-900">{bloodLabel(g.bloodGroup)}</td>
                    <td className="py-3"><span className="mr-2 font-bold">{g.stock}</span><StockBadge status={g.stockStatus} /></td>
                    <td className="py-3 font-semibold text-ink-700">{g.expectedWeeklyDemand}</td>
                    <td className="py-3 text-ink-700">{g.daysOfCover === null ? 'No demand' : `${g.daysOfCover} d`}</td>
                    <td className="py-3 text-ink-700">{g.reachableDonors}</td>
                    <td className="py-3"><RiskBadge risk={g.risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-ink-500">Expected demand = BloodBridge requests plus units your desk issued over the last 8 weeks, weighted to recent weeks. Donors nearby counts registered, available donors within 25 km whose group can be given to that group.</p>
        </>
      )}
    </Card>
  );
}

export default function Analytics() {
  const me = useMeContext();
  const verified = me.hospital?.status === 'VERIFIED';
  const a = useQuery({ queryKey: ['analytics', 'hospital'], queryFn: () => api.get<HospitalAnalytics>('/analytics/hospital'), enabled: verified, retry: (n, e) => !isPlanError(e) && n < 2 });

  if (!verified) {
    return (
      <div>
        <PageHeader title="Analytics" />
        <EmptyState icon={<BarChart3 className="size-6" />} title="Available after verification" body="Demand, fulfilment and stock forecasts appear here once your hospital is verified." action={<Link to="/app/my-hospital"><Button>Check verification status</Button></Link>} />
      </div>
    );
  }
  if (a.isLoading) return <PageLoader />;
  if (isPlanError(a.error)) return <div><PageHeader title="Analytics" subtitle="Demand, fulfilment and stock forecasts for your hospital." /><UpgradePrompt title="Analytics is a Pro feature" body="See fulfilment rate, demand by blood group, donations by month and a 7 day stock forecast." /></div>;
  if (a.isError || !a.data) return <ErrorNote>{a.error instanceof Error ? a.error.message : 'Could not load analytics.'}</ErrorNote>;
  const { summary: s } = a.data;

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Real numbers from your requests, donations and stock ledger." />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Activity} tone="brand" label="Fulfilment rate" value={s.fulfilmentRate === null ? '—' : `${s.fulfilmentRate}%`} hint={`${s.requests} request${s.requests === 1 ? "" : "s"} in 8 weeks`} />
        <StatCard icon={Timer} label="Avg time to fulfil" value={s.avgHoursToFulfil === null ? '—' : `${s.avgHoursToFulfil} h`} hint="From request to last donation" />
        <StatCard icon={Droplets} label="Units in / out (30 d)" value={`${s.unitsReceived30d} / ${s.unitsIssued30d}`} hint="Received and issued" />
        <StatCard icon={BarChart3} label="Camps held" value={s.campsHeld} hint={`${s.campDonors} donors attended`} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <BarsCard title="Requests per week" subtitle="Last 8 weeks" data={a.data.weekly.map((w) => ({ label: shortWeek(w.week), requests: w.requests, fulfilled: w.fulfilled }))} xKey="label" series={[{ key: 'requests', label: 'Requests', color: CHART.brand }, { key: 'fulfilled', label: 'Fulfilled', color: CHART.plasma }]} emptyText="No requests in the last 8 weeks." />
        <BarsCard title="Units requested by group" subtitle="Last 8 weeks" data={a.data.demandByGroup.map((d) => ({ label: bloodLabel(d.bloodGroup), units: d.unitsRequested }))} xKey="label" series={[{ key: 'units', label: 'Units', color: CHART.ink }]} emptyText="No demand recorded yet." />
      </div>
      <div className="mt-6">
        <BarsCard title="Donations received" subtitle="Last 6 months, confirmed at your desk or at camps" data={a.data.donationsByMonth.map((d) => ({ label: monthLabel(d.month), donations: d.donations }))} xKey="label" series={[{ key: 'donations', label: 'Donations', color: CHART.brand }]} emptyText="No donations confirmed yet." />
      </div>
      <Forecast />
    </div>
  );
}
