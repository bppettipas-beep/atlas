import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Checks, Trash, Tray } from '@/components/icons';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { useRealtime } from '@/providers/RealtimeProvider';
import type { NotificationDto } from '@shared/types';

/** Where clicking a notification should take you. */
function targetPath(notification: NotificationDto): string | null {
  if (notification.taskId) return `/app/work?task=${notification.taskId}`;
  if (notification.entityType === 'task' && notification.entityId) {
    return `/app/work?task=${notification.entityId}`;
  }
  if (notification.entityType === 'document' && notification.entityId) {
    return `/app/knowledge/${notification.entityId}`;
  }
  if (notification.entityType === 'person' && notification.entityId) {
    return `/app/people?person=${notification.entityId}`;
  }
  if (notification.entityType === 'team') return '/app/organization';
  if (notification.entityType === 'announcement') return '/app/home';
  return null;
}

export function NotificationCenter() {
  const { notifications, unread, setNotifications, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [clearing, setClearing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Filtered here rather than refetched with unreadOnly: the socket keeps this
  // list current, and a round trip to hide rows already on screen would make
  // the tab feel slower than the thing it is filtering.
  const visible = filter === 'unread' ? notifications.filter((item) => !item.readAt) : notifications;
  const readCount = notifications.length - notifications.filter((item) => !item.readAt).length;

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api
      .get<{ items: NotificationDto[]; unread: number }>('/notifications', { limit: 30 })
      .then((result) => setNotifications(result.items, result.unread))
      .catch(() => {
        /* the bell keeps working with whatever arrived over the socket */
      })
      .finally(() => setLoading(false));
  }, [open, setNotifications]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleRead = async (notification: NotificationDto) => {
    if (!notification.readAt) {
      await api.post('/notifications/read', { ids: [notification.id] }).catch(() => undefined);
    }
    const path = targetPath(notification);
    setOpen(false);
    if (path) navigate(path);
  };

  const handleMarkAll = async () => {
    markAllRead();
    await api.post('/notifications/read', {}).catch(() => undefined);
  };

  const handleClearRead = async () => {
    setClearing(true);
    try {
      await api.delete('/notifications');
      const result = await api.get<{ items: NotificationDto[]; unread: number }>('/notifications', {
        limit: 30,
      });
      setNotifications(result.items, result.unread);
    } catch {
      /* nothing was deleted, so the list on screen is still the truth */
    } finally {
      setClearing(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-paper-deep hover:text-ink"
      >
        <Bell aria-hidden className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-none bg-mark px-1 text-[9px] font-semibold tabular-nums text-white ring-2 ring-sheet"
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-sm border border-rule bg-sheet shadow-panel"
          >
            <header className="border-b border-rule px-3.5 py-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-ink">Notifications</h2>
                {unread > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAll}
                    icon={<Checks className="h-3.5 w-3.5" />}
                  >
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="mt-2 flex gap-1" role="tablist" aria-label="Filter notifications">
                {(['all', 'unread'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={filter === value}
                    onClick={() => setFilter(value)}
                    className={cn(
                      'rounded-sm px-2 py-1 text-edge transition-colors',
                      filter === value
                        ? 'bg-ink text-sheet'
                        : 'text-ink-3 hover:bg-paper-deep hover:text-ink',
                    )}
                  >
                    {value === 'all' ? 'All' : `Unread${unread > 0 ? ` · ${unread}` : ''}`}
                  </button>
                ))}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length === 0 ? (
                <EmptyState
                  className="m-3 border-0 bg-transparent py-8"
                  icon={<Tray className="h-5 w-5" />}
                  title={
                    loading
                      ? 'Loading…'
                      : filter === 'unread'
                        ? 'Nothing unread'
                        : 'You are all caught up'
                  }
                  description={
                    loading
                      ? undefined
                      : filter === 'unread'
                        ? 'Everything here has been read.'
                        : 'New assignments and mentions land here.'
                  }
                />
              ) : (
                <ul className="divide-y divide-rule">
                  {visible.map((notification) => (
                    <li key={notification.id}>
                      <button
                        type="button"
                        onClick={() => void handleRead(notification)}
                        className={cn(
                          'flex w-full gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-paper',
                          !notification.readAt && 'bg-mark/[0.04]',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-none',
                            notification.readAt ? 'bg-transparent' : 'bg-mark',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium leading-snug text-ink">
                            {notification.title}
                          </span>
                          {notification.body && (
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-3">
                              {notification.body}
                            </span>
                          )}
                          <span className="mt-1 block text-edge text-ink-3">
                            {relativeTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {readCount > 0 && (
              <footer className="border-t border-rule px-3.5 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleClearRead()}
                  disabled={clearing}
                  icon={<Trash className="h-3.5 w-3.5" />}
                >
                  {clearing ? 'Clearing…' : `Clear ${readCount} read`}
                </Button>
              </footer>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
