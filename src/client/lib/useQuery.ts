import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * A deliberately small data-fetching hook.
 *
 * Atlas does not use a caching library: every screen loads what it needs and
 * refetches when Socket.IO says something changed. That is easy to follow, and
 * for a company-sized dataset it is plenty fast.
 */
export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
): QueryState<T> & { refetch: () => void; setData: (updater: (current: T) => T) => void } {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });

  // The fetcher is kept in a ref so callers do not have to memoise it, and it
  // is updated in an effect rather than during render — writing to a ref while
  // rendering is not allowed and misbehaves under concurrent rendering.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [nonce, setNonce] = useState(0);
  const refetch = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    setState((current) => ({ ...current, loading: true, error: null }));

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setState({ data: null, loading: false, error: errorMessage(error) });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const setData = useCallback((updater: (current: T) => T) => {
    setState((current) =>
      current.data === null ? current : { ...current, data: updater(current.data) },
    );
  }, []);

  return { ...state, refetch, setData };
}

/** Debounces a value — used for search inputs so we do not query on every key. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
