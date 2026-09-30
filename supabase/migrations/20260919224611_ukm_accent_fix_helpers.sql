-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Salvaguarda semântica final: cada token acentuado NOVO do candidato
-- precisa existir acentuado no acervo FORA do cluster da mesma string
-- normalizada (bloqueia erros ortográficos confinados a um cluster).
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
begin
  foreach t in array regexp_split_to_array(normalize(candidato, nfc), '\s+') loop
    if t = '' then continue; end if;
    novo := (position(public.ukm_immutable_unaccent(t) in public.ukm_immutable_unaccent(normalize(origem, nfc))) = 0);
    if novo and t <> public.ukm_immutable_unaccent(t) then
      -- token novo + acentuado: precisa existir acentuado fora do cluster
      if not exists (
        select 1 from public.songs s
        where (s.title ilike '% ' || t || ' %'
            or s.title ilike t || ' %'
            or s.title ilike '% ' || t
            or s.artist ilike '% ' || t || ' %'
            or s.artist ilike t || ' %'
            or s.artist ilike '% ' || t)
          and public.ukm_norm(coalesce(s.title, '') || ' ' || coalesce(s.artist, '')) <> v_norm_c
        limit 1
      ) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$body$;

-- Dupla checagem com as 3 salvaguardas (prefixo de acentos + suporte de tokens novos).
create or replace function public.ukm_is_accent_upgrade(origem text, candidato text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select public.ukm_norm(origem) = public.ukm_norm(candidato)
    and normalize(origem, nfc) is distinct from normalize(candidato, nfc)
    and lower(candidato) is distinct from lower(origem)
    and candidato <> lower(candidato)
    and candidato <> public.ukm_immutable_unaccent(candidato)
    and length(candidato) >= length(origem) - 4
    and public.ukm_preserves_origem_accents(origem, candidato)
    and public.ukm_new_accented_tokens_supported(candidato, origem)
    and exists (
      select 1 from public.songs s
        where (s.artist = candidato or s.title = candidato)
          and s.id like 'scraped-%'
    );
$$;
