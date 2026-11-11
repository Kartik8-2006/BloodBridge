import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users as UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { Badge, Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { useDebounce } from '../../hooks/useDebounce';
import { api, qs } from '../../lib/api';
import { bloodLabel } from '../../lib/blood';
import { ROLE_LABEL, formatDate } from '../../lib/format';
import type { AdminUser, Paged } from '../../lib/types';

export default function Users() {
  const qc = useQueryClient();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const q = useDebounce(text.trim(), 400);

  const list = useQuery({
    queryKey: ['admin-users', role, status, q, page],
    queryFn: () => api.get<Paged<AdminUser>>(`/admin/users${qs({ role, status, q, page, pageSize: 20 })}`),
    placeholderData: (prev) => prev,
  });
  const change = useMutation({
    mutationFn: (v: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) => api.post(`/admin/users/${v.id}/status`, { status: v.status, reason }),
    onSuccess: async () => {
      await Promise.all(['admin-users', 'admin-overview'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      setTarget(null);
      setReason('');
    },
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const next = target?.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';

  return (
    <div>
      <PageHeader title="Users" subtitle="Everyone on the platform. Suspend an account to stop it from signing in to BloodBridge." />
      <div className="mb-6 grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Input value={text} onChange={(e) => { setText(e.target.value); setPage(1); }} placeholder="Search name or email" />
        <Select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {(['DONOR', 'REQUESTER', 'HOSPITAL', 'ADMIN'] as const).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
      </div>

      {list.isLoading && <PageLoader />}
      {list.isError && <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load.'}</ErrorNote>}
      {list.data && list.data.items.length === 0 && <EmptyState icon={<UsersIcon className="size-6" />} title="No users match" body="Try clearing a filter." />}

      {list.data && list.data.items.length > 0 && (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-ink-100 text-ink-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Name</th>
                <th className="px-4 py-4 font-semibold">Role</th>
                <th className="px-4 py-4 font-semibold">Details</th>
                <th className="px-4 py-4 font-semibold">Joined</th>
                <th className="px-4 py-4 font-semibold">Status</th>
                <th className="px-6 py-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-4"><p className="font-bold text-ink-900">{u.name}</p><p className="text-ink-500">{u.email}</p></td>
                  <td className="px-4 py-4">{u.role ? ROLE_LABEL[u.role] : <span className="text-ink-400">No role yet</span>}</td>
                  <td className="px-4 py-4 text-ink-600">{u.bloodGroup ? `${bloodLabel(u.bloodGroup)}${u.city ? ` · ${u.city}` : ''}` : u.hospitalName ?? u.city ?? '—'}</td>
                  <td className="px-4 py-4 text-ink-600">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-4">{u.status === 'ACTIVE' ? <Badge tone="good">Active</Badge> : <Badge tone="brand">Suspended</Badge>}</td>
                  <td className="px-6 py-4 text-right">
                    {u.role !== 'ADMIN' && <Button size="sm" variant="outline" onClick={() => setTarget(u)}>{u.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm font-semibold">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-ink-600">Page {page} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Modal open={!!target} onClose={() => { setTarget(null); setReason(''); }} title={`${next === 'SUSPENDED' ? 'Suspend' : 'Reinstate'} ${target?.name ?? ''}`}>
        <div className="space-y-5">
          <Field label="Reason" hint="Saved to the audit log">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason" />
          </Field>
          {change.isError && <ErrorNote>{change.error instanceof Error ? change.error.message : 'Failed.'}</ErrorNote>}
          <Button loading={change.isPending} variant={next === 'SUSPENDED' ? 'danger' : 'primary'} disabled={reason.trim().length < 5} onClick={() => target && change.mutate({ id: target.id, status: next })}>
            Confirm {next === 'SUSPENDED' ? 'suspension' : 'reinstatement'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
