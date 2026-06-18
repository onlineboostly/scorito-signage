/**
 * Scorito scraper — runs in GitHub Actions (or locally), never on Vercel.
 *
 * Modes:
 *   npm run scrape:discover  → log in, dump HTML + screenshot + XHR log for
 *                              both pages into scraper/debug/, then exit.
 *   npm run scrape           → extract standing + matches and write two
 *                              snapshot rows to Supabase.
 *
 * While SELECTORS_CONFIRMED is false the scraper always runs discovery and
 * exits non-zero, so a prematurely enabled cron fails loudly instead of
 * silently writing nothing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Entry, MatchesData, StandingData } from '../lib/types';
import { readEnv, type ScraperEnv } from './env';
import {
  assembleStanding,
  buildTeamMap,
  parseMatches,
  parseRankingPage,
  todayInAmsterdam,
  type ApiRankingItem,
} from './extract';
import {
  api,
  cookieConsentCandidates,
  login as loginSel,
  SELECTORS_CONFIRMED,
} from './selectors';

const AUTH_DIR = path.join('scraper', '.auth');
const STORAGE_STATE = path.join(AUTH_DIR, 'storageState.json');
const DEBUG_DIR = path.join('scraper', 'debug');

// Realistic fingerprint: recent desktop Chrome on Windows at TV resolution.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const log = (...args: unknown[]) =>
  console.log(new Date().toISOString(), '—', ...args);

async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  // SPAs may never reach networkidle — treat it as best-effort.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
}

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const selector of cookieConsentCandidates) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
        await button.click({ timeout: 2_000 });
        log(`Cookie banner dismissed via "${selector}"`);
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // try the next candidate
    }
  }
}

async function assertNoCloudflare(page: Page): Promise<void> {
  const title = await page.title().catch(() => '');
  const challenged =
    loginSel.cloudflareTitle.test(title) ||
    (await page
      .locator(loginSel.cloudflareMarker)
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false));
  if (challenged) {
    throw new Error(
      `Cloudflare / bot challenge detected (title: "${title}"). Login is blocked — see the screenshot in scraper/debug/error/. ` +
        'Consider scraping less often or from a different runner.'
    );
  }
}

async function assertNo2FA(page: Page): Promise<void> {
  const visible = await page
    .locator(loginSel.twoFactorMarker)
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (visible) {
    throw new Error(
      'Scorito asks for a 2FA / verification code — the scraper cannot answer it. ' +
        'Disable 2FA for this account or log in manually once and provide scraper/.auth/storageState.json.'
    );
  }
}

async function isLoginPage(page: Page): Promise<boolean> {
  if (/login|inloggen/i.test(page.url())) return true;
  return page
    .locator(loginSel.loginPageMarker)
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}

async function performLogin(page: Page, env: ScraperEnv): Promise<void> {
  // If the current page has no login form, go to the known login URL.
  const formHere = await page
    .locator(loginSel.passwordInput)
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
  if (!formHere) {
    await gotoSettled(page, loginSel.loginUrl);
    await dismissCookieBanner(page);
  }
  await assertNoCloudflare(page);

  const emailInput = page.locator(loginSel.emailInput).first();
  await emailInput.waitFor({ timeout: 15_000 }).catch(() => {
    throw new Error(
      `No login form found on ${page.url()} — confirm login.loginUrl and the input selectors in scraper/selectors.ts.`
    );
  });

  await emailInput.fill(env.email);
  await page.locator(loginSel.passwordInput).first().fill(env.password);
  await page.locator(loginSel.submitButton).first().click();

  // Scorito runs an OAuth dance after the click (IdentityServer iframe →
  // /connect/authorize → /signincallback → token in localStorage). Navigating
  // away too early aborts it, so wait until the SPA actually leaves /login
  // and the token exchange has settled.
  await page
    .waitForURL((url) => !/login/i.test(url.pathname), { timeout: 30_000 })
    .catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2_500);

  await assertNoCloudflare(page);
  await assertNo2FA(page);
  if (await isLoginPage(page)) {
    throw new Error(
      'Still on a login page after submitting credentials — wrong credentials, changed selectors, or bot protection. ' +
        'Check the artifacts in scraper/debug/error/.'
    );
  }
}

async function ensureLoggedIn(
  page: Page,
  context: BrowserContext,
  env: ScraperEnv
): Promise<void> {
  await gotoSettled(page, env.standingUrl);
  await dismissCookieBanner(page);
  await assertNoCloudflare(page);

  if (await isLoginPage(page)) {
    log('No valid session — logging in.');
    await performLogin(page, env);

    // Verify against the real target before declaring victory: a half-finished
    // OAuth exchange still bounces protected pages back to /login.
    await gotoSettled(page, env.standingUrl);
    if (await isLoginPage(page)) {
      throw new Error(
        'Login seemed to succeed but the standing page still redirects to /login. ' +
          'Check the artifacts in scraper/debug/error/.'
      );
    }

    // Save only now, so the captured localStorage includes the OIDC tokens.
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: STORAGE_STATE });
    log(`Login OK — session saved to ${STORAGE_STATE}`);
  } else {
    log('Existing session still valid.');
  }
}

/** Dump everything needed to determine the real selectors for one page. */
async function discoveryDump(page: Page, label: string, url: string): Promise<void> {
  const dir = path.join(DEBUG_DIR, label);
  fs.mkdirSync(dir, { recursive: true });

  const xhr: Array<{ url: string; status: number; body: unknown }> = [];
  const onResponse = async (response: import('playwright').Response) => {
    try {
      const type = response.headers()['content-type'] ?? '';
      if (!type.includes('json') || xhr.length >= 50) return;
      const text = await response.text();
      if (text.length > 300_000) return;
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      xhr.push({ url: response.url(), status: response.status(), body });
    } catch {
      /* response already gone — ignore */
    }
  };

  page.on('response', onResponse);
  await gotoSettled(page, url);
  await dismissCookieBanner(page);
  await page.waitForTimeout(2_500); // give the SPA time to render
  page.off('response', onResponse);

  fs.writeFileSync(path.join(dir, 'page.html'), await page.content(), 'utf8');
  await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: true });
  fs.writeFileSync(path.join(dir, 'xhr.json'), JSON.stringify(xhr, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(dir, 'meta.txt'),
    `url requested: ${url}\nurl final:     ${page.url()}\ntitle:         ${await page.title()}\n`,
    'utf8'
  );
  log(`Discovery dump for "${label}" written to ${dir}/`);
}

