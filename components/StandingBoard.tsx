'use client';

import { STANDING_PAGE_SIZE } from '@/lib/config';
import { formatPoints } from '@/lib/format';
import type { Entry, SnapshotRow, StandingData } from '@/lib/types';
import EmptyState from './EmptyState';
import ScreenShell from './ScreenShell';
import { useLatestSnapshot, usePager } from './hooks';

const RANK_STYLES: Record<number, { badge: string; row: string }> = {
  1: { badge: 'bg-bisharp-orange text-bisharp-dark', row: 'bg-bisharp-orange/10' },
  2: { badge: 'bg-bisharp-blue text-bisharp-dark', row: 'bg-bisharp-blue/10' },
  3: { badge: 'bg-bisharp-green text-bisharp-dark', row: 'bg-bisharp-green/10' },
};

function Movement({ value }: { value?: number }) {
  if (!value) {
    return <span className="text-bisharp-light/25">·</span>;
  }
  return value > 0 ? (
    <span className="text-bisharp-green">▲ {value}</span>
  ) : (
    <span className="text-negative">▼ {Math.abs(value)}</span>
  );
}

function StandingRow({ entry }: { entry: Entry }) {
  const style = RANK_STYLES[entry.rank] ?? {
    badge: 'bg-white/[0.08] text-bisharp-light/80',
    row: 'bg-white/[0.04]',
  };

  return (
    <li
      className={`flex min-h-0 flex-1 items-center gap-8 rounded-xl px-8 ${style.row}`}
      style={{ maxHeight: '6.2rem' }}
    >
      <span
        className={`flex h-[2.6rem] w-[3.6rem] shrink-0 items-center justify-center rounded-lg font-heading text-2xl font-bold ${style.badge}`}
      >
        {entry.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-body text-3xl">
        {entry.name}
      </span>
      <span className="w-24 shrink-0 text-center font-heading text-2xl font-semibold">
        <Movement value={entry.movement} />
      </span>
      <span className="w-44 shrink-0 text-right font-heading text-4xl font-bold tabular-nums">
        {formatPoints(entry.points)}
      </span>
    </li>
  );
}

type Props = {
  poolId: string;
  initial: SnapshotRow<StandingData> | null;
};

export default function StandingBoard({ poolId, initial }: Props) {
  const snapshot = useLatestSnapshot<StandingData>(poolId, 'standing', initial);
  const entries = snapshot?.data.entries ?? [];
  const { pageItems, pager } = usePager(entries, STANDING_PAGE_SIZE);

  return (
    <ScreenShell
      title="Stand"
      subtitle={snapshot?.data.poolName}
      scrapedAt={snapshot?.scraped_at}
      pager={pager}
    >
      {entries.length === 0 ? (
        <EmptyState
          title="Nog geen stand beschikbaar"
          subtitle="De stand verschijnt hier zodra de eerste scrape is gedraaid."
        />
      ) : (
        <ol className="flex h-full flex-col justify-center gap-[0.45rem]">
          {pageItems.map((entry) => (
            <StandingRow key={`${entry.rank}-${entry.name}`} entry={entry} />
          ))}
        </ol>
      )}
    </ScreenShell>
  );
}
