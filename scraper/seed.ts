/**
 * Seeds Supabase with realistic test snapshots so both pages render without
 * running the real scraper. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (and optionally POOL_ID) in .env.local.
 *
 *   npm run seed
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { MatchesData, StandingData } from '../lib/types';
import { todayInAmsterdam } from './extract';

config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const poolId = process.env.POOL_ID ?? 'wk2026';

if (!url || !key) {
  console.error(
    'Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY — set them in .env.local (see .env.example).'
  );
  process.exit(1);
}

// 18 entries on purpose: exercises the auto-pagination (2 pages of 9).
const standing: StandingData = {
  poolName: 'Bisharp WK-poule 2026',
  entries: [
    { rank: 1, name: 'Ruben', points: 1187, movement: 2 },
    { rank: 2, name: 'Sanne', points: 1184, movement: -1 },
    { rank: 3, name: 'Daan', points: 1179, movement: -1 },
    { rank: 4, name: 'Lisa', points: 1164, movement: 0 },
    { rank: 5, name: 'Tom', points: 1151, movement: 3 },
    { rank: 6, name: 'Femke', points: 1149, movement: -1 },
    { rank: 7, name: 'Bas', points: 1140, movement: 1 },
    { rank: 8, name: 'Anouk', points: 1138, movement: -2 },
    { rank: 9, name: 'Jeroen', points: 1121, movement: -1 },
    { rank: 10, name: 'Mark', points: 1117, movement: 0 },
    { rank: 11, name: 'Inge', points: 1102, movement: 4 },
    { rank: 12, name: 'Pieter', points: 1095, movement: -1 },
    { rank: 13, name: 'Esther', points: 1090, movement: -1 },
    { rank: 14, name: 'Joost', points: 1076, movement: -1 },
    { rank: 15, name: 'Nina', points: 1062, movement: -1 },
    { rank: 16, name: 'Wouter', points: 1041, movement: 0 },
    { rank: 17, name: 'Carlijn', points: 1018, movement: 0 },
    { rank: 18, name: 'Stef', points: 987, movement: 0 },
  ],
};

const matches: MatchesData = {
  date: todayInAmsterdam(),
  matches: [
    { kickoff: '15:00', home: 'Nederland', away: 'Japan', homeScore: 2, awayScore: 1, status: 'final' },
    { kickoff: '17:00', home: 'Duitsland', away: 'Ecuador', homeScore: 0, awayScore: 3, status: 'final' },
    { kickoff: '18:00', home: 'Frankrijk', away: 'Senegal', homeScore: 1, awayScore: 1, status: 'live' },
    { kickoff: '20:00', home: 'Spanje', away: 'Zuid-Korea', status: 'scheduled' },
    { kickoff: '21:00', home: 'Argentinië', away: 'Marokko', status: 'scheduled' },
    { kickoff: '21:00', home: 'Brazilië', away: 'Noorwegen', status: 'scheduled' },
  ],
};

async function main() {
  const db = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await db.from('pool_snapshots').insert([
    { pool_id: poolId, kind: 'standing', data: standing },
    { pool_id: poolId, kind: 'matches', data: matches },
  ]);
  if (error) {
    console.error('Seed insert failed:', error.message);
    process.exit(1);
  }

  console.log(`Seeded pool "${poolId}" with a test standing (18 entries) and ${matches.matches.length} matches.`);
  console.log(`Open http://localhost:3000/${poolId}/stand and /${poolId}/wedstrijden`);
}

main();
