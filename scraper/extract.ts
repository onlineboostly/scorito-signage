/**
 * Extraction — turns intercepted Scorito API payloads into snapshot JSON.
 *
 * Payload shapes were confirmed against real responses on 2026-06-12; see the
 * documentation block in ./selectors.ts and the dumps in scraper/debug/. If a
 * shape changes, the parsers below throw with a hint to re-run discovery.
 */
import type { Entry, Match, MatchesData, StandingData } from '../lib/types';

const DISCOVERY_HINT =
  'Scorito may have changed its API — run `npm run scrape:discover` and inspect the xhr.json dumps.';

/** Every Scorito API response wraps its payload in this envelope. */
type ApiEnvelope<T> = {
  ResultCode: number;
  ErrorMessage: string;
  Content: T;
};

export type ApiRankingItem = {
  Delta?: number;
  Rank: number;
  RoundPoints?: number;
  TotalPoints: number;
  UserId: number;
  UserName: string;
};

type RankingContent = {
  RankingItems: ApiRankingItem[];
  ParticipantCount?: number;
  RankingAvailable?: boolean;
};

type SubleagueContent = {
  Name?: string;
  EventName?: string;
};

type ApiMatch = {
  MatchId: number;
  HomeTeamId: number;
  AwayTeamId: number;
  /** 0 = scheduled, 2 = final, anything else = in progress. */
  Status: number;
  HomeScore: number;
  AwayScore: number;
  /** Dutch wall time without offset, e.g. "2026-06-14T20:00:00". */
  MatchDate: string;
  PlayMinute?: string;
};

type EventRankingGroup = {
  RankEntries?: Array<{ TeamId: number; TranslatedName?: string }>;
};

function asEnvelope<T>(payload: unknown, what: string): ApiEnvelope<T> {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('Content' in payload) ||
    (payload as ApiEnvelope<T>).Content == null
  ) {
    throw new Error(`Unexpected ${what} payload (no Content). ${DISCOVERY_HINT}`);
  }
  return payload as ApiEnvelope<T>;
}

/** Today's date (yyyy-mm-dd) in Europe/Amsterdam. */
export function todayInAmsterdam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** One page of the pool ranking. */
export function parseRankingPage(payload: unknown): {
  items: ApiRankingItem[];
  participantCount: number;
} {
  const env = asEnvelope<RankingContent>(payload, 'gameranking');
  const items = Array.isArray(env.Content.RankingItems)
    ? env.Content.RankingItems
    : [];
  return {
    items,
    participantCount: env.Content.ParticipantCount ?? items.length,
  };
}

/**
 * Merge ranking items (possibly from multiple pages) into StandingData.
 * Delta = currentRank − previousRank, so movement (places climbed) = −Delta.
 */
export function assembleStanding(
  items: ApiRankingItem[],
  subleaguePayload?: unknown
): StandingData {
  const byUser = new Map<number, ApiRankingItem>();
  for (const item of items) {
    if (typeof item?.Rank === 'number' && typeof item?.UserName === 'string') {
      byUser.set(item.UserId ?? item.Rank, item);
    }
  }

  const entries: Entry[] = [...byUser.values()]
    .sort((a, b) => a.Rank - b.Rank)
    .map((item) => ({
      rank: item.Rank,
      name: item.UserName,
      points: item.TotalPoints ?? 0,
      movement: typeof item.Delta === 'number' ? -item.Delta : undefined,
    }));

  if (entries.length === 0) {
    throw new Error(`Ranking produced 0 entries. ${DISCOVERY_HINT}`);
  }

  let poolName: string | undefined;
  if (subleaguePayload) {
    try {
      const sub = asEnvelope<SubleagueContent>(subleaguePayload, 'subleague');
      poolName = [sub.Content.Name, sub.Content.EventName]
        .filter(Boolean)
        .join(' · ');
    } catch {
      // pool name is decoration — never fail the scrape over it
    }
  }

  return { entries, poolName };
}

/** TeamId → display name, from the eventrankings (group standings) payload. */
export function buildTeamMap(payload: unknown): Map<number, string> {
  const env = asEnvelope<EventRankingGroup[]>(payload, 'eventrankings');
  const map = new Map<number, string>();
  if (Array.isArray(env.Content)) {
    for (const group of env.Content) {
      for (const entry of group.RankEntries ?? []) {
        if (entry.TeamId != null && entry.TranslatedName) {
          map.set(entry.TeamId, entry.TranslatedName);
        }
      }
    }
  }
  if (map.size === 0) {
    throw new Error(`Team map is empty. ${DISCOVERY_HINT}`);
  }
  return map;
}

function toStatus(apiStatus: number): Match['status'] {
  if (apiStatus === 0) return 'scheduled';
  if (apiStatus === 2) return 'final';
  return 'live';
}

/** Filter the full tournament match list down to one day's fixtures. */
export function parseMatches(
  payload: unknown,
  teamMap: Map<number, string>,
  date: string
): MatchesData {
  const env = asEnvelope<ApiMatch[]>(payload, 'matches');
  if (!Array.isArray(env.Content)) {
    throw new Error(`Matches payload is not a list. ${DISCOVERY_HINT}`);
  }

  const matches: Match[] = env.Content.filter(
    (m) => typeof m.MatchDate === 'string' && m.MatchDate.startsWith(date)
  )
    .sort((a, b) => a.MatchDate.localeCompare(b.MatchDate))
    .map((m) => {
      const status = toStatus(m.Status);
      return {
        kickoff: m.MatchDate.slice(11, 16),
        home: teamMap.get(m.HomeTeamId) ?? `Team ${m.HomeTeamId}`,
        away: teamMap.get(m.AwayTeamId) ?? `Team ${m.AwayTeamId}`,
        // Scorito reports 0-0 for unplayed matches; only show real scores.
        ...(status !== 'scheduled'
          ? { homeScore: m.HomeScore, awayScore: m.AwayScore }
          : {}),
        status,
      };
    });

  return { matches, date };
}
