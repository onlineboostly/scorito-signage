-- Scorito signage: snapshot storage.
-- Run this once in the Supabase SQL editor.

create table pool_snapshots (
  id bigint generated always as identity primary key,
  pool_id text not null,
  kind text not null check (kind in ('standing', 'matches')),
  data jsonb not null,
  scraped_at timestamptz not null default now()
);

create index on pool_snapshots (pool_id, kind, scraped_at desc);

-- RLS: the pages read with the anon key; writes happen only via the
-- service role key (which bypasses RLS), so no insert/update policy exists.
alter table pool_snapshots enable row level security;

create policy "anon can read snapshots"
  on pool_snapshots
  for select
  to anon
  using (true);
