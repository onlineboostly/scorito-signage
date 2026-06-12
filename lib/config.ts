/** Pool shown when visiting `/`. */
export const DEFAULT_POOL_ID =
  process.env.NEXT_PUBLIC_DEFAULT_POOL_ID ?? 'wk2026';

/** Client-side re-fetch interval — keeps the screen current without a player reload. */
export const REFRESH_MS = 60_000;

/** When paginated, how long each page stays on screen. */
export const PAGE_ROTATE_MS = 15_000;

/** Max standing entries per page before auto-pagination kicks in. */
export const STANDING_PAGE_SIZE = 15;

/** Max matches per page before auto-pagination kicks in. */
export const MATCHES_PAGE_SIZE = 8;

/** Snapshot older than this gets a "(verouderd)" warning in the header. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
