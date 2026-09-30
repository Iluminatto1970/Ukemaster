-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Correção: remove o early-return incorreto (texto SEM acento é justamente
-- o candidato a restauração; o guard impedia o caso principal).
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
           (candidate <> public.ukm_immutable_unaccent(candidate)) as tem_acento
    from (
      select distinct artist as candidate from public.songs
        where artist is not null and public.ukm_norm(artist) = v_norm
          and artist is distinct from txt
      union
      select distinct title as candidate from public.songs
        where title is not null and public.ukm_norm(title) = v_norm
          and title is distinct from txt
    ) c
  loop
    -- Apenas variantes COM acento competem (nunca desacentua);
    -- a forma majoritária no acervo vence.
    if r.tem_acento
       and (r.freq > v_best_count or v_best is null) then
      v_best_count := r.freq;
      v_best       := r.candidate;
    end if;
  end loop;

  return coalesce(v_best, txt);
end;
$body$;
