import type { Metadata } from 'next';
import MatchesBoard from '@/components/MatchesBoard';
import SetupNotice from '@/components/SetupNotice';
import { createAnonClient, fetchLatestSnapshot } from '@/lib/supabase';
import type { MatchesData, SnapshotRow } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Wedstrijden van vandaag · Bisharp',
};

export default async function WedstrijdenPage({
  params,
}: {
  params: { poolId: string };
}) {
  const client = createAnonClient();
  if (!client) return <SetupNotice />;

  let initial: SnapshotRow<MatchesData> | null = null;
  try {
    initial = await fetchLatestSnapshot<MatchesData>(
      client,
      params.poolId,
      'matches'
    );
  } catch (err) {
    console.error('Initial matches fetch failed:', err);
  }

  return <MatchesBoard poolId={params.poolId} initial={initial} />;
}