type CapturedResponse = {
  url: string;
  body: unknown;
  /** Request headers — reused to replay paginated API calls with the same auth. */
  requestHeaders: Record<string, string>;
};

/**
 * Navigate to `url` and collect the JSON API responses matching `patterns`
 * while the SPA loads. Resolves once every key in `required` has at least one
 * capture; throws after `timeoutMs` otherwise.
 */
async function captureApiResponses(
  page: Page,
  url: string,
  patterns: Record<string, RegExp>,
  required: string[],
  timeoutMs = 30_000
): Promise<Record<string, CapturedResponse[]>> {
  const captured: Record<string, CapturedResponse[]> = {};
  for (const key of Object.keys(patterns)) captured[key] = [];

  const onResponse = async (response: import('playwright').Response) => {
    try {
      const responseUrl = response.url();
      const key = Object.keys(patterns).find((k) =>
        patterns[k].test(responseUrl)
      );
      if (!key || !response.ok()) return;
      const body = await response.json().catch(() => null);
      if (body == null) return;
      captured[key].push({
        url: responseUrl,
        body,
        requestHeaders: await response.request().allHeaders(),
      });
    } catch {
      /* response evaporated mid-navigation — ignore */
    }
  };

  page.on('response', onResponse);
  try {
    await gotoSettled(page, url);
    await dismissCookieBanner(page);
    await assertNoCloudflare(page);

    const deadline = Date.now() + timeoutMs;
    while (required.some((key) => captured[key].length === 0)) {
      if (Date.now() > deadline) {
        const missing = required.filter((key) => captured[key].length === 0);
        throw new Error(
          `Timed out waiting for Scorito API response(s) "${missing.join(', ')}" on ${url}. ` +
            'Scorito may have changed its endpoints — run `npm run scrape:discover` and inspect xhr.json.'
        );
      }
      await page.waitForTimeout(250);
    }
  } finally {
    page.off('response', onResponse);
  }
  return captured;
}

