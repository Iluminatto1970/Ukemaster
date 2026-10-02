-- =====================================================================
-- UkeMaster Pro — Correção definitiva da busca (2026-09-19)
-- Aplicado no projeto Supabase `asvjdjawaenxrlwdyziy` (UkemasterPro)
-- via migrations `ukm_search_functions` + `ukm_search_songs_rpc`.
-- Diagnóstico: docs/diagnostico-busca-2026-09-19.md
--
-- Por quê: a busca do app filtrava ~500 músicas em memória de um
-- catálogo de 394 mil, com acentos inconsistentes no banco.
--
-- Nota: usamos índice GIN sobre EXPRESSÃO em vez de coluna gerada
-- (o plano original previa coluna `search_text`) porque a tabela tem
-- 685 MB — a coluna gerada forçaria rewrite completo e bloquearia o
-- cron de importação. A expressão é centralizada em ukm_song_search_text.
-- =====================================================================

-- 1) Extensões: unaccent (remove acentos) + pg_trgm (busca fuzzy/trigram)
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 2) unaccent em forma IMMUTABLE (a original é STABLE; exigência do
--    Postgres para uso em índice)
create or replace function public.ukm_immutable_unaccent(txt text)
returns text
language sql
immutable
parallel safe
set search_path = extensions, public
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, txt);
$$;

-- 3) Normalização padrão: minúsculas + sem acento + espaços colapsados
create or replace function public.ukm_norm(term text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
           regexp_replace(
             coalesce(public.ukm_immutable_unaccent(lower(term)), ''),
             '\s+', ' ', 'g'
           )
         );
$$;

-- 4) Texto pesquisável de uma música (expressão do índice GIN).
--    ASSINATURA FIXA: RPC e índice devem usar exatamente esta função.
create or replace function public.ukm_song_search_text(
  p_title    text,
  p_artist   text,
  p_category text,
  p_tags     jsonb,
  p_lang     text
)
returns text
language sql
immutable
parallel safe
as $$
  select public.ukm_norm(
    coalesce(p_title, '')    || ' ' ||
    coalesce(p_artist, '')   || ' ' ||
    coalesce(p_category, '') || ' ' ||
    coalesce(p_tags::text, '') || ' ' ||
    coalesce(p_lang, '')
  );
$$;

-- 5) Índice GIN trigram sobre a expressão normalizada (sem rewrite)
create index if not exists songs_search_trgm_idx
  on public.songs
  using gin (public.ukm_song_search_text(title, artist, category, tags, lang) gin_trgm_ops);

-- 6) RPC de busca com ranking (palavra exata > prefixo > contém),
--    multi-palavra (AND), acento-insensível, escape de LIKE.
create or replace function public.search_songs(
  q   text,
  lim integer default 30,
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
  views      integer,
  rank       real
)
language plpgsql
stable
set search_path = public, extensions
as $body$
declare
  v_norm  text := public.ukm_norm(q);
  v_words text[];
  v_expr  constant text := 'public.ukm_song_search_text(s.title, s.artist, s.category, s.tags, s.lang)';
  v_where text;
  v_sql   text;
begin
  lim := least(greatest(coalesce(lim, 30), 1), 50);
  off := greatest(coalesce(off, 0), 0);

  if v_norm is null or v_norm = '' then
    return;
  end if;

  select array_agg(distinct w)
    into v_words
  from unnest(regexp_split_to_array(v_norm, '\s+')) w
  where w <> '';

  if v_words is null then
    return;
  end if;

  select string_agg(
           v_expr || ' ilike ' || format('%L', '%' ||
             replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'),
           ' and '
         )
    into v_where
  from unnest(v_words) w;

  v_sql := format($sql$
    select s.id, s.title, s.artist, s.key, s.difficulty, s.category, s.lang, s.tags, s.votes, s.views,
           ((case
              when public.ukm_norm(s.title)  = %L            then 4
              when public.ukm_norm(s.title)  like %L         then 3
              when public.ukm_norm(s.title)  like %L         then 2
              when public.ukm_norm(s.artist) like %L         then 1.5
              else 1
            end)::real
            * (1 + least(coalesce(s.votes, 0), 100)::real / 200.0))::real as rank
    from public.songs s
    where %s
    order by rank desc, s.votes desc nulls last, s.title asc
    limit %s offset %s
  $sql$,
    v_norm,
    v_norm || '%',
    '%' || v_norm || '%',
    v_norm || '%',
    v_where,
    lim,
    off
  );

  return query execute v_sql;
end;
$body$;

-- 7) Acesso público de leitura (RLS de songs já permite SELECT a anon)
grant execute on function public.search_songs(text, integer, integer) to anon, authenticated;
