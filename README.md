# Scorito op het scherm

Two TV-friendly, Bisharp-branded pages for an OptiSigns screen:

- **`/<poolId>/stand`** — the current Scorito pool standing
- **`/<poolId>/wedstrijden`** — today's fixtures with kickoff times and scores

Scorito blocks embedding (`X-Frame-Options`) and has no public API, so:

```
GitHub Actions (cron, every 10 min)
  └─ Playwright logs into Scorito, scrapes standing + matches
       └─ writes JSON snapshots to Supabase (pool_snapshots)
            └─ Next.js on Vercel renders both pages (auto-refresh every 60s)
                 └─ OptiSigns Website-app playlist rotates the two URLs
```

## Repo layout

| Path                      | What                                              |
| ------------------------- | ------------------------------------------------- |
| `app/`                    | Next.js 14 app router pages                       |
| `components/`             | TV boards, shell, polling/pagination hooks        |
| `lib/`                    | Shared types, Supabase client, formatting         |
| `scraper/`                | Playwright scraper (`scrape.ts`, `selectors.ts`)  |
| `supabase/schema.sql`     | Table + RLS, run once in the Supabase SQL editor  |
| `.github/workflows/`      | The 10-minute scrape cron                         |

## 1. Setup

1. Create a Supabase project and run [supabase/schema.sql](supabase/schema.sql) in the SQL editor.
2. `cp .env.example .env.local` and fill everything in (Supabase URL + keys, Scorito credentials + page URLs).
3. `npm install`

### See it working without Scorito

```bash
npm run seed   # writes a test standing (18 entries) + 6 matches to Supabase
npm run dev    # http://localhost:3000/wk2026/stand and /wk2026/wedstrijden
```

## 2. How the scraper reads Scorito (already wired up)

Discovery was done on 2026-06-12. Scorito turned out to be an SPA
("Gamecenter") that loads everything from JSON APIs, so instead of parsing
the DOM (hashed, unstable class names) the scraper **intercepts the API
responses** while the logged-in pages load — ranking, pool name, the full
match list and the team-name map. The endpoint patterns, payload shapes and
login selectors are all documented in [scraper/selectors.ts](scraper/selectors.ts),
which remains the only place that knowledge lives.

```bash
npx playwright install chromium   # first time only, local machine
npm run scrape                    # scrape + write snapshots to Supabase
```

If Scorito ever changes its frontend and the scrape starts failing, re-run
the diagnostic mode:

```bash
npm run scrape:discover
```

It logs in and writes `page.html`, `page.png`, `xhr.json` (every JSON
response the page loaded) and `meta.txt` to `scraper/debug/standing/` and
`scraper/debug/matches/` — find the new endpoints in `xhr.json` and update
the patterns in `selectors.ts`. While `SELECTORS_CONFIRMED` is `false` there,
every scrape run (including the cron) runs discovery and **exits non-zero on
purpose**, so nothing fails silently.

### Login edge cases (fail loudly, by design)

- **Cloudflare / bot challenge** → run aborts with a clear error; screenshot lands in `scraper/debug/error/` (uploaded as a workflow artifact in CI).
- **2FA** → run aborts; disable 2FA for this account, or log in manually once and drop the resulting `scraper/.auth/storageState.json` in place.
- The session is reused via `storageState.json` (gitignored; carried between CI runs via the actions cache), so a full login only happens when the session expires.

## 3. Deploy

**GitHub** — push this repo, then add the repository secrets the workflow
needs (Settings → Secrets and variables → Actions):
`SCORITO_EMAIL`, `SCORITO_PASSWORD`, `SCORITO_STANDING_URL`,
`SCORITO_MATCHES_URL`, `POOL_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
The cron in [.github/workflows/scrape.yml](.github/workflows/scrape.yml) runs
every 10 minutes (best-effort — GitHub may delay it a few minutes, and pauses
schedules after 60 days without repo activity).

**Vercel** — import the repo and set two env vars:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(plus `NEXT_PUBLIC_DEFAULT_POOL_ID` if your pool isn't `wk2026`).
`vercel.json` already prevents Playwright from downloading browsers during
the Vercel build.

**OptiSigns** — create two *Website App* assets:

- `https://<your-app>.vercel.app/wk2026/stand`
- `https://<your-app>.vercel.app/wk2026/wedstrijden`

Put both in a playlist (15–30s per slide) and assign it to the screen. The
pages auto-refresh their data every 60 seconds, so no player reload is needed.

## Display behaviour

- 1920×1080 landscape, no scrollbars; proportions scale with viewport width (also fine on 4K players).
- Ranks 1–3 get orange/blue/green accents; movement arrows are green (▲) / red (▼).
- More than 15 standing entries (or 8 matches) → auto-pagination, rotating every 15s, with page dots at the bottom.
- "Laatst bijgewerkt HH:MM" in the header turns orange with "(verouderd)" when the snapshot is older than 30 minutes — the quickest way to spot a broken scraper from across the room.
- No matches in the snapshot → a clean "Geen wedstrijden vandaag" state.
- Branding lives in [tailwind.config.ts](tailwind.config.ts) (colors) and [components/ScreenShell.tsx](components/ScreenShell.tsx) (wordmark — swap in a logo from `/public` there if wanted).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Workflow fails with exit code 2 | `SELECTORS_CONFIRMED` is still `false` — finish the discovery steps above |
| "Cloudflare / bot challenge detected" | Scorito is blocking the runner; check the debug artifact, consider a longer cron interval |
| Pages show "Nog geen stand beschikbaar" | No snapshot rows yet for that `poolId` — run `npm run seed` or the scraper |
| Header shows "(verouderd)" | Scraper hasn't written for 30+ min — check the Actions tab |
| "Configuratie ontbreekt" | `NEXT_PUBLIC_SUPABASE_*` env vars missing on Vercel / in `.env.local` |
