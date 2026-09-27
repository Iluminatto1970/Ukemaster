-- ═══════════════════════════════════════════════════════════════════════
-- UKE MASTER PRO — MIGRAÇÃO COMPLETA (arquivo ÚNICO)
-- Execute no Supabase Dashboard → SQL Editor, do topo ao fim, de uma vez.
-- IDEMPOTENTE: pode rodar quantas vezes quiser sem quebrar nada.
--
-- Substitui (apagados do repo) e mantém aplicado:
--   • migration-faltantes.sql            (tabelas já existem — garantido aqui)
--   • migration-contribuidores.sql       (já aplicada — políticas reafirmadas)
--   • migration-rls-songs.sql            (já aplicada — políticas reafirmadas)
--   • migration-certificados.sql         (tabela já existe — garantida aqui)
--   • migration-chord-dictionary-rls.sql (⚠️ FALTAVA — aplica agora)
--   • migration-search-artists.sql       (⚠️ FALTAVA — reescrita e aplica)
--   • migration-ukemater-cron.sql        (⚠️ FALTAVA — aplica agora)
--
-- A RPC search_songs (busca de músicas) JÁ ESTÁ no banco e NÃO é tocada
-- aqui — recriá-la às cegas poderia desligar a busca que funciona.
--
-- Estado medido por probes em 2026-09-23 (chave publishable):
--   search_songs 200 ✅ · songs anon INSERT 401 ✅ · song_votes anon 403 ✅
--   search_artists 404 ❌ · chord_dictionary anon INSERT 401 ❌
--   songs anon UPDATE: bloqueado por RLS mas com grant aberto ❌
-- ═══════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 0 — PRÉ-REQUISITOS
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 1 — FUNÇÃO DE NORMALIZAÇÃO + BUSCA DE ARTISTAS (faltava)
--
-- ukm_norm: mesma normalização da busca viva — sem acento, minúsculas,
-- espaços colapsados. IMMUTABLE para poder indexar.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.ukm_norm(s text)
returns text
language sql
immutable
as $$
  select btrim(
    lower(
      translate(
        coalesce(s, ''),
        'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖØóòôõöøÚÙÛÜúùûüÇçÑñÝýÿ',
        'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuCcNnYyy'
      )
    ),
    ' '
  );
$$;

-- Busca de ARTISTAS no acervo completo (~394 mil músicas) direto no banco.
-- Complementa search_songs (que busca músicas): devolve artistas distintos
-- (dedupe por forma normalizada — "elvis" e "Elvis" são um só) com contagem
-- real de músicas, ranqueados: igual ao termo > começa com > soa como.
create or replace function public.search_artists(
  q   text    default '',
  lim integer default 20
)
returns table (
  artist      text,
  songs_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with ag as (
    select
      ukm_norm(s.artist) as norm,
      min(s.artist)      as display,
      count(*)           as cnt
    from public.songs s
    where s.artist is not null and btrim(s.artist) <> ''
    group by ukm_norm(s.artist)
  ),
  matched as (
    select ag.norm, ag.display, ag.cnt
    from ag
    where coalesce(btrim(q), '') = ''
       or ag.norm  = ukm_norm(btrim(q))
       or ag.norm  like ukm_norm(btrim(q)) || '%'
       or ag.norm  % ukm_norm(btrim(q))
  )
  select
    m.display            as artist,
    m.cnt::bigint        as songs_count
  from matched m
  order by
    case
      when btrim(coalesce(q, '')) = '' then 1
      when m.norm = ukm_norm(btrim(q)) then 0
      when m.norm like ukm_norm(btrim(q)) || '%' then 1
      else 2
    end,
    m.cnt desc,
    m.display asc
  limit least(coalesce(lim, 20), 50);
$$;

grant execute on function public.search_artists(text, integer) to anon, authenticated;

-- Índices que sustentam a busca de artistas (expressão indexável porque
-- ukm_norm é IMMUTABLE). Não criam lock pesado em 394k linhas? Criam —
-- rode em horário de pouca carga; é uma vez só.
create index if not exists songs_artist_norm_trgm
  on public.songs using gin (ukm_norm(artist) gin_trgm_ops);
create index if not exists songs_artist_norm_prefix
  on public.songs (ukm_norm(artist) text_pattern_ops);


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS DO CHORD_DICTIONARY (faltava — erro 401 no upsert)
--
-- O app faz UPSERT de acordes gerados no cliente
-- (chordCache.schedulePersistGeneratedChords) e o PostgREST devolvia
-- 401 "new row violates row-level security policy".
--
-- Modelo (mesmo espírito do restante do acervo):
--   * Leitura pública: o dicionário enriquece a UI de qualquer visitante.
--   * Escrita aberta (insert/update): acordes são gerados pelo motor
--     determinístico do cliente e compartilhados entre dispositivos —
--     conteúdo técnico sem dado de usuário (PK = nome do acorde).
--   * DELETE exclusivo do admin (mesmo padrão de songs_delete_admin).
-- ═══════════════════════════════════════════════════════════════════

grant select, insert, update on public.chord_dictionary to anon, authenticated;
revoke delete on public.chord_dictionary from anon;
grant delete on public.chord_dictionary to authenticated;

alter table public.chord_dictionary enable row level security;

drop policy if exists "chord_dictionary_all" on public.chord_dictionary;
drop policy if exists "chord_dictionary_select" on public.chord_dictionary;
create policy "chord_dictionary_select" on public.chord_dictionary
  for select using (true);

drop policy if exists "chord_dictionary_insert" on public.chord_dictionary;
create policy "chord_dictionary_insert" on public.chord_dictionary
  for insert with check (true);

drop policy if exists "chord_dictionary_update" on public.chord_dictionary;
create policy "chord_dictionary_update" on public.chord_dictionary
  for update using (true) with check (true);

drop policy if exists "chord_dictionary_delete_admin" on public.chord_dictionary;
create policy "chord_dictionary_delete_admin" on public.chord_dictionary
  for delete using (lower(auth.jwt() ->> 'email') = 'iluminatto@gmail.com');


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 3 — SONGS: escrita só com login (RLS já fechava, grants não)
--
-- Hoje: anon PATCH devolve 204 vazio (bloqueado por RLS) mas com grant
-- de UPDATE aberto — barulho e porta entreaberta. A partir daqui:
--   SELECT  → público (anon + authenticated)          [acervo aberto]
--   INSERT/UPDATE → só autenticados (contribuir com login)
--   DELETE  → só o admin (e-mail no JWT da sessão)
--
-- ⚠️ CONDIÇÃO para aplicar: o cron de scraping deve escrever autenticado
-- como a conta UkeMaster (env CRON_UKEMATER_EMAIL/PASSWORD nas máquinas e
-- na Vercel — ver CRON_DEPLOYMENT.md). Sem isso, o cron degrada para a
-- anon key e passa a falhar ao importar.
-- ═══════════════════════════════════════════════════════════════════

revoke insert, update, delete on public.songs from anon;
grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

-- Derrota TODAS as policies atuais de public.songs (podem ter sido criadas
-- fora das migrations, com nomes desconhecidos; RLS combina policies com OR).
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'songs'
  loop
    execute format('drop policy if exists %I on public.songs', p.policyname);
  end loop;
end $$;

alter table public.songs enable row level security;

create policy "songs_select_public" on public.songs
  for select to anon, authenticated
  using (true);

create policy "songs_insert_auth" on public.songs
  for insert to authenticated
  with check (auth.uid() is not null);

create policy "songs_update_auth" on public.songs
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

create policy "songs_delete_admin" on public.songs
  for delete to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'iluminatto@gmail.com');


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 4 — GARANTIAS DE TABELAS E COLUNAS (já aplicado, reafirmado)
-- create if not exists / add column if not exists: barato e seguro.
-- ═══════════════════════════════════════════════════════════════════

