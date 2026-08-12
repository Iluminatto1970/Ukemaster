-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — MIGRAÇÃO do que FALTA aplicar (gerado pelo QA 2026-08-06)
-- Idempotente: pode rodar quantas vezes quiser (create if not exists /
-- add column if not exists / drop policy + create policy).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) songs.views (coluna faltante — quebra o contador de acessos) ─
alter table public.songs add column if not exists views integer not null default 0;

-- ── 2) SONG_COMMENTS (comunidade por música) ────────────────────────
create table if not exists public.song_comments (
  id text primary key,
  song_id text not null,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists song_comments_song_idx on public.song_comments (song_id);
alter table public.song_comments enable row level security;
drop policy if exists "song_comments_select" on public.song_comments;
create policy "song_comments_select" on public.song_comments
  for select using (true);
drop policy if exists "song_comments_insert" on public.song_comments;
create policy "song_comments_insert" on public.song_comments
  for insert with check (true);

-- ── 3) AFFILIATE_LINKS (anúncios de afiliado) ───────────────────────
create table if not exists public.affiliate_links (
  id text primary key,
  title text not null,
  url text not null,
  store text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.affiliate_links enable row level security;
drop policy if exists "affiliate_links_all" on public.affiliate_links;
create policy "affiliate_links_all" on public.affiliate_links
  for all using (true) with check (true);

-- ── 4) PARTNER_LINKS (parceiros — vídeos, cursos, links) ────────────
create table if not exists public.partner_links (
  id text primary key,
  type text not null default 'link', -- 'youtube' | 'course' | 'link'
  title text not null,
  url text not null,
  description text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.partner_links enable row level security;
drop policy if exists "partner_links_all" on public.partner_links;
create policy "partner_links_all" on public.partner_links
  for all using (true) with check (true);

-- ── 5) BLOG_POSTS (artigos do proprietário) ─────────────────────────
create table if not exists public.blog_posts (
  id text primary key,
  title text not null,
  excerpt text,
  content text not null,
  category text,
  tags jsonb default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_posts enable row level security;
drop policy if exists "blog_posts_all" on public.blog_posts;
create policy "blog_posts_all" on public.blog_posts
  for all using (true) with check (true);

-- ── 6) VIDEO_REQUESTS ("Pedir videoaula") ───────────────────────────
create table if not exists public.video_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text,
  song text,
  message text,
  created_at timestamptz not null default now()
);
alter table public.video_requests enable row level security;
drop policy if exists "video_requests_insert" on public.video_requests;
create policy "video_requests_insert" on public.video_requests
  for insert with check (true);

-- ── 7) SONG_FEEDBACK ("Corrigir letra/cifra") ───────────────────────
create table if not exists public.song_feedback (
  id uuid primary key default gen_random_uuid(),
  song_id text,
  song_title text,
  name text,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.song_feedback enable row level security;
drop policy if exists "song_feedback_insert" on public.song_feedback;
create policy "song_feedback_insert" on public.song_feedback
  for insert with check (true);

-- ── 8) Índices que dependem das colunas novas ───────────────────────
create index if not exists songs_artist_idx on public.songs (artist);
create index if not exists songs_title_idx on public.songs (title);
create index if not exists songs_updated_idx on public.songs (updated_at desc);
create index if not exists songs_votes_idx on public.songs (votes desc);
