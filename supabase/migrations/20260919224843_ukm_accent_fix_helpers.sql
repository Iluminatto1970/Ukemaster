-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Cluster por ARTISTA NORMALIZADO (os jobs do scraper criam job_ids
-- distintos, mas o artista é o mesmo).
create or replace function public.ukm_new_accented_tokens_supported(candidato text, origem text)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $body$
declare
  t text;
  novo bool;
  v_norm_c  text := public.ukm_norm(candidato);
  v_artist  text;
  v_own     int;
begin
  -- Artista normalizado do registro de origem (se existir no acervo).
  select public.ukm_norm(o.artist) into v_artist
  from public.songs o
  where o.artist = origem or o.title = origem
  limit 1;

  if v_artist is not null then
    select count(*)::int into v_own
    from public.songs s
    where public.ukm_norm(s.artist) = v_artist
      and (public.ukm_norm(s.title) = v_norm_c or public.ukm_norm(s.artist) = v_norm_c);
  else
    select count(*)::int into v_own
    from public.songs s
    where public.ukm_norm(s.title) = v_norm_c;
  end if;

  foreach t in array regexp_split_to_array(normalize(candidato, nfc), '\s+') loop
    if t = '' then continue; end if;
    novo := (position(public.ukm_immutable_unaccent(t) in public.ukm_immutable_unaccent(normalize(origem, nfc))) = 0);
    if novo and t <> public.ukm_immutable_unaccent(t) then
      if not exists (
        select 1 from public.songs s
        where (s.title ilike '% ' || t || ' %'
            or s.title ilike t || ' %'
            or s.title ilike '% ' || t
            or s.artist ilike '% ' || t || ' %'
            or s.artist ilike t || ' %'
            or s.artist ilike '% ' || t)
          and (
            (v_artist is not null and public.ukm_norm(s.artist) is distinct from v_artist)
            or
            (v_artist is null and public.ukm_norm(s.title) is distinct from v_norm_c)
          )
        limit 1
      ) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$body$;
