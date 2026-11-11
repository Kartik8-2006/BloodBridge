import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, ErrorNote, PageHeader, PageLoader } from '../components/ui/Misc';
import { api, qs } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { NotificationItem } from '../lib/types';

interface Page {
  items: NotificationItem[];
  nextCursor: string | null;
  unread: number;
}

export default function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.get<Page>(`/notifications${qs({ limit: 20, cursor: pageParam })}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const refresh = () => Promise.all(['notifications', 'me', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const markAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });
  const markOne = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: refresh });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `You have ${unread} unread ${unread === 1 ? 'update' : 'updates'}.` : 'You are all caught up.'}
        right={unread > 0 ? <Button variant="outline" icon={<CheckCheck className="size-4" />} loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button> : undefined}
      />
      {list.isLoading && <PageLoader />}
      {list.isError && <ErrorNote>{list.error instanceof Error ? list.error.message : 'Could not load notifications.'}</ErrorNote>}
      {list.data && items.length === 0 && <EmptyState icon={<Bell className="size-6" />} title="No notifications yet" body="Verification decisions and account updates will appear here." />}
      {items.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-ink-100">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (!n.readAt) markOne.mutate(n.id);
                    if (n.data?.requestId) navigate(`/app/requests/${n.data.requestId}`);
                    else if (typeof n.data?.link === 'string' && /^\/app\/[a-z\-/]*$/.test(n.data.link)) navigate(n.data.link);
                    else if (n.data?.donationId) navigate(`/app/certificates/${n.data.donationId}`);
                  }}
                  className={`flex w-full cursor-pointer items-start gap-4 px-6 py-5 text-left transition hover:bg-ink-50 ${n.readAt ? '' : 'bg-brand-50/40'}`}
                >
                  <span className={`mt-2 size-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-ink-200' : 'bg-brand-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-ink-900">{n.title}</span>
                    <span className="mt-0.5 block text-ink-600">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-400">{timeAgo(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {list.hasNextPage && (
        <div className="mt-6 text-center">
          <Button variant="outline" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>Load older</Button>
        </div>
      )}
    </div>
  );
}
