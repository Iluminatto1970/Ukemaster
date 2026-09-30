-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Bugfix do suporte de tokens: o cluster correto é por ARTISTA+string
-- normalizada (não por concat title+artist); e singletons na origem
-- (aparece 1x no acervo) podem ser corrigidos — não são 'padrão' nenhum.
create or replace function public.ukm_new_accented_tokens_supported(candidato text, origem text)
returns boolean
language plpgsql
stable
set search_path = public, extensions
as $body$
declare
  t text;
  novo bool;
  v_norm_c text := public.ukm_norm(candidato);
  v_cluster int;
begin
  -- Tamanho do cluster: linhas do MESMO artista (se houver) com a mesma
  -- string normalizada; senão, linhas com o mesmo título normalizado.
  select count(*)::int into v_cluster
  from public.songs s
  where (exists (
          select 1 from public.songs o
          where public.ukm_norm(o.artist) = v_norm_c and o.artist = origem
          limit 1
        )
        and public.ukm_norm(s.artist) = v_norm_c)
     or (not exists (
          select 1 from public.songs o
          where public.ukm_norm(o.artist) = v_norm_c and o.artist = origem
          limit 1
        )
        and public.ukm_norm(s.title) = v_norm_c);

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
            -- fora do cluster por artista (se o cluster é por artista)
            (public.ukm_norm(s.artist) <> v_norm_c)
            or
            -- ou fora do cluster por título
            (public.ukm_norm(s.title) <> v_norm_c and public.ukm_norm(s.artist) <> v_norm_c)
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