async function scrapeStanding(page: Page, env: ScraperEnv) {
  const caps = await captureApiResponses(
    page,
    env.standingUrl,
    { ranking: api.ranking, subleague: api.subleague },
    ['ranking']
  );

  const items: ApiRankingItem[] = [];
  let participantCount = 0;
  for (const cap of caps.ranking) {
    const rankingPage = parseRankingPage(cap.body);
    items.push(...rankingPage.items);
    participantCount = Math.max(participantCount, rankingPage.participantCount);
  }

  // Large pools paginate. The SPA only loads page 0 up front, so replay the
  // same call (same Authorization header) for the remaining pages:
  // .../gameranking/getpage/{poolId}/{page}/{roundId}
  const first = caps.ranking[0];
  const pageUrlFor = (n: number) =>
    first.url.replace(/(getpage\/\d+\/)\d+(\/\d+)/i, `$1${n}$2`);
  const auth = first.requestHeaders['authorization'];

  let nextPage = caps.ranking.length;
  while (items.length < participantCount && nextPage < 40) {
    const response = await page.request.get(pageUrlFor(nextPage), {
      headers: auth
        ? { authorization: auth, accept: 'application/json' }
        : { accept: 'application/json' },
    });
    if (!response.ok()) {
      throw new Error(
        `Ranking page ${nextPage} failed (HTTP ${response.status()}) — got ${items.length}/${participantCount} entries.`
      );
    }
    const rankingPage = parseRankingPage(await response.json());
    if (rankingPage.items.length === 0) break;
    items.push(...rankingPage.items);
    nextPage++;
  }

  if (participantCount > 0 && items.length < participantCount) {
    throw new Error(
      `Incomplete standing: ${items.length}/${participantCount} entries — refusing to write a partial snapshot.`
    );
  }

  return assembleStanding(items, caps.subleague[0]?.body);
}

async function scrapeMatches(page: Page, env: ScraperEnv) {
  const caps = await captureApiResponses(
    page,
    env.matchesUrl,
    { matches: api.matches, teams: api.teamRankings },
    ['matches', 'teams']
  );
  const teamMap = buildTeamMap(caps.teams[0].body);
  return parseMatches(caps.matches[0].body, teamMap, todayInAmsterdam());
}

async function saveFailureArtifacts(page: Page | undefined): Promise<void> {
  if (!page || page.isClosed()) return;
  try {
    const dir = path.join(DEBUG_DIR, 'error');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'page.html'), await page.content(), 'utf8');
    await page.screenshot({ path: path.join(dir, 'page.png'), fullPage: true });
    log(`Failure artifacts saved to ${dir}/ (url: ${page.url()})`);
  } catch (err) {
    log('Could not save failure artifacts:', err);
  }
}

/** True when at least one entry in a stored snapshot carries a userId. */
function entriesHaveUserId(data: unknown): boolean {
  const entries = ((data as StandingData)?.entries ?? []) as Entry[];
  return entries.some((e) => typeof e.userId === 'number');
}

/**
 * Annotate each standing entry with the points it gained *today*
 * (Europe/Amsterdam): current total minus the total at a baseline snapshot.
 *
 * Baseline = the last snapshot from before midnight (yesterday's end). On the
 * first days of userId tracking that older snapshot has no userIds to match on,
 * so we fall back to the earliest userId-bearing snapshot of today — i.e.
 * "gained since tracking began today". Left blank only when neither exists, so
 * the screen shows a neutral dot instead of a misleading multi-day jump.
 */
