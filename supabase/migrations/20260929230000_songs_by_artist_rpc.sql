-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — RPC songs_by_artist
--
-- Lista TODAS as músicas de um artista direto do acervo (~394 mil),
-- deduplicado por forma normalizada (ukm_norm): o autocomplete de
-- artistas (search_artists) devolve a forma de EXIBIÇÃO (min(s.artist)),
-- que pode não bater letra-a-letra com as linhas individuais (ex.:
-- "Eric Clapton" no grupo vs "Eric Clapton." em alguma linha do scraping).
-- Filtrar por ukm_norm(artist) = ukm_norm(p_artist) pega o grupo inteiro.
--
-- Ordenação: votos desc (mais tocadas primeiro), título asc. Paginação
-- por offset (lim/off) com o mesmo clamp da search_songs (lim 1..50).
-- Padrão da casa (20260919_*): plpgsql, stable, security definer,
-- search_path com extensions. Usa o índice songs_norm_artist_idx
-- (btree em ukm_norm(artist)) — resposta em ms.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.songs_by_artist(
  p_artist text,
  lim integer default 50,
  off integer default 0
)
returns table (
  id         text,
  title      text,
  artist     text,
  key        text,
  difficulty text,
  category   text,
  lang       text,
  tags       jsonb,
  votes      integer,
  views      integer
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $body$
begin
  lim := least(greatest(coalesce(lim, 50), 1), 50);
  off := greatest(coalesce(off, 0), 0);

  return query
  select
    s.id::text,
    s.title::text,
    s.artist::text,
    s.key::text,
    s.difficulty::text,
    s.category::text,
    s.lang::text,
    s.tags,
    s.votes,
    s.views
  from public.songs s
  where s.artist is not null
    and public.ukm_norm(s.artist) = public.ukm_norm(coalesce(p_artist, ''))
  order by s.votes desc nulls last, s.title asc
  limit lim offset off;
end;
$body$;

grant execute on function public.songs_by_artist(text, integer, integer)
  to anon, authenticated;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────
--   SELECT count(*) FROM songs_by_artist('Eric Clapton', 50, 0);  -- 170
--   SELECT * FROM songs_by_artist('eric clapton', 5, 0);          -- idem, caixa irrelevante
--   SELECT * FROM songs_by_artist('belchior', 5, 0);              -- acento irrelevante
-- Pelo app (chave publishable):
--   POST rpc/songs_by_artist {"p_artist":"Eric Clapton","lim":5,"off":0} → 200
-- ═══════════════════════════════════════════════════════════════════
