"use client";

import Link from 'next/link';
import { useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth/client';
import { getApiErrorMessage } from '@/lib/api/error-message';
import { useListMyNotifications, markMyNotificationRead } from '@/lib/api/endpoints/notifications/notifications';
import { paginationRange } from '@/lib/pagination/range';

export default function NotificationsPage() {
  const { data: session, isPending } = useSession();
  if (isPending || !session) return null;
  // Remount the page state and scope every private query to the current owner.
  return <Inbox key={session.user.id} userId={session.user.id} />;
}

function Inbox({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const ownerKey = ['/api/notifications', userId];
  const query = useListMyNotifications({ page, pageSize }, { query: {
    queryKey: [...ownerKey, { page, pageSize }],
    retry: false, placeholderData: keepPreviousData,
    refetchOnWindowFocus: 'always', refetchInterval: 30_000,
  } });
  const read = useMutation({
    mutationFn: (id: string) => markMyNotificationRead(id),
    onSuccess: async item => {
      await queryClient.invalidateQueries({ queryKey: ownerKey });
      rowRefs.current.get(item.id)?.focus();
    },
  });
  const data = query.data;
  const loading = query.isPending || query.isPlaceholderData;
  const { start, end, hasPrev, hasNext } = paginationRange(page, pageSize, data?.total ?? 0);

  return (
    <main className="wc-container py-6 pb-28" style={{ background: 'var(--muted)' }}>
      <h1 className="text-2xl font-extrabold mb-4">Notifications</h1>
      {query.isError ? (
        <div role="alert" className="wc-card wc-card-pad">
          <p>{getApiErrorMessage(query.error)}</p>
          <Button className="mt-3" onClick={() => void query.refetch()} disabled={query.isFetching}>Retry</Button>
        </div>
      ) : loading ? <p role="status">Loading notifications…</p> : (
        <>
          <p role="status" className="text-sm wc-muted mb-3">{data?.unreadCount ?? 0} unread</p>
          {read.isError && <p role="alert" className="text-sm text-destructive mb-3">{getApiErrorMessage(read.error)}</p>}
          <div className="wc-stack">
            {data?.items.map(item => (
              <article key={item.id} tabIndex={-1} ref={node => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id); }} data-testid={`notification-${item.id}`} className="wc-card wc-card-pad flex items-start gap-3">
                {item.isRead ? <CheckCheck className="w-5 h-5 wc-muted flex-none" aria-hidden="true" /> : <Bell className="w-5 h-5 text-maroon flex-none" aria-hidden="true" />}
                <div className="flex-1 min-w-0 [overflow-wrap:anywhere]">
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="text-sm whitespace-pre-line mt-1">{item.body}</p>
                  <time dateTime={item.createdAt} className="text-sm wc-muted block mt-1">{new Date(item.createdAt).toLocaleString()}</time>
                  {item.type === 'APPEAL_DECISION' && <Link href="/profile/standing" className="text-sm font-semibold text-maroon block mt-2">View current standing</Link>}
                  {item.type === 'ANNOUNCEMENT_PUBLISHED' && item.relatedId && <Link href={`/announcements/${encodeURIComponent(item.relatedId)}`} className="text-sm font-semibold text-maroon block mt-2">Read announcement</Link>}
                  {item.isRead ? <span className="text-sm wc-muted block mt-2">Read</span> : <Button variant="outline" size="sm" className="mt-2" disabled={read.isPending} onClick={() => read.mutate(item.id)}>Mark as read</Button>}
                </div>
              </article>
            ))}
            {data?.total === 0 && <p className="wc-card wc-card-pad">No notifications yet.</p>}
            {data && data.total > 0 && data.items.length === 0 && <p className="wc-card wc-card-pad">No notifications on this page. Go back to the previous page.</p>}
          </div>
        </>
      )}
      {data && data.total > 0 && <nav aria-label="Notification pages" className="wc-pagination mt-4">
        <span className="tnum">Showing {start}-{end} of {data.total}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!hasPrev || query.isFetching} onClick={() => setPage(current => current - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={!hasNext || query.isFetching || query.isError} onClick={() => setPage(current => current + 1)}>Next</Button>
        </div>
      </nav>}
    </main>
  );
}
