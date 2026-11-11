import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Award, Building2, ClipboardList, CheckCircle2, Clock, Droplets, HeartPulse, Hospital as HospitalIcon, MapPinned, ShieldAlert, ShieldCheck, Siren, Stethoscope, UserRoundCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarsCard, CHART } from '../components/charts/BarsCard';
import { HospitalCard } from '../components/hospital/HospitalCard';
import { Button } from '../components/ui/Button';
import { Toggle } from '../components/ui/Form';
import { Card, CardTitle, EmptyState, ErrorNote, PageHeader, PageLoader } from '../components/ui/Misc';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useMeContext } from '../App';
import { ACTION_LABEL, formatDate, greeting, monthLabel, number, timeAgo } from '../lib/format';
import { BLOOD_GROUPS, bloodLabel } from '../lib/blood';
import { api } from '../lib/api';
import type { AdminOverview, DashboardData, Me, Network, NotificationItem } from '../lib/types';

const TITLES = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.']);
const firstName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  const first = parts.find((p) => !TITLES.has(p.toLowerCase()));
  return first ?? parts[0] ?? name;
};

function DarkCta({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between rounded-[1.75rem] bg-ink-800 p-7 text-white shadow-card">
      <div>
        <h2 className="text-2xl font-extrabold leading-tight">{title}</h2>
        <p className="mt-3 text-ink-300">{body}</p>
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

function RecentCard({ items }: { items: NotificationItem[] }) {
  return (
    <Card className="p-6 sm:p-7">
      <CardTitle action={<Link to="/app/notifications" className="text-sm font-bold text-brand-700 hover:text-brand-800">View all</Link>}>Recent activity</CardTitle>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-500">Nothing yet. Updates about your account will show up here.</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-ink-200' : 'bg-brand-600'}`} />
              <div className="min-w-0">
                <p className="font-bold text-ink-900">{n.title}</p>
                <p className="line-clamp-2 text-sm text-ink-500">{n.body}</p>
                <p className="mt-1 text-xs font-semibold text-ink-400">{timeAgo(n.createdAt)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NetworkChart({ network, subtitle }: { network: Network; subtitle: string }) {
  return (
    <BarsCard
      title="Hospitals and blood banks near you"
      subtitle={subtitle}
      data={network.bands}
      xKey="label"
      series={[
        { key: 'verified', label: 'Verified on BloodBridge', color: CHART.brand },
        { key: 'listed', label: 'Listed, not yet joined', color: CHART.ink },
      ]}
      stacked
      emptyText="No facilities mapped within 25 km yet. Search your area in Find Hospitals to import them."
    />
  );
}

function NearestList({ network, title }: { network: Network; title: string }) {
  if (network.nearest.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-xl font-bold text-ink-900">{title}</h2>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {network.nearest.slice(0, 3).map((h) => (
          <HospitalCard key={h.id} h={h} to={`/app/hospitals/${h.id}`} />
        ))}
      </div>
    </section>
  );
}

function DonorDashboard({ data, me }: { data: Extract<DashboardData, { role: 'DONOR' }>; me: Me }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (available: boolean) => api.patch('/donors/me/availability', { available }),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['dashboard'] }), qc.invalidateQueries({ queryKey: ['me'] })]),
  });
  const { eligibility, network, donor } = data;
  const eligibilityHint = eligibility.eligible
    ? 'You can donate now'
    : eligibility.daysUntilEligible
      ? `Eligible again on ${formatDate(eligibility.nextEligibleOn)}`
      : eligibility.reasons[0];

  return (
    <>
      <PageHeader
        title="Donor Dashboard"
        subtitle={`${greeting()}, ${firstName(me.user.name)}. ${eligibility.eligible ? 'You are ready to donate when someone needs you.' : 'Here is where you stand right now.'}`}
        right={
          <div className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white px-5 py-3 shadow-card">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-700 text-lg font-extrabold text-white">{bloodLabel(donor.bloodGroup)}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-ink-500">Your blood group</p>
              <p className="font-bold text-ink-900">{donor.city}</p>
            </div>
          </div>
        }
      />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={eligibility.eligible ? CheckCircle2 : Clock} label="Eligibility" value={eligibility.eligible ? 'Eligible' : 'Not yet'} hint={eligibilityHint} tone={eligibility.eligible ? 'good' : 'warn'} />
        <StatCard icon={ShieldCheck} label="Verified nearby" value={network.totals.verified} hint="Within 25 km of you" tone="brand" />
        <StatCard icon={Building2} label="Facilities mapped" value={network.totals.verified + network.totals.listed} hint={`${network.totals.bloodBanks} blood banks`} />
        <DarkCta title="Be ready when it counts" body={donor.available ? 'Hospitals can reach you for matching requests.' : 'You are paused. Nobody will contact you.'}>
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-white/10 px-5 py-4">
            <span className="font-bold">{donor.available ? 'Available to donate' : 'Not available'}</span>
            <Toggle checked={donor.available} onChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} label="Available to donate" />
          </label>
        </DarkCta>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Link to="/app/inbox" className="block"><StatCard icon={HeartPulse} label="Requests for you" value={data.activity.invitations} hint={data.activity.accepted ? `${data.activity.accepted} accepted, waiting at hospital` : data.activity.invitations ? 'Waiting for your reply' : 'Nothing pending'} tone={data.activity.invitations ? 'brand' : 'neutral'} /></Link>
        <Link to="/app/certificates" className="block"><StatCard icon={Droplets} label="Donations" value={data.activity.donations} hint="Confirmed by hospitals" /></Link>
        <StatCard icon={Award} label="Lives impacted" value={data.activity.livesImpacted} hint="Up to 3 patients per donation" tone="good" />
      </div>

      {!eligibility.eligible && eligibility.reasons.length > 0 && (
        <div className="mt-5 rounded-2xl border border-plasma-400/40 bg-plasma-100 p-5 text-sm text-ink-800">
          <p className="font-bold">Why you cannot donate right now</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {eligibility.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <Link to="/app/profile" className="mt-3 inline-block font-bold text-brand-700">Update my health details</Link>
        </div>
      )}

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <NetworkChart network={network} subtitle="Count by distance from your saved location" />
        <RecentCard items={data.recent} />
      </div>
      <NearestList network={network} title="Nearest hospitals and blood banks" />
    </>
  );
}

