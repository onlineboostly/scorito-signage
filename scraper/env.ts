import { config } from 'dotenv';

// Mirror Next.js precedence: .env.local wins over .env. dotenv never
// overwrites variables that are already set (so CI secrets always win).
config({ path: '.env.local' });
config({ path: '.env' });

export type ScraperEnv = {
  email: string;
  password: string;
  standingUrl: string;
  matchesUrl: string;
  poolId: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Snapshots older than this many days are pruned after each run. */
  retentionDays: number;
};

const SCORITO_KEYS = [
  'SCORITO_EMAIL',
  'SCORITO_PASSWORD',
  'SCORITO_STANDING_URL',
  'SCORITO_MATCHES_URL',
] as const;

const SUPABASE_KEYS = [
  'POOL_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

/**
 * Read and validate env vars. Discovery mode only needs the Scorito vars;
 * a real scrape also needs Supabase.
 */
export function readEnv(opts: { needSupabase: boolean }): ScraperEnv {
  const required: readonly string[] = opts.needSupabase
    ? [...SCORITO_KEYS, ...SUPABASE_KEYS]
    : SCORITO_KEYS;

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Set them in .env.local (local runs) or as repository secrets (GitHub Actions). See .env.example.'
    );
  }

  return {
    email: process.env.SCORITO_EMAIL ?? '',
    password: process.env.SCORITO_PASSWORD ?? '',
    standingUrl: process.env.SCORITO_STANDING_URL ?? '',
    matchesUrl: process.env.SCORITO_MATCHES_URL ?? '',
    poolId: process.env.POOL_ID ?? 'wk2026',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    retentionDays: Number(process.env.RETENTION_DAYS ?? 7),
  };
}
