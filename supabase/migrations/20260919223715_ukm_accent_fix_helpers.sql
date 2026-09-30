-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- A forma atual TAMBÉM compete; só troca se outra forma for ESTRITAMENTE
-- mais frequente (empate = manter a atual, sem flip-flop entre execuções).
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
    -- Só variantes COM acento competem; desempate lexicográfico p/ determinismo.
    if r.tem_acento
       and (v_best is null
            or r.freq > v_best_count
            or (r.freq = v_best_count and r.candidate < v_best)) then
      v_best_count := r.freq;
      v_best       := r.candidate;
    end if;
  end loop;

  -- Troca apenas se a melhor variante acentuada for ESTRITAMENTE mais
  -- frequente que a forma atual (conservador: empate mantém).
  if v_best is not null and v_best <> txt and v_best_count > v_own_count then
    return v_best;
  end if;
  return txt;
end;
$body$;