function RequesterDashboard({ data, me }: { data: Extract<DashboardData, { role: 'REQUESTER' }>; me: Me }) {
  const { network } = data;
  return (
    <>
      <PageHeader title="Requester Dashboard" subtitle={`${greeting()}, ${firstName(me.user.name)}. Here is what is around ${data.city ?? 'you'}.`} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Verified nearby" value={network.totals.verified} hint="Within 25 km" tone="brand" />
        <Link to="/app/requests" className="block"><StatCard icon={ClipboardList} label="Active requests" value={data.requests.active} hint={data.requests.active ? 'Donors are being alerted' : 'None open right now'} tone={data.requests.active ? 'brand' : 'neutral'} /></Link>
        <StatCard icon={Siren} label="Fulfilled" value={data.requests.fulfilled} hint="Requests completed" tone="good" />
        <DarkCta title="Need blood for a patient?" body="We alert compatible, eligible donors near a verified hospital within minutes.">
          <div className="space-y-3">
            <Link to="/app/requests/new"><Button size="lg" className="w-full" icon={<Droplets className="size-5" />}>Request blood</Button></Link>
            <Link to="/app/hospitals"><Button size="lg" variant="outline" className="w-full" icon={<MapPinned className="size-5" />}>Find hospitals</Button></Link>
          </div>
        </DarkCta>
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <NetworkChart network={network} subtitle="Count by distance from your saved location" />
        <RecentCard items={data.recent} />
      </div>
      <NearestList network={network} title="Closest to the patient" />
    </>
  );
}

