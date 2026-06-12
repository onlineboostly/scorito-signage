import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SnapshotKind, SnapshotRow } from './types';

export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** Anon-key client. Returns null when the public env vars are not set. */
export function createAnonClient(): SupabaseClient | null {
  const env = getPublicSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Bypass Next's fetch data-cache: a signage page must always serve the
      // newest snapshot, even on the very first server render.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}

let browserClient: SupabaseClient | null = null;

/** Singleton client for the browser (used by the 60s polling hook). */
export function getBrowserClient(): SupabaseClient | null {
  if (!browserClient) browserClient = createAnonClient();
  return browserClient;
}

/** Most recent snapshot for a pool + kind, or null when none exists yet. */
export async function fetchLatestSnapshot<T>(
  client: SupabaseClient,
  poolId: string,
  kind: SnapshotKind
): Promise<SnapshotRow<T> | null> {
  const { data, error } = await client
    .from('pool_snapshots')
    .select('data, scraped_at')
    .eq('pool_id', poolId)
    .eq('kind', kind)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return (data as SnapshotRow<T> | null) ?? null;
}
