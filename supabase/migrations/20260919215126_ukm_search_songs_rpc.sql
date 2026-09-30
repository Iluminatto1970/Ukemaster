-- Restaurada do histórico do banco (aplicada em 2026-09-19)
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

grant execute on function public.search_songs(text, integer, integer) to anon, authenticated;