function HospitalDashboard({ data, me }: { data: Extract<DashboardData, { role: 'HOSPITAL' }>; me: Me }) {
  const h = data.hospital;
  if (!h) {
    return (
      <>
        <PageHeader title="Hospital Dashboard" subtitle={`${greeting()}, ${firstName(me.user.name)}.`} />
        <EmptyState
          icon={<Stethoscope className="size-6" />}
          title="Link your hospital to get started"
          body="Find your facility in the directory and submit its license. Our team reviews it within two working days."
          action={<Link to="/app/my-hospital"><Button>Find my hospital</Button></Link>}
        />
        <div className="mt-8"><RecentCard items={data.recent} /></div>
      </>
    );
  }
  const verified = h.status === 'VERIFIED';
  return (
    <>
      <PageHeader title="Hospital Dashboard" subtitle={h.name} right={<StatusBadge status={h.status} />} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ShieldCheck} label="Verification" value={verified ? 'Verified' : h.status === 'PENDING' ? 'In review' : 'Action needed'} hint={verified ? `Since ${formatDate(h.verifiedAt)}` : h.submittedAt ? `Submitted ${formatDate(h.submittedAt)}` : undefined} tone={verified ? 'good' : 'warn'} />
        {verified ? (
          <Link to="/app/requests" className="block"><StatCard icon={ClipboardList} label="Open requests" value={data.requests?.open ?? 0} hint={`${data.requests?.donatedThisMonth ?? 0} donations this month`} tone={data.requests?.open ? 'brand' : 'neutral'} /></Link>
        ) : (
          <StatCard icon={Users} label="Staff accounts" value={h.staffCount ?? 1} hint="People linked to this facility" />
        )}
        <StatCard icon={HeartPulse} label="Donors near you" value={verified ? number(data.donorsNearby ?? 0) : '—'} hint={verified ? 'Available within 25 km' : 'Unlocks after verification'} tone="brand" />
        <DarkCta title={verified ? 'Your facility is live' : 'Complete verification'} body={verified ? 'Donors and families can now see you as verified.' : 'Verified hospitals appear first in every search.'}>
          <Link to="/app/my-hospital">
            <Button size="lg" className="w-full" icon={<HospitalIcon className="size-5" />}>Open My Hospital</Button>
          </Link>
        </DarkCta>
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {verified && data.donorsByGroup ? (
          <BarsCard
            title="Available donors near you"
            subtitle="Registered donors within 25 km, by blood group. Individual identities stay private."
            data={BLOOD_GROUPS.map((g) => ({ group: bloodLabel(g), count: data.donorsByGroup?.find((d) => d.bloodGroup === g)?.count ?? 0 }))}
            xKey="group"
            series={[{ key: 'count', label: 'Donors', color: CHART.brand }]}
            emptyText="No donors have registered near you yet. Encourage your staff and patients’ families to join."
          />
        ) : (
          <Card className="p-6 sm:p-7">
            <CardTitle>Verification progress</CardTitle>
            <ol className="space-y-5">
              <Step done label="Submitted" text={h.submittedAt ? formatDate(h.submittedAt) : 'Waiting for your documents'} />
              <Step done={h.status !== 'PENDING'} active={h.status === 'PENDING'} label="Review by our team" text="Usually within two working days" />
              <Step done={verified} label="Decision" text={h.status === 'REJECTED' ? (h.reviewNote ?? 'Needs changes') : verified ? 'Approved' : 'Pending'} />
            </ol>
          </Card>
        )}
        <RecentCard items={data.recent} />
      </div>
    </>
  );
}

function Step({ done, active, label, text }: { done?: boolean; active?: boolean; label: string; text: string }) {
  return (
    <li className="flex items-start gap-4">
      <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-600 text-white' : active ? 'bg-plasma-400 text-ink-900' : 'bg-ink-100 text-ink-400'}`}>
        {done ? <CheckCircle2 className="size-5" /> : <Clock className="size-5" />}
      </span>
      <div>
        <p className="font-bold text-ink-900">{label}</p>
        <p className="text-sm text-ink-500">{text}</p>
      </div>
    </li>
  );
}

