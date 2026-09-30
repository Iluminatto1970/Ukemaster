-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Versão final: batching por faixa de id + cap de varredura + retomada.
-- p_max = 0 → DRY-RUN (planeja, não escreve). Retorna last_id p/ retomada.
create or replace function public.ukm_apply_accent_fixes(
  p_max    integer default 5000,
  p_id_max text    default 'scraped-9999999999999',
  p_id_min text    default '',
  p_scan   integer default 20000
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $body$
declare
  v_target  text;
  v_fixes   jsonb := '[]'::jsonb;
  v_planned integer := 0;
  v_applied integer := 0;
  v_scanned integer := 0;
  v_last_id text := null;
  r record;
begin
  if p_max is null or p_max < 0 then
    p_max := 0;
  end if;
  if p_scan is null or p_scan < 1 then
    p_scan := 20000;
  end if;

  for r in
    select s.id, coalesce(s.artist, '') as artist_raw, coalesce(s.title, '') as title_raw
    from public.songs s
    where s.id like 'scraped-%'
      and s.id < p_id_max
      and (p_id_min = '' or s.id > p_id_min)
    order by s.id
    limit p_scan
  loop
    v_scanned := v_scanned + 1;
    v_last_id := r.id;

    if r.artist_raw <> '' then
      v_target := public.ukm_restore_accents(r.artist_raw);
      if v_target is distinct from r.artist_raw
         and public.ukm_is_accent_upgrade(r.artist_raw, v_target) then
        v_planned := v_planned + 1;
        v_fixes := v_fixes || jsonb_build_object('id', r.id, 'campo', 'artist', 'de', r.artist_raw, 'para', v_target);
        if p_max > 0 and v_applied < p_max then
          update public.songs set artist = v_target where id = r.id;
          v_applied := v_applied + 1;
        end if;
      end if;
    end if;

    if r.title_raw <> '' then
      v_target := public.ukm_restore_accents(r.title_raw);
      if v_target is distinct from r.title_raw
         and public.ukm_is_accent_upgrade(r.title_raw, v_target) then
        v_planned := v_planned + 1;
        v_fixes := v_fixes || jsonb_build_object('id', r.id, 'campo', 'title', 'de', r.title_raw, 'para', v_target);
        if p_max > 0 and v_applied < p_max then
          update public.songs set title = v_target where id = r.id;
          v_applied := v_applied + 1;
        end if;
      end if;
    end if;

    exit when p_max > 0 and v_applied >= p_max;
  end loop;

  return jsonb_build_object(
    'dry_run', (p_max = 0),
    'scanned', v_scanned,
    'planned', v_planned,
    'applied', v_applied,
    'last_id', v_last_id,
    'fixes',   v_fixes
  );
end;
$body$;

grant execute on function public.ukm_apply_accent_fixes(integer, text, text, integer) to anon, authenticated;
