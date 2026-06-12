'use client';

import { MATCHES_PAGE_SIZE } from '@/lib/config';
import { formatLongDate, parseIsoDate } from '@/lib/format';
import type { Match, MatchesData, SnapshotRow } from '@/lib/types';
import EmptyState from './EmptyState';
import ScreenShell from './ScreenShell';
import { useLatestSnapshot, usePager } from './hooks';

function Score({ match }: { match: Match }) {
  const hasScore = match.homeScore != null && match.awayScore != null;
  if (!hasScore) {
    return <span className="text-bisharp-light/30">–</span>;
  }
  return (
    <span className={match.status === 'live' ? 'text-bisharp-orange' : undefined}>
      {match.homeScore} – {match.awayScore}
    </span>
  );
}

function StatusCell({ status }: { status?: Match['status'] }) {
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-2.5 rounded-full bg-bisharp-orange/15 px-4 py-1.5 font-heading text-xl font-semibold tracking-wider text-bisharp-orange">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-bisharp-orange" />
        LIVE
      </span>
    );
  }
  if (status === 'final') {
    return <span className="text-xl text-bisharp-light/45">Eindstand</span>;
  }
  return null;
}

function MatchRow({ match }: { match: Match }) {
  return (
    <li
      className="grid min-h-0 flex-1 items-center gap-6 rounded-xl bg-white/[0.04] px-8 [grid-template-columns:8rem_1fr_12rem_1fr_10rem]"
      style={{ maxHeight: '7.5rem' }}
    >
      <span className="font-heading text-3xl font-semibold text-bisharp-blue">
        {match.kickoff}
      </span>
      <span className="min-w-0 truncate text-right font-body text-3xl">
        {match.home}
      </span>
      <span className="text-center font-heading text-4xl font-bold tabular-nums">
        <Score match={match} />
      </span>
      <span className="min-w-0 truncate font-body text-3xl">{match.away}</span>
      <span className="text-right">
        <StatusCell status={match.status} />
      </span>
    </li>
  );
}

type Props = {
  poolId: string;
  initial: SnapshotRow<MatchesData> | null;
};

export default function MatchesBoard({ poolId, initial }: Props) {
  const snapshot = useLatestSnapshot<MatchesData>(poolId, 'matches', initial);
  const matches = snapshot?.data.matches ?? [];
  const { pageItems, pager } = usePager(matches, MATCHES_PAGE_SIZE);

  const matchDate = snapshot?.data.date ? parseIsoDate(snapshot.data.date) : null;

  return (
    <ScreenShell
      title="Wedstrijden van vandaag"
      subtitle={matchDate ? formatLongDate(matchDate) : undefined}
      scrapedAt={snapshot?.scraped_at}
      pager={pager}
    >
      {!snapshot ? (
        <EmptyState
          title="Nog geen gegevens"
          subtitle="Het programma verschijnt hier zodra de eerste scrape is gedraaid."
        />
      ) : matches.length === 0 ? (
        <EmptyState
          title="Geen wedstrijden vandaag"
          subtitle="De volgende speelronde verschijnt hier automatisch."
        />
      ) : (
        <ul className="flex h-full flex-col justify-center gap-[0.5rem]">
          {pageItems.map((match, i) => (
            <MatchRow key={`${match.kickoff}-${match.home}-${i}`} match={match} />
          ))}
        </ul>
      )}
    </ScreenShell>
  );
}
