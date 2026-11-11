import { useInfiniteQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Form';
import { Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../../components/ui/Misc';
import { useDebounce } from '../../hooks/useDebounce';
import { api, qs } from '../../lib/api';
import type { AuditEntry } from '../../lib/types4';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const metaText = (m: AuditEntry['meta']) => (m && Object.keys(m).length ? Object.entries(m).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ') : '');

export default function AuditLog() {
  const [text, setText] = useState('');
  const action = useDebounce(text.trim(), 400);
  const q = useInfiniteQuery({
    queryKey: ['audit', action],
    queryFn: ({ pageParam }) => api.get<{ entries: AuditEntry[]; nextCursor: string | null }>(`/admin/audit${qs({ action, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who did what, newest first. Sensitive actions are recorded automatically." />
      <div className="mb-6 max-w-md"><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by action, for example donation or inventory" aria-label="Filter by action" /></div>
      {q.isLoading && <PageLoader />}
      {q.isError && <ErrorNote>{q.error instanceof Error ? q.error.message : 'Could not load the log.'}</ErrorNote>}
      {q.data && rows.length === 0 && <EmptyState icon={<ScrollText className="size-6" />} title="No entries" body="Nothing matches this filter yet." />}
      {rows.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-ink-100">
            {rows.map((a) => (
              <li key={a.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm font-bold text-brand-700">{a.action}</span>
                  <span className="text-xs text-ink-500">{a.entity} {a.entityId.slice(0, 10)}</span>
                  <span className="ml-auto text-xs text-ink-500">{when(a.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{a.actor ? `${a.actor.name} (${a.actor.email})` : 'System'}</p>
                {metaText(a.meta) && <p className="mt-1 break-words text-xs text-ink-500">{metaText(a.meta)}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {q.hasNextPage && <div className="mt-6 text-center"><Button variant="outline" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button></div>}
    </div>
  );
}
