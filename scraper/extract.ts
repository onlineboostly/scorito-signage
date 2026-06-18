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
  /**
   * UTC, but serialized WITHOUT a timezone marker, e.g. "2026-06-14T20:00:00"
   * = 20:00Z = 22:00 Amsterdam (summer). Confirmed 2026-06-16 by comparing to
   * Scorito's own displayed times. Always read it through parseScoritoUtc().
   */
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

const TZ = 'Europe/Amsterdam';

/** Today's date (yyyy-mm-dd) in Europe/Amsterdam. */
export function todayInAmsterdam(): string {
  return amsterdamDate(new Date());
}

/**
 * Parse a Scorito MatchDate. The API sends UTC wall-clock without an offset
 * ("2026-06-16T19:00:00" = 19:00Z), so append 'Z' unless one is already there.
 */
export function parseScoritoUtc(raw: string): Date {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  return new Date(hasTz ? raw : `${raw}Z`);
}

/** yyyy-mm-dd for an instant, in Europe/Amsterdam. */
function amsterdamDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** "21:00" — kickoff time for an instant, in Europe/Amsterdam (24h). */
function amsterdamTime(d: Date): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
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
      // roundPoints (points gained today) is filled in later by the scraper,
      // by diffing against an earlier snapshot — Scorito's RoundPoints in the
      // overall ranking just mirrors TotalPoints, so it is not usable here.
      userId: typeof item.UserId === 'number' ? item.UserId : undefined,
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

/** How many recently-started and upcoming fixtures the matches page shows. */
const RECENT_COUNT = 2;
const UPCOMING_COUNT = 3;

/**
 * Select the fixtures for the matches page: the last RECENT_COUNT matches that
 * have already kicked off (finished or live) plus the next UPCOMING_COUNT that
 * are still scheduled. Times/dates are rendered in Europe/Amsterdam — the API
 * sends UTC, so anything time-based must go through parseScoritoUtc first.
 * `date` (today, Amsterdam) is kept for the page's Gisteren/Morgen labels.
 */
export function parseMatches(
  payload: unknown,
  teamMap: Map<number, string>,
  date: string
): MatchesData {
  const env = asEnvelope<ApiMatch[]>(payload, 'matches');
  if (!Array.isArray(env.Content)) {
    throw new Error(`Matches payload is not a list. ${DISCOVERY_HINT}`);
  }

  const sorted = env.Content.map((m) => ({
    m,
    kickoffAt: typeof m.MatchDate === 'string' ? parseScoritoUtc(m.MatchDate) : null,
  }))
    .filter(
      (x): x is { m: ApiMatch; kickoffAt: Date } =>
        x.kickoffAt != null && !Number.isNaN(x.kickoffAt.getTime())
    )
    .sort((a, b) => a.kickoffAt.getTime() - b.kickoffAt.getTime());

  const started = sorted.filter((x) => toStatus(x.m.Status) !== 'scheduled');
  const scheduled = sorted.filter((x) => toStatus(x.m.Status) === 'scheduled');

  // Last N started (most recent kickoffs, incl. any live match) + next N scheduled.
  const selected = [...started.slice(-RECENT_COUNT), ...scheduled.slice(0, UPCOMING_COUNT)];

  const matches: Match[] = selected.map(({ m, kickoffAt }) => {
    const status = toStatus(m.Status);
    return {
      kickoff: amsterdamTime(kickoffAt),
      dateIso: amsterdamDate(kickoffAt),
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