alter table public.songs add column if not exists views integer not null default 0;

create table if not exists public.song_comments (
  id text primary key,
  song_id text not null,
  author_name text not null,
  text text not null,
  user_id text,
  created_at timestamptz not null default now()
);
alter table public.song_comments add column if not exists user_id text;
create index if not exists song_comments_song_idx on public.song_comments (song_id);

create table if not exists public.affiliate_links (
  id text primary key,
  title text not null,
  url text not null,
  store text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

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

create table if not exists public.video_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text,
  song text,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.song_feedback (
  id uuid primary key default gen_random_uuid(),
  song_id text,
  song_title text,
  name text,
  email text,
  user_id text,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.song_feedback add column if not exists user_id text;

create table if not exists public.certificates (
  number text primary key,          -- UKM-2026-XXXXXX (código de verificação)
  trail_id text not null,           -- id da trilha (learningTrails.ts)
  trail_title text not null,        -- título da trilha (denormalizado)
  level text not null,              -- iniciante | intermediario | avancado
  holder_name text not null,        -- nome impresso no certificado
  issued_on text not null,          -- data de emissão (yyyy-mm-dd)
  created_at timestamptz not null default now()
);
alter table public.certificates enable row level security;
drop policy if exists "certificates_all" on public.certificates;
create policy "certificates_all" on public.certificates
  for all using (true) with check (true);

-- Índices úteis (idempotentes)
create index if not exists songs_artist_idx  on public.songs (artist);
create index if not exists songs_title_idx   on public.songs (title);
create index if not exists songs_updated_idx on public.songs (updated_at desc);
create index if not exists songs_votes_idx   on public.songs (votes desc);

-- Higiene do acervo: espaços nas bordas quebram dedupe e busca.
update public.songs set title  = btrim(title)  where title  <> btrim(title);
update public.songs set artist = btrim(artist) where artist <> btrim(artist);


-- ═══════════════════════════════════════════════════════════════════
-- PARTE 5 — VERIFICAÇÃO (rode depois de aplicar; resultados esperados)
-- ═══════════════════════════════════════════════════════════════════
--
-- 1) Funções publicadas (ambas devem listar search_artists e search_songs):
--      SELECT p.proname FROM pg_proc p
--      JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname LIKE 'search%';
--
-- 2) Busca de artistas (deve responder em ms e ranquear prefixos):
--      SELECT * FROM search_artists('clapton', 5);
--      SELECT * FROM search_artists('', 10);   -- top 10 geral
--
-- 3) Policies do acervo:
--      SELECT tablename, policyname, cmd FROM pg_policies
--      WHERE schemaname='public' AND tablename IN
--        ('songs','chord_dictionary','contributions','song_votes','playlists')
--      ORDER BY tablename, cmd;
--    Esperado em songs: songs_select_public / songs_insert_auth /
--    songs_update_auth / songs_delete_admin — e nada mais.
--
-- 4) Pelos testes do app (chave publishable):
--      GET  songs?limit=1            → 200 (leitura pública)
--      POST songs (anon)             → 401 (contribuir exige login)
--      POST chord_dictionary (anon)  → 201 (acorde novo compartilhado)
--      POST song_votes (anon)        → 403 (votar exige login)
--      rpc search_songs {q,lim,off}  → 200 (busca de músicas — intacta)
--      rpc search_artists {q,lim}    → 200 (busca de artistas — nova)
--
-- 5) Lembrete do cron: confirme CRON_UKEMATER_EMAIL/PASSWORD configurados
--    nas máquinas e na Vercel ANTES de contar com importações autenticadas.
-- ═══════════════════════════════════════════════════════════════════
