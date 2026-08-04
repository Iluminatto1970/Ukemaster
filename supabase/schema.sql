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
  created_at text not null,
  updated_at text not null
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

-- ── Índices úteis ────────────────────────────────────────────────────
create index if not exists songs_artist_idx on public.songs (artist);
create index if not exists songs_title_idx on public.songs (title);
create index if not exists songs_updated_idx on public.songs (updated_at desc);
create index if not exists repertoires_public_idx on public.repertoires (is_public);

-- ── Segurança (RLS) ─────────────────────────────────────────────────
alter table public.leads enable row level security;
alter table public.songs enable row level security;
alter table public.playlists enable row level security;
alter table public.repertoires enable row level security;

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
