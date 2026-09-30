-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Índices funcionais para as consultas por forma normalizada (evitam full-scan)
create index if not exists songs_norm_artist_idx on public.songs (public.ukm_norm(artist));
create index if not exists songs_norm_title_idx  on public.songs (public.ukm_norm(title));

-- Restaura acentos: procura no PRÓPRIO BANCO variantes com acento da mesma
-- string normalizada e adota a forma majoritária (por contagem de linhas).
-- Regras de segurança:
--  1. Só candidatos COM acento competem (nunca desacentua);
--  2. Sem candidato → devolve o texto original (no-op);
--  3. Texto sem nada acentuável → no-op.
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

  -- Nada acentuável no texto → nada a restaurar.
  if public.ukm_immutable_unaccent(txt) = txt then
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
    -- Apenas variantes acentuadas competem; empate: mais acentuada vence.
    if r.tem_acento
       and (r.freq > v_best_count or v_best is null) then
      v_best_count := r.freq;
      v_best       := r.candidate;
    end if;
  end loop;

  return coalesce(v_best, txt);
end;
$body$;

-- Dupla checagem antes de escrever: mesma forma normalizada, não encolhe
-- demais, não fica tudo-minúscula, forma destino É acentuada e já existe
-- no acervo (não inventa dado novo).
create or replace function public.ukm_is_accent_upgrade(origem text, candidato text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select public.ukm_norm(origem) = public.ukm_norm(candidato)
    and candidato is distinct from origem
    and candidato <> lower(candidato)
    and candidato <> public.ukm_immutable_unaccent(candidato)
    and length(candidato) >= length(origem) - 4
    and exists (
      select 1 from public.songs s
        where (s.artist = candidato or s.title = candidato)
          and s.id like 'scraped-%'
    );
$$;

-- Recria a função de aplicação com a lógica corrigida
-- (sem o skip incorreto de artistas já sem acento).
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
  v_target  text;
  v_fixes   jsonb := '[]'::jsonb;
  v_planned integer := 0;
  v_applied integer := 0;
  r record;
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
    -- ── ARTISTA ──
    if r.artist_raw <> '' then
      v_target := public.ukm_restore_accents(r.artist_raw);
      if v_target is distinct from r.artist_raw
         and public.ukm_is_accent_upgrade(r.artist_raw, v_target) then
        v_planned := v_planned + 1;
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

    -- ── TÍTULO ──
    if r.title_raw <> '' then
      v_target := public.ukm_restore_accents(r.title_raw);
      if v_target is distinct from r.title_raw
         and public.ukm_is_accent_upgrade(r.title_raw, v_target) then
        v_planned := v_planned + 1;
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
    'planned', v_planned,
    'applied', v_applied,
    'fixes',   v_fixes
  );
end;
$body$;

grant execute on function public.ukm_apply_accent_fixes(integer, text) to anon, authenticated;
