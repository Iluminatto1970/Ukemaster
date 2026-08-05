-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Supabase Schema
-- Execute tudo no Supabase Dashboard → SQL Editor (2 cliques, sem setup)
--
-- Regra: os dados são ABERTOS (acervo público), então as políticas RLS
-- permitem leitura/escrita anônima. Só `leads` é insert-only.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) LEADS (banco de leads capturados no cadastro/paywall) ────────
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  whatsapp text,
  source text
);

-- ── 2) SONGS (acervo público — todos publicam e todos veem) ─────────
create table if not exists public.songs (
  id text primary key,
  title text not null,
  artist text not null,
  key text,
  tempo integer,
  strumming_pattern text,
  youtube_url text,
  youtube_id text,
  content text,
  simplified_content text,
  difficulty text,
  category text,
  tags jsonb default '[]'::jsonb,
  seo_description text,
  hashtags jsonb default '[]'::jsonb,
  votes integer not null default 0,
  created_at text not null,
  updated_at text not null
);

-- Se a tabela songs JÁ existia (antes desta migração), garante a coluna votes
-- (o create table if not exists acima não altera tabelas existentes).
alter table public.songs add column if not exists votes integer not null default 0;

-- ── 2b) SONG_VOTES (1 voto por usuário por música) ────────────────────
-- PK composta (song_id + user_id) garante que cada usuário vota UMA vez.
-- user_id = id do Clerk quando logado, ou um id de dispositivo (guest) para
-- visitantes. Contagem agregada vive em songs.votes (cache para ordenação).
create table if not exists public.song_votes (
  song_id text not null references public.songs(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (song_id, user_id)
);

-- ── 3) PLAYLISTS (listas públicas da comunidade) ────────────────────
create table if not exists public.playlists (
  id text primary key,
  title text not null,
  description text,
  song_ids jsonb default '[]'::jsonb,
  category text,
  difficulty text,
  created_at text not null
);

-- ── 4) REPERTOIRES (individual por usuário; is_public = comunidade) ─
create table if not exists public.repertoires (
  user_id text primary key,
  display_name text,
  song_ids jsonb default '[]'::jsonb,
  is_public boolean default false,
  updated_at timestamptz not null default now()
);

-- ── 5) SCRAPE_STATE (cursor do cron de plataformas) ─────────────────
create table if not exists public.scrape_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.scrape_state enable row level security;
drop policy if exists "scrape_state_all" on public.scrape_state;
create policy "scrape_state_all" on public.scrape_state
  for all using (true) with check (true);

-- ── 6) CRON_IMPORTS (histórico anti-duplicidade do cron) ─────────────
-- Registra cada música importada pelo cron (chave normalizada "titulo|artista").
-- O cron NUNCA reimporta uma música que já consta aqui — mesmo que a tabela
-- songs esteja temporariamente indisponível.
create table if not exists public.cron_imports (
  song_key text primary key,
  url text,
  platform text,
  imported_at timestamptz not null default now()
);

-- ── 7) CRON_LOG (histórico das execuções do cron) ────────────────────
-- Cada artista processado vira uma linha: quanto importou, pulou (dup),
-- errou e quanto tempo levou. Permite auditar e monitorar o cron.
create table if not exists public.cron_log (
  id text primary key,
  ran_at timestamptz not null default now(),
  platform text,
  artist_url text,
  imported integer not null default 0,
  duplicates integer not null default 0,
  errors integer not null default 0,
  duration_ms integer,
  message text
);

-- ── Índices úteis ────────────────────────────────────────────────────
create index if not exists songs_artist_idx on public.songs (artist);
create index if not exists songs_title_idx on public.songs (title);
create index if not exists songs_updated_idx on public.songs (updated_at desc);
create index if not exists songs_votes_idx on public.songs (votes desc);
create index if not exists song_votes_user_idx on public.song_votes (user_id);
create index if not exists repertoires_public_idx on public.repertoires (is_public);
create index if not exists cron_log_ran_at_idx on public.cron_log (ran_at desc);
create index if not exists cron_imports_at_idx on public.cron_imports (imported_at desc);

-- ── Segurança (RLS) ─────────────────────────────────────────────────
alter table public.leads enable row level security;
alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.repertoires enable row level security;
alter table public.cron_imports enable row level security;
alter table public.cron_log enable row level security;
alter table public.song_votes enable row level security;

-- leads: qualquer um pode INSERIR (captura de lead), ninguém lê via anon
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads
  for insert with check (true);

-- songs/playlists/repertoires: dados abertos → leitura e escrita anônimas
drop policy if exists "songs_all" on public.songs;
create policy "songs_all" on public.songs
  for all using (true) with check (true);

drop policy if exists "playlists_all" on public.playlists;
create policy "playlists_all" on public.playlists
  for all using (true) with check (true);

drop policy if exists "repertoires_all" on public.repertoires;
create policy "repertoires_all" on public.repertoires
  for all using (true) with check (true);

drop policy if exists "cron_imports_all" on public.cron_imports;
create policy "cron_imports_all" on public.cron_imports
  for all using (true) with check (true);

drop policy if exists "cron_log_all" on public.cron_log;
create policy "cron_log_all" on public.cron_log
  for all using (true) with check (true);

drop policy if exists "song_votes_all" on public.song_votes;
create policy "song_votes_all" on public.song_votes
  for all using (true) with check (true);
