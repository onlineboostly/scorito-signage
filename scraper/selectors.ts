/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  The single place where knowledge of Scorito's structure lives.
 *
 *  Confirmed via discovery runs on 2026-06-12 (dumps in scraper/debug/):
 *  Scorito is an SPA ("Gamecenter", rendered in a phone mockup) that loads all
 *  data from JSON APIs. Instead of parsing the mockup DOM (hashed, unstable
 *  class names), the scraper INTERCEPTS those API responses while the
 *  logged-in pages load:
 *
 *    ranking.scorito.com/2/ranking/v2.0/gameranking/getpage/{poolId}/{page}/0
 *      → Content.RankingItems[]: { Rank, UserName, TotalPoints, Delta },
 *        Content.ParticipantCount.  Delta = currentRank − previousRank
 *        (negative = climbed; deltas sum to zero across the pool).
 *    league.scorito.com/subleague/v1.0/subleague/{poolId}
 *      → Content.Name ("Bisharp"), Content.EventName ("WK 2026").
 *    football.scorito.com/footballGeneric/v2.0/matches/event/{eventId}
 *      → Content[]: { HomeTeamId, AwayTeamId, Status, HomeScore, AwayScore,
 *        MatchDate ("2026-06-14T20:00:00", Dutch wall time), PlayMinute }.
 *        Status: 0 = scheduled, 2 = final, anything else = in progress.
 *    football.scorito.com/footballGeneric/v2.0/eventrankings/{eventId}
 *      → team map: Content[].RankEntries[]: { TeamId, TranslatedName }.
 *
 *  If Scorito changes its frontend, run `npm run scrape:discover` and inspect
 *  the fresh xhr.json dumps for the new endpoints, then update these patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Flipped to true on 2026-06-12 after the discovery runs above. */
export const SELECTORS_CONFIRMED = true;

/** URL patterns of the API responses the scraper intercepts. */
export const api = {
  /** Pool standing page(s). */
  ranking: /ranking\.scorito\.com\/.*gameranking\/getpage\//i,
  /** Pool metadata (name). */
  subleague: /league\.scorito\.com\/subleague\/v1\.0\/subleague\/\d+$/i,
  /** All matches of the tournament. */
  matches: /football\.scorito\.com\/footballGeneric\/v2\.0\/matches\/event\/\d+$/i,
  /** Group standings — used only as TeamId → name map. */
  teamRankings: /football\.scorito\.com\/footballGeneric\/v2\.0\/eventrankings\/\d+$/i,
} as const;

export const login = {
  // Confirmed: Scorito redirects protected pages to /login (the Gamecenter
  // login, regular DOM in the main frame — the idsrv iframe is only the
  // OAuth helper).
  loginUrl: 'https://www.scorito.com/login',

  emailInput:
    'input[type="email"], input[name="email" i], input[name="username" i], input[placeholder="Email" i]',
  passwordInput: 'input[type="password"]',
  // The form's submit is NOT a <button> but <div role="button"><span>Inloggen
  // </span></div> inside the gamecenter layover (phone mockup). The page
  // behind the layover has a real <button> "Inloggen Gamecenter" that a
  // broad match hits first, so target the role=button div explicitly.
  // Class names are hashed (button-p6RFw0 etc.), hence no class selectors.
  submitButton:
    '[class*="game-center-layover"] [role="button"]:has-text("Inloggen"), [role="button"]:text-is("Inloggen"), button[type="submit"], input[type="submit"]',

  /** Presence of any of these means we are (still) looking at a login page. */
  loginPageMarker: 'input[type="password"]',

  /** Markers that indicate a 2FA / one-time-code step → fail loudly. */
  twoFactorMarker:
    'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="twofactor" i], input[name*="verification" i]',

  /** Markers for a Cloudflare / bot challenge → fail loudly. */
  cloudflareMarker:
    '#challenge-form, #challenge-running, .cf-turnstile, iframe[src*="challenges.cloudflare.com"]',
  cloudflareTitle: /just a moment|attention required|access denied|een moment geduld/i,
};

/** Cookie-consent buttons, tried in order; silently skipped when absent.
 *  Scorito uses Termly — "Accepteren" is the one that matches (confirmed). */
export const cookieConsentCandidates = [
  '#onetrust-accept-btn-handler',
  'button:has-text("Alles accepteren")',
  'button:has-text("Accepteren")',
  'button:has-text("Akkoord")',
  'button:has-text("Accept all")',
  '[id*="cookie" i] button[class*="accept" i]',
];
