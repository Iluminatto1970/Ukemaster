-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Refino anti-ruído:
--  1) Mudança só de caixa (Pra Você→Pra você) NÃO é correção de acento → bloqueia;
--  2) Maioria robusta: candidato precisa de ≥3 ocorrências E ≥2x a forma atual
--     (evita flip-flop em clusters divididos tipo 15 vs 11).
create or replace function public.ukm_restore_accents(txt text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $body$
declare
  v_norm       text;
  v_best       text := null;
  v_best_count integer := -1;
  v_own_count  integer := 0;
  r            record;
begin
  if txt is null or txt = '' then
    return txt;
  end if;

  v_norm := public.ukm_norm(txt);

  for r in
    select candidate,
           (select count(*)::int from public.songs s
             where public.ukm_norm(s.artist) = v_norm and s.artist = candidate)
         + (select count(*)::int from public.songs s
             where public.ukm_norm(s.title)  = v_norm and s.title = candidate) as freq,
           (candidate <> public.ukm_immutable_unaccent(candidate)) as tem_acento,
           (candidate = txt) as eh_o_proprio
    from (
      select distinct artist as candidate from public.songs
        where artist is not null and public.ukm_norm(artist) = v_norm
      union
      select distinct title as candidate from public.songs
        where title is not null and public.ukm_norm(title) = v_norm
    ) c
  loop
    if r.eh_o_proprio then
      v_own_count := r.freq;
    end if;
    if r.tem_acento
       and (v_best is null
            or r.freq > v_best_count
            or (r.freq = v_best_count and r.candidate < v_best)) then
      v_best_count := r.freq;
      v_best       := r.candidate;
    end if;
  end loop;

  -- Só troca com maioria ROBUSTA: ≥3 ocorrências e ≥2x a forma atual.
  if v_best is not null
     and v_best <> txt
     and v_best_count >= 3
     and v_best_count >= v_own_count * 2 then
    return v_best;
  end if;
  return txt;
end;
$body$;

-- Dupla checagem: bloqueia flip apenas-de-caixa (lower igual = nada de acento mudou).
create or replace function public.ukm_is_accent_upgrade(origem text, candidato text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select public.ukm_norm(origem) = public.ukm_norm(candidato)
    and candidato is distinct from origem
    and lower(candidato) is distinct from lower(origem)
    and candidato <> lower(candidato)
    and candidato <> public.ukm_immutable_unaccent(candidato)
    and length(candidato) >= length(origem) - 4
    and exists (
      select 1 from public.songs s
        where (s.artist = candidato or s.title = candidato)
          and s.id like 'scraped-%'
    );
$$;