function AdminDashboard({ me }: { me: Me }) {
  const q = useQuery({ queryKey: ['admin-overview'], queryFn: () => api.get<AdminOverview>('/admin/overview') });
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorNote>{q.error instanceof Error ? q.error.message : 'Could not load the overview.'}</ErrorNote>;
  const o = q.data;
  return (
    <>
      <PageHeader title="Admin Dashboard" subtitle={`${greeting()}, ${firstName(me.user.name)}. ${o.hospitals.pending ? `${o.hospitals.pending} hospital${o.hospitals.pending === 1 ? ' is' : 's are'} waiting for review.` : 'No hospitals are waiting for review.'}`} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total users" value={number(o.users.total)} hint={`${o.users.donors} donors · ${o.users.requesters} requesters`} />
        <StatCard icon={UserRoundCheck} label="Donors available" value={number(o.users.donorsAvailable)} hint={`of ${o.users.donors} registered`} tone="brand" />
        <StatCard icon={Activity} label="Verified hospitals" value={number(o.hospitals.verified)} hint={`${number(o.osm.facilitiesSeen)} facilities seen in ${o.osm.areasSynced} ${o.osm.areasSynced === 1 ? 'area' : 'areas'}`} tone="good" />
        <DarkCta title={o.hospitals.pending ? `${o.hospitals.pending} to review` : 'Queue is clear'} body="Check each license before approving. Fake listings put patients at risk.">
          <Link to="/app/verifications"><Button size="lg" className="w-full">Review verifications</Button></Link>
        </DarkCta>
      </div>

      {o.fraudOpen > 0 && (
        <Link to="/app/fraud" className="mt-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm font-bold text-brand-800 hover:bg-brand-100">
          <ShieldAlert className="size-5 shrink-0" /> {o.fraudOpen} suspicious {o.fraudOpen === 1 ? 'activity needs' : 'activities need'} your review
        </Link>
      )}

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Link to="/app/requests" className="block"><StatCard icon={ClipboardList} label="Open requests" value={number(o.requests.open)} hint={`${number(o.requests.total)} requests in total`} tone={o.requests.open ? 'brand' : 'neutral'} /></Link>
        <StatCard icon={Siren} label="Fulfilled requests" value={number(o.requests.fulfilled)} tone="good" />
        <StatCard icon={Award} label="Donations confirmed" value={number(o.requests.donations)} hint="Verified at hospital desks" />
      </div>

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BarsCard
          title="New sign-ups"
          subtitle="Last six months, by role"
          data={o.signups.map((s) => ({ ...s, label: monthLabel(s.month) }))}
          xKey="label"
          series={[
            { key: 'DONOR', label: 'Donors', color: CHART.brand },
            { key: 'REQUESTER', label: 'Requesters', color: CHART.ink },
            { key: 'HOSPITAL', label: 'Hospital staff', color: CHART.plasma },
          ]}
          stacked
          emptyText="No sign-ups in the last six months."
        />
        <Card className="p-6 sm:p-7">
          <CardTitle action={<Link to="/app/verifications" className="text-sm font-bold text-brand-700 hover:text-brand-800">Open queue</Link>}>Waiting for review</CardTitle>
          {o.pendingQueue.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">Nothing is waiting. New submissions appear here.</p>
          ) : (
            <ul className="divide-y divide-ink-100">
              {o.pendingQueue.map((p) => (
                <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="font-bold text-ink-900">{p.name}</p>
                  <p className="text-sm text-ink-500">{[p.city, p.licenseNumber && `License ${p.licenseNumber}`].filter(Boolean).join(' · ')}</p>
                  {p.submittedAt && <p className="mt-0.5 text-xs font-semibold text-ink-400">Submitted {timeAgo(p.submittedAt)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-8 p-6 sm:p-7">
        <CardTitle>Recent admin activity</CardTitle>
        {o.recentActivity.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-500">Reviews and system actions are logged here.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {o.recentActivity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-ink-700"><span className="font-bold text-ink-900">{a.actor}</span> {ACTION_LABEL[a.action] ?? a.action}</p>
                <span className="shrink-0 text-xs font-semibold text-ink-400">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-sm text-ink-500">{o.users.notOnboarded} signed up but have not chosen a role yet.</p>
    </>
  );
}

export default function Dashboard() {
  const me = useMeContext();
  const isAdmin = me.user.role === 'ADMIN';
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard'), enabled: !isAdmin });

  if (isAdmin) return <AdminDashboard me={me} />;
  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) return <ErrorNote>{q.error instanceof Error ? q.error.message : 'Could not load your dashboard.'}</ErrorNote>;
  const d = q.data;
  if (d.role === 'DONOR') return <DonorDashboard data={d} me={me} />;
  if (d.role === 'REQUESTER') return <RequesterDashboard data={d} me={me} />;
  if (d.role === 'HOSPITAL') return <HospitalDashboard data={d} me={me} />;
  return null;
}
