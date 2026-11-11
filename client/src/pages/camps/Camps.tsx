import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import { Badge, Card, EmptyState, ErrorNote, PageLoader } from '../../components/ui/Misc';
import { useMe } from '../../hooks/useMe';
import { api, qs } from '../../lib/api';
import type { Camp, CampReg } from '../../lib/types3';

export const campWhen = (c: Camp) => {
  const s = new Date(c.startsAt);
  const e = new Date(c.endsAt);
  const day = s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${t(s)} – ${t(e)}`;
};

function CampCard({ camp, reg, canRegister, signedIn }: { camp: Camp; reg?: CampReg; canRegister: boolean; signedIn: boolean }) {
  const qc = useQueryClient();
  const refresh = () => Promise.all(['camps', 'my-camps'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const join = useMutation({ mutationFn: () => api.post(`/camps/${camp.id}/register`), onSuccess: refresh });
  const leave = useMutation({ mutationFn: () => api.delete(`/camps/${camp.id}/register`), onSuccess: refresh });
  const registered = reg?.status === 'REGISTERED';
  const err = (join.error ?? leave.error) as Error | null;

  return (
    <article className="flex flex-col rounded-[1.75rem] border border-ink-100 bg-white p-6 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-extrabold text-ink-900">{camp.title}</h3>
        {camp.spotsLeft === 0 ? <Badge tone="brand">Full</Badge> : <Badge tone="good">{camp.spotsLeft} spots left</Badge>}
      </div>
      <p className="mt-1 text-sm font-semibold text-plasma-700">{camp.hospital.name}</p>
      {camp.description && <p className="mt-3 text-sm text-ink-600">{camp.description}</p>}
      <ul className="mt-4 space-y-2 text-sm text-ink-700">
        <li className="flex gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-brand-600" /> {campWhen(camp)}</li>
        <li className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-brand-600" /> {camp.venue}, {camp.city}</li>
        <li className="flex gap-2"><Users className="mt-0.5 size-4 shrink-0 text-brand-600" /> {camp.registered} of {camp.capacity} registered</li>
      </ul>
      {err && <div className="mt-4"><ErrorNote>{err.message}</ErrorNote></div>}
      <div className="mt-auto pt-5">
        {!signedIn ? (
          <Link to="/sign-up"><Button className="w-full">Sign up to register</Button></Link>
        ) : !canRegister ? (
          <p className="text-xs text-ink-500">Only donor accounts can register for camps.</p>
        ) : registered ? (
          <Button variant="outline" className="w-full" loading={leave.isPending} onClick={() => leave.mutate()}>You are registered. Cancel</Button>
        ) : (
          <Button className="w-full" disabled={camp.spotsLeft === 0} loading={join.isPending} onClick={() => join.mutate()}>Register to donate</Button>
        )}
      </div>
    </article>
  );
}

/** Upcoming donation camps from verified hospitals. Used on the public site and inside the donor app. */
export default function Camps() {
  const { isSignedIn } = useAuth();
  const me = useMe();
  const isDonor = me.data?.user.role === 'DONOR';
  const [city, setCity] = useState('');
  const [applied, setApplied] = useState('');

  const camps = useQuery({ queryKey: ['camps', applied], queryFn: () => api.get<{ camps: Camp[] }>(`/camps${qs({ city: applied || undefined })}`), refetchInterval: 60_000 });
  const mine = useQuery({ queryKey: ['my-camps'], queryFn: () => api.get<{ registrations: CampReg[] }>('/camps/mine'), enabled: !!isSignedIn && isDonor });
  const regFor = (id: string) => mine.data?.registrations.find((r) => r.camp.id === id);
  const upcomingMine = (mine.data?.registrations ?? []).filter((r) => r.status === 'REGISTERED' && r.camp.status === 'SCHEDULED');

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink-800 sm:text-4xl">Blood donation camps</h1>
          <p className="mt-2 max-w-2xl text-ink-500">Upcoming camps run by verified hospitals and blood banks. Reserve a slot and we check your eligibility for the camp day.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setApplied(city.trim()); }} className="flex w-full gap-2 sm:w-auto">
          <Input aria-label="Filter by city" icon={<Search className="size-4" />} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Filter by city" className="sm:w-60" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </div>

      {upcomingMine.length > 0 && (
        <Card className="mb-8 border-emerald-200 bg-emerald-50/40">
          <h2 className="font-extrabold text-ink-900">Your upcoming camps</h2>
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            {upcomingMine.map((r) => <li key={r.id}><span className="font-bold">{r.camp.title}</span> · {campWhen(r.camp)} · {r.camp.venue}</li>)}
          </ul>
        </Card>
      )}

      {camps.isLoading && <PageLoader />}
      {camps.isError && <ErrorNote>{camps.error instanceof Error ? camps.error.message : 'Could not load camps.'}</ErrorNote>}
      {camps.data && camps.data.camps.length === 0 && (
        <EmptyState icon={<CalendarDays className="size-6" />} title={applied ? `No camps in ${applied} right now` : 'No upcoming camps yet'} body="Verified hospitals publish camps here. Check back soon, or become a donor to get alerted the moment one is scheduled near you." action={!isSignedIn ? <Link to="/sign-up"><Button>Become a donor</Button></Link> : undefined} />
      )}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {camps.data?.camps.map((c) => <CampCard key={c.id} camp={c} reg={regFor(c.id)} canRegister={isDonor} signedIn={!!isSignedIn} />)}
      </div>
    </div>
  );
}
