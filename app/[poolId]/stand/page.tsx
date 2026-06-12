import type { Metadata } from 'next';
import SetupNotice from '@/components/SetupNotice';
import StandingBoard from '@/components/StandingBoard';
import { createAnonClient, fetchLatestSnapshot } from '@/lib/supabase';
import type { SnapshotRow, StandingData } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Stand van vandaag · Bisharp',
};

export default async function StandPage({
  params,
}: {
  params: { poolId: string };
}) {
  const client = createAnonClient();
  if (!client) return <SetupNotice />;

  let initial: SnapshotRow<StandingData> | null = null;
  try {
    initial = await fetchLatestSnapshot<StandingData>(
      client,
      params.poolId,
      'standing'
    );
  } catch (err) {
    // Render the empty board; the client-side poll recovers as soon as
    // Supabase is reachable again.
    console.error('Initial standing fetch failed:', err);
  }

  return <StandingBoard poolId={params.poolId} initial={initial} />;
}
