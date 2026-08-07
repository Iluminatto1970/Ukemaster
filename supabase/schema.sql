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
  medium_content text,
  difficulty text,
  category text,
  lang text,
  tags jsonb default '[]'::jsonb,
  seo_description text,
  hashtags jsonb default '[]'::jsonb,
  votes integer not null default 0,
  views integer not null default 0,
  created_at text not null,
  updated_at text not null
);

-- Se a tabela songs JÁ existia (antes desta migração), garante as colunas
-- votes e views (o create table if not exists acima não altera tabelas
-- existentes).
alter table public.songs add column if not exists votes integer not null default 0;
alter table public.songs add column if not exists views integer not null default 0;
alter table public.songs add column if not exists medium_content text;
alter table public.songs add column if not exists lang text;

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
  repaired integer not null default 0,
  duration_ms integer,
  message text,
  worker text
);

-- Se a tabela cron_log JÁ existia (migração antiga), garante a coluna worker
alter table public.cron_log add column if not exists worker text;

-- ── 8) AFFILIATE_LINKS (anúncios de afiliado — Mercado Livre, Shopee...) ──
-- Links de afiliado do proprietário (importados por TXT na área admin).
-- Leitura pública (aparecem no site como cards "Patrocinado"); escrita
-- pelo admin (mesma chave do app, RLS aberto como o resto do acervo).
create table if not exists public.affiliate_links (
  id text primary key,
  title text not null,
  url text not null,
  store text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── 9) PARTNER_LINKS (parceiros — vídeos, cursos, links) ────────────────
-- Conteúdo de parceiros do proprietário (importado por TXT/área admin):
-- vídeos do YouTube, cursos e links úteis. Mesma política de acesso.
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

-- ── 10) BLOG_POSTS (artigos do proprietário — SEO + afiliados) ───────────
-- Posts gerenciados na área admin; publicados aparecem na aba Blog.
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

-- ── 11) SONG_COMMENTS (comunidade por música) ────────────────────────────
-- Fórum leve: qualquer visitante pode comentar (mesma política do leads).
create table if not exists public.song_comments (
  id text primary key,
  song_id text not null,
  author_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists song_comments_song_idx on public.song_comments (song_id);

-- ── 12) VIDEO_REQUESTS ("Pedir videoaula") ───────────────────────────────
-- Pedidos de aula do público (nome/e-mail/WhatsApp + música desejada).
create table if not exists public.video_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text,
  song text,
  message text,
  created_at timestamptz not null default now()
);

-- ── 13) SONG_FEEDBACK ("Corrigir letra/cifra" — colaboração da comunidade) ─
create table if not exists public.song_feedback (
  id uuid primary key default gen_random_uuid(),
  song_id text,
  song_title text,
  name text,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);

-- ── 14) WORKER_COMMANDS (rodada imediata nas máquinas via painel admin) ──
-- Fila de comandos que o painel admin (ou scripts) grava e que o bundle do
-- cron (ukemaster-cron.mjs) consulta no INÍCIO de cada execução nas máquinas
-- locais (Acer/Desktop — Linux Mint). Assim o dono dispara uma rodada agora,
-- sem esperar o agendamento de 30 min.
--
-- Campos:
--   command         'run' (futuro: 'pause', 'platform'...)
--   platform_id     plataforma específica (ex.: 'cifraclub-br') ou NULL = todas
--   artist_url      artista específico ou NULL = fila normal
--   update_existing re-scrapeia e atualiza o que já temos (checkbox do painel)
--   target          'acer' | 'desktop' | 'all' (nome do CRON_WORKER_NAME)
--   status          pending → processing → done | failed | canceled
--   worker          quem pegou o comando (CRON_WORKER_NAME ou hostname)
--   picked_at/finished_at  tempos de pega/conclusão
--   result          resumo textual do resultado (ex.: "+12 novas, 0 err")
create table if not exists public.worker_commands (
  id uuid primary key default gen_random_uuid(),
  command text not null default 'run',
  platform_id text,
  artist_url text,
  update_existing boolean not null default false,
  target text not null default 'all',
  status text not null default 'pending',
  worker text,
  created_at timestamptz not null default now(),
  picked_at timestamptz,
  finished_at timestamptz,
  result text
);
create index if not exists worker_commands_status_idx on public.worker_commands (status, created_at);

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
alter table public.affiliate_links enable row level security;
alter table public.partner_links enable row level security;
alter table public.blog_posts enable row level security;
alter table public.song_comments enable row level security;
alter table public.video_requests enable row level security;
alter table public.worker_commands enable row level security;
alter table public.song_feedback enable row level security;

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

drop policy if exists "affiliate_links_all" on public.affiliate_links;
create policy "affiliate_links_all" on public.affiliate_links
  for all using (true) with check (true);

drop policy if exists "partner_links_all" on public.partner_links;
create policy "partner_links_all" on public.partner_links
  for all using (true) with check (true);

drop policy if exists "blog_posts_all" on public.blog_posts;
create policy "blog_posts_all" on public.blog_posts
  for all using (true) with check (true);

-- song_comments: leitura pública + qualquer um pode COMENTAR (insert-only,
-- mesmo modelo do leads — ninguém edita/exclui comentário alheio via anon)
drop policy if exists "song_comments_select" on public.song_comments;
create policy "song_comments_select" on public.song_comments
  for select using (true);

drop policy if exists "song_comments_insert" on public.song_comments;
create policy "song_comments_insert" on public.song_comments
  for insert with check (true);

-- video_requests: INSERT anônimo (captura de pedido); leitura restrita
-- (só o admin logado via management). Mesmo modelo do leads.
drop policy if exists "video_requests_insert" on public.video_requests;
create policy "video_requests_insert" on public.video_requests
  for insert with check (true);

-- song_feedback: INSERT anônimo (colaboração); leitura restrita.
drop policy if exists "song_feedback_insert" on public.song_feedback;
create policy "song_feedback_insert" on public.song_feedback
  for insert with check (true);
