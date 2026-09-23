-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — RPC search_artists
--
-- Busca de ARTISTAS no acervo completo (~62 mil músicas) direto no banco.
-- Complementa search_songs (que busca músicas): a lista de artistas do
-- SongList hoje só enxerga os artistas das músicas carregadas em memória.
--
-- Retorna artistas distintos (normalizados) com contagem de músicas,
-- ranqueados: prefixo exato > contém > outros, depois por nº de músicas.
--
-- Requer a extensão pg_trgm + índice GIN em songs.ukm_artist_norm
-- (mesma infraestrutura da search_songs — se ela existe, isto funciona).
-- Idempotente: drop + create.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

drop function if exists public.search_artists(text, integer);

create or replace function public.search_artists(
  q text,
  lim integer default 20
)
returns table (
  artist text,
  songs_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      s.ukm_artist_norm as artist_norm,
      min(s.artist)     as artist_display
    from public.songs s
    where s.ukm_artist_norm is not null
      and s.ukm_artist_norm <> ''
  ),
  filtered as (
    select b.artist_norm, b.artist_display
    from base b
    where q is null or trim(q) = ''
       or b.artist_norm % ukm_norm(trim(q))
       or b.artist_norm like ukm_norm(trim(q)) || '%'
  )
  select
    coalesce(f.artist_display, f.artist_norm) as artist,
    count(*)::bigint                          as songs_count
  from public.songs s
  join filtered f on f.artist_norm = s.ukm_artist_norm
  group by f.artist_norm, f.artist_display
  order by
    -- ranking: começa com o termo > contém > resto; depois popularidade
    case
      when trim(q) = '' then 1
      when lower(f.artist_display) like lower(trim(q)) || '%' then 0
      when f.artist_norm like ukm_norm(trim(q)) || '%' then 1
      else 2
    end,
    songs_count desc,
    artist asc
  limit least(coalesce(lim, 20), 50);
$$;

grant execute on function public.search_artists(text, integer) to anon, authenticated;

-- VERIFICAÇÃO:
--   select * from search_artists('clapton', 5);
--   select * from search_artists('', 10);  -- top 10 geral
