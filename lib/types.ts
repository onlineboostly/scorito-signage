/** One row in the pool standing. */
export type Entry = {
  rank: number;
  name: string;
  points: number;
  /** Places climbed (positive) or dropped (negative) since the previous round. */
  movement?: number;
  /** Points gained so far today (Europe/Amsterdam), derived by diffing snapshots; omitted when unknown. */
  roundPoints?: number;
  /** Scorito user id — used to match an entry across snapshots; never displayed. */
  userId?: number;
};

/** One fixture on the matches page. */
export type Match = {
  /** Kickoff time as displayed (Europe/Amsterdam), e.g. "20:00". */
  kickoff: string;
  /** Kickoff date (yyyy-mm-dd, Europe/Amsterdam) — drives the Gisteren/Morgen label. */
  dateIso?: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  status?: 'scheduled' | 'live' | 'final';
};

export type SnapshotKind = 'standing' | 'matches';

export type StandingData = {
  entries: Entry[];
  poolName?: string;
};

export type MatchesData = {
  matches: Match[];
  /** ISO date (yyyy-mm-dd) the matches belong to, Europe/Amsterdam. */
  date?: string;
};

/** The slice of a pool_snapshots row the pages care about. */
export type SnapshotRow<T> = {
  data: T;
  scraped_at: string;
};
