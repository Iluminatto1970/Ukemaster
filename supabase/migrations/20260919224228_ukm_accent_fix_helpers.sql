-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- Regra final de preservação: os acentos JÁ presentes na origem não podem
-- ser removidos nem trocados por outros no candidato (a sequência de
-- caracteres acentuados da origem deve ser prefixo da do candidato).
-- Evita: Você→Voce, Escândalo→Escándalo, churn NFC/NFD.
create or replace function public.ukm_preserves_origem_accents(origem text, candidato text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $body$
declare
  o text := normalize(coalesce(origem, ''), nfc);
  c text := normalize(coalesce(candidato, ''), nfc);
  n int := length(o);
  m int := length(c);
  i int := 1;
  j int := 1;
  ch text;
begin
  -- varre a origem; para cada caractere acentuado, o candidato precisa do
  -- MESMO caractere acentuado adiante (na mesma ordem, ignorando caixa)
  while i <= n loop
    ch := substr(o, i, 1);
    if ch <> public.ukm_immutable_unaccent(ch) then
      -- avança o cursor do candidato até achar um acentuado
      while j <= m and substr(c, j, 1) = public.ukm_immutable_unaccent(substr(c, j, 1)) loop
        j := j + 1;
      end loop;
      if j > m or lower(substr(c, j, 1)) <> lower(ch) then
        return false;
      end if;
      j := j + 1;
    end if;
    i := i + 1;
  end loop;
  return true;
end;
$body$;

-- Restore com NFC (voto consistente entre formas pré-compostas/decompostas).
create or replace function public.ukm_restore_accents(txt text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $body$
declare
  v_txt        text;
  v_norm       text;
  v_best       text := null;
  v_best_count integer := -1;
  v_own_count  integer := 0;
  r            record;
begin
  if txt is null or txt = '' then
    return txt;
  end if;

  v_txt  := normalize(txt, nfc);
  v_norm := public.ukm_norm(v_txt);

  for r in
    select normalize(candidate, nfc) as candidate,
           (select count(*)::int from public.songs s
             where public.ukm_norm(s.artist) = v_norm and s.artist = candidate)
         + (select count(*)::int from public.songs s
             where public.ukm_norm(s.title)  = v_norm and s.title = candidate) as freq,
           (candidate <> public.ukm_immutable_unaccent(candidate)) as tem_acento,
           (candidate = v_txt) as eh_o_proprio
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

  -- Maioria ROBUSTA: ≥3 ocorrências e ≥2x a forma atual.
  if v_best is not null
     and v_best <> v_txt
     and v_best_count >= 3
     and v_best_count >= v_own_count * 2 then
    return v_best;
  end if;
  return v_txt;
end;
$body$;

-- Dupla checagem final: + NFC igual = no-op; + nunca remover/trocar acento existente.
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
    and exists (
      select 1 from public.songs s
        where (s.artist = candidato or s.title = candidato)
          and s.id like 'scraped-%'
    );
$$;
