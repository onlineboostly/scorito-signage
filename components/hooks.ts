'use client';

import { useEffect, useMemo, useState } from 'react';
import { PAGE_ROTATE_MS, REFRESH_MS } from '@/lib/config';
import { fetchLatestSnapshot, getBrowserClient } from '@/lib/supabase';
import type { SnapshotKind, SnapshotRow } from '@/lib/types';

/**
 * Keeps a snapshot current: starts from the server-rendered value and
 * re-fetches the latest row from Supabase every REFRESH_MS.
 */
export function useLatestSnapshot<T>(
  poolId: string,
  kind: SnapshotKind,
  initial: SnapshotRow<T> | null
): SnapshotRow<T> | null {
  const [snapshot, setSnapshot] = useState<SnapshotRow<T> | null>(initial);

  useEffect(() => {
    const client = getBrowserClient();
    if (!client) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const latest = await fetchLatestSnapshot<T>(client, poolId, kind);
        if (!cancelled && latest) setSnapshot(latest);
      } catch (err) {
        // Keep showing the last good snapshot; the stale indicator covers us.
        console.warn('Snapshot refresh failed:', err);
      }
    };

    const id = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [poolId, kind]);

  return snapshot;
}

export type Pager = { count: number; index: number };

/**
 * Splits items into balanced pages of at most `maxPerPage` and rotates
 * through them every PAGE_ROTATE_MS, so everyone fits on the screen.
 */
export function usePager<T>(
  items: T[],
  maxPerPage: number
): { pageItems: T[]; pager: Pager } {
  const pageCount = Math.max(1, Math.ceil(items.length / maxPerPage));
  const perPage = Math.max(1, Math.ceil(items.length / pageCount));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (pageCount <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % pageCount),
      PAGE_ROTATE_MS
    );
    return () => clearInterval(id);
  }, [pageCount]);

  const safeIndex = index % pageCount;
  const pageItems = useMemo(
    () => items.slice(safeIndex * perPage, (safeIndex + 1) * perPage),
    [items, safeIndex, perPage]
  );

  return { pageItems, pager: { count: pageCount, index: safeIndex } };
}

/**
 * Current time, started after mount (SSR-safe) and refreshed every 30s.
 * Null until the component is mounted in the browser.
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  return now;
}
