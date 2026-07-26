import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from './AuthProvider';
import type { NotificationDto } from '@shared/types';

type Handler = (payload: Record<string, unknown>) => void;

interface RealtimeContextValue {
  connected: boolean;
  /** Subscribe to a server event. Returns an unsubscribe function. */
  on: (event: string, handler: Handler) => () => void;
  notifications: NotificationDto[];
  unread: number;
  setNotifications: (items: NotificationDto[], unread: number) => void;
  markAllRead: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * One Socket.IO connection for the whole app. Components subscribe with
 * `useRealtimeEvent(...)` instead of opening their own sockets.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(new Map<string, Set<Handler>>());
  const [connected, setConnected] = useState(false);
  const [notifications, setNotificationList] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setUnread(session?.unreadNotifications ?? 0);
  }, [session?.unreadNotifications]);

  useEffect(() => {
    if (!session) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 800,
      reconnectionDelayMax: 6000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    // Every server event is fanned out to the components that asked for it.
    socket.onAny((event: string, payload: Record<string, unknown> = {}) => {
      handlersRef.current.get(event)?.forEach((handler) => handler(payload));
    });

    socket.on('notification:new', (payload: { notification: NotificationDto }) => {
      if (!payload?.notification) return;
      setNotificationList((current) => [payload.notification, ...current].slice(0, 50));
      setUnread((count) => count + 1);
    });

    socket.on('notification:read', (payload: { unread?: number }) => {
      if (typeof payload?.unread === 'number') setUnread(payload.unread);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session?.membership.id, session]);

  const on = useCallback((event: string, handler: Handler) => {
    const handlers = handlersRef.current.get(event) ?? new Set<Handler>();
    handlers.add(handler);
    handlersRef.current.set(event, handlers);
    return () => {
      handlers.delete(handler);
    };
  }, []);

  const setNotifications = useCallback((items: NotificationDto[], nextUnread: number) => {
    setNotificationList(items);
    setUnread(nextUnread);
  }, []);

  const markAllRead = useCallback(() => {
    setNotificationList((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  }, []);

  const value = useMemo<RealtimeContextValue>(
    () => ({ connected, on, notifications, unread, setNotifications, markAllRead }),
    [connected, on, notifications, unread, setNotifications, markAllRead],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside <RealtimeProvider>.');
  return context;
}

/**
 * Runs `handler` whenever one of `events` arrives from the server.
 * The handler is kept in a ref so callers do not need to memoise it.
 */
export function useRealtimeEvent(events: string | string[], handler: () => void) {
  const { on } = useRealtime();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  const key = Array.isArray(events) ? events.join('|') : events;

  useEffect(() => {
    const list = key.split('|');
    const unsubscribes = list.map((event) => on(event, () => handlerRef.current()));
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [key, on]);
}
