import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useMeContext } from '../../App';
import { RequestCard } from '../../components/request/RequestCard';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { api } from '../../lib/api';
import type { RequestSummary } from '../../lib/types';

const TABS = [['active', 'Active'], ['closed', 'Closed'], ['all', 'All']] as const;

export default function Requests() {
  const me = useMeContext();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('active');
  const isHospital = me.user.role === 'HOSPITAL';
  const isAdmin = me.user.role === 'ADMIN';
  const canCreate = !isAdmin && (!isHospital || me.hospital?.status === 'VERIFIED');

  const list = useQuery({
    queryKey: ['requests', tab],
    queryFn: () => api.get<{ items: RequestSummary[] }>(`/requests/mine${tab === 'all' ? '' : `?status=${tab}`}`),
    refetchInterval: 30_000,
  });
  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={isHospital ? 'Donor calls & requests' : isAdmin ? 'All blood requests' : 'My requests'}
        subtitle={isHospital ? 'Requests from families and calls you raised yourself. Open one to verify a donor at your desk.' : isAdmin ? 'The latest 50 requests across the network.' : 'Track every request and see who is on the way.'}
        right={canCreate ? <Link to="/app/requests/new"><Button icon={<Plus className="size-4" />}>{isHospital ? 'Call donors' : 'New request'}</Button></Link> : undefined}
      />
      {isHospital && me.hospital?.status !== 'VERIFIED' && (
        <div className="mb-6 rounded-2xl border border-plasma-400/40 bg-plasma-100 p-4 text-sm font-medium text-ink-800">
          Requests reach you after our team verifies your hospital. <Link to="/app/my-hospital" className="font-bold text-brand-700">Check verification status</Link>
        </div>
      )}
      <div className="mb-6 inline-flex rounded-xl bg-ink-100 p-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={clsx('cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition', tab === k ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')}>
            {label}
          </button>
        ))}
      </div>
      {list.isLoading && <PageLoader />}
      {list.isError && <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load requests.'}</ErrorNote>}
      {list.data && items.length === 0 && (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title={tab === 'active' ? 'No active requests' : 'Nothing here yet'}
          body={canCreate ? (isHospital ? 'Low on a blood group, or a patient walked in? Call matching donors nearby and verify each one at your desk with their code.' : 'When someone needs blood, create a request and we alert matching donors nearby.') : undefined}
          action={canCreate ? <Link to="/app/requests/new"><Button>{isHospital ? 'Call donors' : 'Create a request'}</Button></Link> : undefined}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((r) => <RequestCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}
