-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Busca de ARTISTAS + RLS do dicionário de acordes
-- Supõe a stack ukm_* já aplicada (migrations 20260919_*: ukm_norm,
-- search_songs, índices songs_norm_artist_idx / songs_artist_trgm_lower_idx).
--
-- Aplica o que faltava (probes de 2026-09-29, chave publishable):
--   * RPC search_artists          → 404 (não existia)
--   * chord_dictionary anon INSERT → 401 (RLS sem política de escrita)
--   * songs grants de UPDATE/DELETE para anon abertos (RLS bloqueava,
--     mas os grants sobreviveram) → fechados aqui + policies explícitas
--
-- NÃO redefine ukm_norm / ukm_immutable_unaccent (parâmetro 'term', já
-- vivos) — recriar causaria erro 42P13 de mudança de nome de parâmetro.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) RPC search_artists ───────────────────────────────────────────
-- Artistas distintos do acervo (~394 mil músicas) com contagem real,
-- dedupe por forma normalizada (ukm_norm), ranqueados: igual ao termo >
-- começa com > soa como > resto; depois por nº de músicas.
--
-- Padrão da casa (migrations 20260919_*): search_path inclui extensions
-- (unaccent); SECURITY DEFINER para leitura garantida pelo anon; lim
-- clamp 1..50 (mesma régua da search_songs).
create or replace function public.search_artists(
  q   text    default '',
  lim integer default 20
)
returns table (
  artist      text,
  songs_count bigint
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $body$
declare
  v_norm text := public.ukm_norm(coalesce(q, ''));
begin
  lim := least(greatest(coalesce(lim, 20), 1), 50);

  return query
  with ag as (
    select
      public.ukm_norm(s.artist) as norm,
      min(s.artist)             as display,
      count(*)                  as cnt
    from public.songs s
    where s.artist is not null
      and btrim(s.artist) <> ''
    group by public.ukm_norm(s.artist)
  ),
  matched as (
    select ag.norm, ag.display, ag.cnt
    from ag
    where v_norm = ''
       or ag.norm = v_norm
       or ag.norm like v_norm || '%'
       or ag.norm % v_norm
  )
  select
    m.display::text,
    m.cnt::bigint
  from matched m
  order by
    case
      when v_norm = '' then 1
      when m.norm = v_norm then 0
      when m.norm like v_norm || '%' then 1
      else 2
    end,
    m.cnt desc,
    m.display asc
  limit lim;
end;
$body$;

grant execute on function public.search_artists(text, integer) to anon, authenticated;

-- ── 2) RLS do chord_dictionary ──────────────────────────────────────
-- O app faz UPSERT de acordes gerados no cliente
-- (chordCache.schedulePersistGeneratedChords) e o PostgREST devolvia
-- 401 "new row violates row-level security policy".
--
-- Modelo (mesmo espírito do acervo):
--   * Leitura pública: o dicionário enriquece a UI de qualquer visitante.
--   * Escrita aberta (insert/update): acordes são gerados pelo motor
--     determinístico do cliente e compartilhados entre dispositivos —
--     conteúdo técnico sem dado de usuário (PK = nome do acorde).
--   * DELETE exclusivo do admin (mesmo padrão de songs_delete_admin).
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

-- ── 3) songs: grants fechados ao anon + policies explícitas ─────────
-- RLS já exigia login (INSERT anon dava 401), mas os GRANTS de
-- UPDATE/DELETE continuavam abertos para anon (PATCH devolvia 204 vazio)
-- e a policy legada songs_all dava a usuários autenticados qualquer
-- UPDATE/DELETE. Aqui: grants revogados do anon e policies explícitas —
--   SELECT  → público (anon + authenticated)          [acervo aberto]
--   INSERT/UPDATE → só autenticados (contribuir com login)
--   DELETE  → só o admin (e-mail no JWT da sessão)
--
-- ⚠️ Pré-requisito: o cron de scraping deve escrever autenticado como a
-- conta UkeMaster (CRON_UKEMATER_EMAIL/PASSWORD nas máquinas e na Vercel,
-- ver CRON_DEPLOYMENT.md). Sem isso ele degrada para a anon key e falha.
revoke insert, update, delete on public.songs from anon;
grant select on public.songs to anon, authenticated;
grant insert, update, delete on public.songs to authenticated;

-- Derrota TODAS as policies atuais de public.songs (podem ter sido criadas
-- fora do CLI, com nomes desconhecidos; RLS combina policies com OR).
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

-- ── VERIFICAÇÃO (rodar depois, no SQL Editor ou db query --linked) ──
--   SELECT * FROM search_artists('clapton', 5);           -- contagens reais
--   SELECT * FROM search_artists('', 10);                 -- top 10 geral
--   SELECT policyname, cmd FROM pg_policies
--    WHERE tablename IN ('songs','chord_dictionary')
--    ORDER BY tablename, cmd;
-- Pelo app (chave publishable):
--   POST rpc/search_artists {q,lim}   → 200
--   POST chord_dictionary (anon)      → 201
--   PATCH songs (anon)                → 401/403 (grant revogado)
--   POST rpc/search_songs {q,lim,off} → 200 (intacta)
-- ═══════════════════════════════════════════════════════════════════
