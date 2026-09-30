-- Restaurada do histórico do banco (aplicada em 2026-09-19)
create or replace function public.ukm_apply_accent_fixes(
  p_max    integer default 5000,
  p_id_max text    default 'scraped-9999999999999'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $body$
declare
  v_target text;
  v_fixes  jsonb := '[]'::jsonb;
  v_applied integer := 0;
  r record;
  v_n      integer;
  v_cutoff constant integer := 3;
begin
  -- Modo DRY-RUN: p_max = 0 planeja mas não aplica.
  if p_max is null or p_max < 0 then
    p_max := 0;
  end if;

  for r in
    select s.id,
           coalesce(s.artist, '') as artist_raw,
           coalesce(s.title, '')  as title_raw
    from public.songs s
    where s.id like 'scraped-%'
      and s.id < p_id_max
      and (s.artist is not null or s.title is not null)
  loop
    -- Artista já correto? pula
    if public.ukm_norm(r.artist_raw) = r.artist_raw then
      v_target := r.title_raw;
    else
      v_target := public.ukm_restore_accents(r.artist_raw);
      -- Só mexe se melhorou E a forma nova não está 'pior' que a antiga
      if v_target is distinct from r.artist_raw
         and public.ukm_norm(v_target) = public.ukm_norm(r.artist_raw)
         and (r.artist_raw = '' or (
              public.ukm_is_accent_upgrade(r.artist_raw, v_target))) then
        v_fixes := v_fixes || jsonb_build_object(
          'id', r.id, 'campo', 'artist',
          'de', r.artist_raw, 'para', v_target
        );
        if p_max > 0 and v_applied < p_max then
          update public.songs set artist = v_target where id = r.id;
          v_applied := v_applied + 1;
        end if;
      end if;
    end if;

    -- Título
    if r.title_raw <> '' then
      v_target := public.ukm_restore_accents(r.title_raw);
      if v_target is distinct from r.title_raw
         and public.ukm_norm(v_target) = public.ukm_norm(r.title_raw)
         and public.ukm_is_accent_upgrade(r.title_raw, v_target) then
        v_fixes := v_fixes || jsonb_build_object(
          'id', r.id, 'campo', 'title',
          'de', r.title_raw, 'para', v_target
        );
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
    'planned', jsonb_array_length(v_fixes),
    'applied', v_applied,
    'fixes',   v_fixes
  );
end;
$body$;

grant execute on function public.ukm_apply_accent_fixes(integer, text) to anon, authenticated;