async function annotateDailyGain(
  env: ScraperEnv,
  standing: StandingData
): Promise<void> {
  try {
    const db = createClient(env.supabaseUrl, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // WK 2026 runs Jun–Jul, so Amsterdam is on CEST (+02:00) the whole time.
    const startOfToday = new Date(
      `${todayInAmsterdam()}T00:00:00+02:00`
    ).toISOString();

    let baseline: { data: unknown; scraped_at: string } | null = null;
    let baselineKind = '';

    // Preferred: the most recent pre-midnight snapshot that carries userIds and
    // isn't stale (a scheduler gap shouldn't turn into a multi-day "gain").
    const prev = await db
      .from('pool_snapshots')
      .select('data, scraped_at')
      .eq('pool_id', env.poolId)
      .eq('kind', 'standing')
      .lt('scraped_at', startOfToday)
      .order('scraped_at', { ascending: false })
      .limit(5);
    if (!prev.error && prev.data) {
      for (const row of prev.data) {
        const ageHours =
          (Date.now() - new Date(row.scraped_at).getTime()) / 3_600_000;
        if (ageHours <= 30 && entriesHaveUserId(row.data)) {
          baseline = row as { data: unknown; scraped_at: string };
          baselineKind = 'yesterday';
          break;
        }
      }
    }

    // Fallback (first days of tracking): the earliest userId snapshot of today.
    // The limit must clear today's pre-userId rows (old cron runs sort first),
    // so allow a full day of 15-min snapshots plus margin.
    if (!baseline) {
      const today = await db
        .from('pool_snapshots')
        .select('data, scraped_at')
        .eq('pool_id', env.poolId)
        .eq('kind', 'standing')
        .gte('scraped_at', startOfToday)
        .order('scraped_at', { ascending: true })
        .limit(150);
      if (!today.error && today.data) {
        for (const row of today.data) {
          if (entriesHaveUserId(row.data)) {
            baseline = row as { data: unknown; scraped_at: string };
            baselineKind = 'today-start';
            break;
          }
        }
      }
    }

    if (!baseline) {
      log('No usable baseline with userIds yet — daily gain left blank.');
      return;
    }

    const baseTotals = new Map<number, number>();
    for (const e of ((baseline.data as StandingData)?.entries ?? []) as Entry[]) {
      if (typeof e.userId === 'number') baseTotals.set(e.userId, e.points);
    }

    let annotated = 0;
    for (const e of standing.entries) {
      if (typeof e.userId === 'number' && baseTotals.has(e.userId)) {
        e.roundPoints = Math.max(0, e.points - (baseTotals.get(e.userId) as number));
        annotated++;
      }
    }
    log(
      `Daily gain set for ${annotated}/${standing.entries.length} entries ` +
        `(baseline ${baseline.scraped_at}, ${baselineKind}).`
    );
  } catch (err) {
    log(
      'Daily-gain annotation failed (non-fatal):',
      err instanceof Error ? err.message : err
    );
  }
}

async function writeSnapshots(
  env: ScraperEnv,
  standingData: StandingData,
  matchesData: MatchesData
): Promise<void> {
  const db = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await db.from('pool_snapshots').insert([
    { pool_id: env.poolId, kind: 'standing', data: standingData },
    { pool_id: env.poolId, kind: 'matches', data: matchesData },
  ]);
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  // Keep the table tidy — the pages only ever read the newest row.
  const cutoff = new Date(Date.now() - env.retentionDays * 86_400_000).toISOString();
  const { error: cleanupError } = await db
    .from('pool_snapshots')
    .delete()
    .eq('pool_id', env.poolId)
    .lt('scraped_at', cutoff);
  if (cleanupError) log('Cleanup of old snapshots failed (non-fatal):', cleanupError.message);
}

async function main(): Promise<void> {
  const explicitDiscover = process.argv.includes('--discover');
  const discover = explicitDiscover || !SELECTORS_CONFIRMED;
  if (discover && !explicitDiscover) {
    log('SELECTORS_CONFIRMED is false → forcing DISCOVERY mode.');
  }

  const env = readEnv({ needSupabase: !discover });

  let browser: Browser | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const contextOptions = {
      userAgent: USER_AGENT,
      viewport: { width: 1920, height: 1080 },
      locale: 'nl-NL',
      timezoneId: 'Europe/Amsterdam',
    };

    let context: BrowserContext;
    if (fs.existsSync(STORAGE_STATE)) {
      log(`Reusing session from ${STORAGE_STATE}`);
      try {
        context = await browser.newContext({
          ...contextOptions,
          storageState: STORAGE_STATE,
        });
      } catch {
        log('Stored session was unreadable — starting clean.');
        context = await browser.newContext(contextOptions);
      }
    } else {
      context = await browser.newContext(contextOptions);
    }

    page = await context.newPage();
    await ensureLoggedIn(page, context, env);

    if (discover) {
      await discoveryDump(page, 'standing', env.standingUrl);
      await discoveryDump(page, 'matches', env.matchesUrl);
      log('──────────────────────────────────────────────────────────────');
      log('DISCOVERY COMPLETE. Next steps:');
      log('  1. Inspect scraper/debug/standing/ and scraper/debug/matches/');
      log('     (page.html, page.png, xhr.json)');
      log('  2. Fill in the TODO selectors in scraper/selectors.ts');
      log('  3. Set SELECTORS_CONFIRMED = true');
      log('  4. Run `npm run scrape`');
      log('──────────────────────────────────────────────────────────────');
      if (!explicitDiscover) {
        // Auto-fallback: make the cron fail loudly until selectors are confirmed.
        process.exitCode = 2;
      }
      return;
    }

    log('Scraping standing…');
    const standingData = await scrapeStanding(page, env);
    log(`Standing: ${standingData.entries.length} entries` +
      (standingData.poolName ? ` (pool: ${standingData.poolName})` : ''));
    await annotateDailyGain(env, standingData);

    log('Scraping matches…');
    const matchesData = await scrapeMatches(page, env);
    log(`Matches: ${matchesData.matches.length} fixture(s) for ${matchesData.date}`);

    await writeSnapshots(env, standingData, matchesData);
    log(`Snapshots written to Supabase for pool "${env.poolId}".`);
  } catch (err) {
    await saveFailureArtifacts(page);
    throw err;
  } finally {
    await browser?.close();
  }
}

main().catch((err) => {
  console.error('\n✖ Scrape failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
