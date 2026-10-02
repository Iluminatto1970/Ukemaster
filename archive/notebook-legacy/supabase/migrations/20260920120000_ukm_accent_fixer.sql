-- =====================================================================
-- UkeMaster Pro — Corretor de acentos em songs (2026-09-20)
-- Complementa 20260919120000_ukm_search.sql.
--
-- Objetivo: padronizar `title`/`artist` para a forma acentuada correta
-- quando existe maioria robusta no próprio acervo (scrapers gravaram
-- variantes sem acento / com acentuação errada).
--
-- Arquitetura da decisão:
--   1. ukm_restore_accents(txt)  — escolhe, por CLUSTER (ukm_norm),
--      a variante acentuada mais frequente, exigindo maioria robusta
--      (>= 3 ocorrências e >= 2x a forma atual);
--   2. ukm_is_accent_upgrade(origem, candidato) — salvaguardas por PAR:
--      nunca remove/troca acento existente (ukm_preserves_origem_accents),
--      nunca muda só maiúscula, nunca churn Unicode NFD<->NFC, e todo
--      token acentuado novo precisa existir acentuado FORA do cluster
--      (ukm_new_accented_tokens_supported);
--   3. search_songs_accents_dry_run — RPC lote/retomada: janela por id
--      (after exclusivo / before inclusivo), decisão por chave e por par
--      distintos (nunca por linha), contagens NFC-aware só nas propostas.
--
-- O script Node que orquestra (relatório + aplicação) fica no repo da
-- marca: scripts/fix-accents.js
--   node scripts/fix-accents.js                 # relatório (dry-run)
--   node scripts/fix-accents.js --aplicar       # aplica (exige service_role)
--
-- Performance medida em produção (394.313 linhas / 685 MB):
--   janela de 2.000 linhas = ~1,3 s  (antes das otimizações: 14,6 s)
--   índices btree simples em artist/title eliminaram full scans;
--   índices trigram em lower(title)/lower(artist) aceleram a checagem
--   de tokens acentuados novos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Marcação de linhas já corrigidas (idempotência / --pendente)
-- ---------------------------------------------------------------------
alter table public.songs add column if not exists accents_fixed_at timestamptz;
comment on column public.songs.accents_fixed_at is
  'Timestamp da última correção automática de acento (script fix-accents.js)';

-- ---------------------------------------------------------------------
-- 2) Índices de suporte (aplicados; idempotentes)
--    btree simples: igualdade exata na salvaguarda e nas contagens
-- ---------------------------------------------------------------------
create index if not exists songs_artist_eq_idx on public.songs (artist) where artist is not null;
create index if not exists songs_title_eq_idx  on public.songs (title)  where title  is not null;

-- trigram em minúsculas: checagem de token acentuado novo via ilike
create index if not exists songs_title_trgm_lower_idx
  on public.songs using gin (lower(title) gin_trgm_ops) where title is not null;
create index if not exists songs_artist_trgm_lower_idx
  on public.songs using gin (lower(artist) gin_trgm_ops) where artist is not null;

-- ---------------------------------------------------------------------
-- 3) Salvaguarda 1: o candidato preserva os acentos que a origem já tinha?
--    (varre a origem caractere a caractere; cada acento da origem precisa
--     aparecer no candidato, na mesma ordem, ignorando caixa)
-- ---------------------------------------------------------------------
create or replace function public.ukm_preserves_origem_accents(origem text, candidato text)
returns boolean
language plpgsql
immutable
set search_path = public, extensions
as $fn$
declare
  o text := normalize(coalesce(origem, ''), nfc);
  c text := normalize(coalesce(candidato, ''), nfc);
  n int := length(o);
  m int := length(c);
  i int := 1;
  j int := 1;
  ch text;
begin
  while i <= n loop
    ch := substr(o, i, 1);
    if ch <> public.ukm_immutable_unaccent(ch) then
      -- avança o cursor do candidato até achar um caractere acentuado
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
$fn$;

-- ---------------------------------------------------------------------
-- 4) Salvaguarda 2: todo token acentuado NOVO do candidato precisa
--    existir acentuado fora do cluster/contexto da origem.
--    (ex.: "égo" só existe no próprio cluster "Meu Égo" -> bloqueia)
-- ---------------------------------------------------------------------
create or replace function public.ukm_new_accented_tokens_supported(candidato text, origem text)
returns boolean
language plpgsql
stable
set search_path = public
as $fn$
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
    novo := (position(
               public.ukm_immutable_unaccent(t)
               in public.ukm_immutable_unaccent(normalize(origem, nfc))
             ) = 0);
    if novo and t <> public.ukm_immutable_unaccent(t) then
      if not exists (
        select 1 from public.songs s
        where (lower(s.title) ilike '% ' || t || ' %'
            or lower(s.title) ilike t || ' %'
            or lower(s.title) ilike '% ' || t
            or lower(s.artist) ilike '% ' || t || ' %'
            or lower(s.artist) ilike t || ' %'
            or lower(s.artist) ilike '% ' || t)
          and (
            (v_artist is not null
              and public.ukm_norm(s.artist) is distinct from v_artist
              and public.ukm_norm(s.title)  is distinct from v_norm_c)
            or
            (v_artist is null
              and public.ukm_norm(s.title) is distinct from v_norm_c)
          )
        limit 1
      ) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 5) Decisão final por par (origem, candidato):
--    frequência (feita por ukm_restore_accents) + todas as salvaguardas.
-- ---------------------------------------------------------------------
create or replace function public.ukm_is_accent_upgrade(origem text, candidato text)
returns boolean
language sql
stable
set search_path = public, extensions
as $fn$
  select public.ukm_norm(origem) = public.ukm_norm(candidato)
    and normalize(origem, nfc) is distinct from normalize(candidato, nfc)
    and lower(candidato) is distinct from lower(origem)          -- muda algo além da caixa
    and candidato <> lower(candidato)                            -- candidato tem maiúscula
    and candidato <> public.ukm_immutable_unaccent(candidato)    -- candidato é acentuado
    and length(candidato) >= length(origem) - 4
    and public.ukm_preserves_origem_accents(origem, candidato)
    and public.ukm_new_accented_tokens_supported(candidato, origem)
    and exists (
      select 1 from public.songs s
        where (s.artist = candidato or s.title = candidato)
          and s.id like 'scraped-%'
    );
$fn$;

-- ---------------------------------------------------------------------
-- 6) Escolha da forma majoritária do cluster (usada pela RPC).
--    Regra: melhor variante ACENTUADA por frequência; só troca se
--    majoritária com maioria ROBUSTA (>= 3 ocorrências e >= 2x a atual).
-- ---------------------------------------------------------------------
create or replace function public.ukm_restore_accents(txt text)
returns text
language plpgsql
stable
set search_path = public, extensions
as $fn$
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

  -- Maioria ROBUSTA: >= 3 ocorrências e >= 2x a forma atual.
  if v_best is not null
     and v_best <> v_txt
     and v_best_count >= 3
     and v_best_count >= v_own_count * 2 then
    return v_best;
  end if;
  return v_txt;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 7) RPC de varredura em lotes (relatório). Só decide — nunca altera.
--    Janela por id: p_after_id EXCLUSIVO ('' = início), p_before_id
--    INCLUSIVO ('' = fim). A guarda custosa roda por PAR distinto, não
--    por linha; contagens NFC-aware só para propostas reais.
-- ---------------------------------------------------------------------
create or replace function public.search_songs_accents_dry_run(
  p_column text,
  p_after_id text default '',
  p_before_id text default '',
  p_only_pending boolean default false,
  p_limit int default 5000
)
returns table (
  row_id text,
  old_value text,
  new_value text,
  current_count bigint,
  majority_count bigint,
  norm_key text,
  context_key text,
  corrigido boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $fn$
declare
  v_col   text := lower(trim(p_column));
  v_other text;
  v_sql   text;
begin
  if v_col not in ('title','artist') then
    raise exception 'coluna invalida: % (use title ou artist)', v_col;
  end if;
  v_other := case when v_col = 'title' then 'artist' else 'title' end;

  v_sql := format($q$
    with base as (
      select s.id,
             s.%1$I as old_value,
             s.%2$I as other_value,
             (s.accents_fixed_at is not null) as corrigido
      from public.songs s
      where s.%1$I is not null and s.%1$I <> ''
        and ($1 = '' or s.id > $1)
        and ($2 = '' or s.id <= $2)
        and ($3 = false or s.accents_fixed_at is null)
      order by s.id
      limit least(greatest($4, 1), 50000)
    ),
    chaves as materialized (
      select public.ukm_norm(b.old_value) as norm_key, min(b.old_value) as rep
      from base b
      group by 1
    ),
    elegiveis as materialized (
      select c.norm_key, c.rep,
             public.ukm_restore_accents(c.rep) as restauro
      from chaves c
      where exists (
        select 1 from public.songs v
        where public.ukm_norm(v.%1$I) = c.norm_key
          and v.%1$I <> public.ukm_immutable_unaccent(v.%1$I)
      )
    ),
    decisoes_f as materialized (
      select norm_key, restauro from elegiveis where restauro is distinct from rep
    ),
    pares as materialized (
      select distinct d.norm_key, b.old_value, d.restauro
      from base b
      join decisoes_f d on public.ukm_norm(b.old_value) = d.norm_key
    ),
    guardados as materialized (
      select p.norm_key, p.old_value,
             case when public.ukm_is_accent_upgrade(p.old_value, p.restauro)
                  then p.restauro else p.old_value end as new_value
      from pares p
    )
    select
      b.id,
      b.old_value,
      coalesce(g.new_value, b.old_value),
      case when g.new_value is distinct from b.old_value then
        (select count(*) from public.songs x
          where public.ukm_norm(x.%1$I) = b.norm_key_join
            and normalize(x.%1$I, nfc) = normalize(b.old_value, nfc))
      end,
      case when g.new_value is distinct from b.old_value then
        (select count(*) from public.songs x
          where public.ukm_norm(x.%1$I) = b.norm_key_join
            and normalize(x.%1$I, nfc) = normalize(g.new_value, nfc))
      end,
      b.norm_key_join,
      public.ukm_norm(b.other_value),
      b.corrigido
    from (
      select b2.*, public.ukm_norm(b2.old_value) as norm_key_join
      from base b2
    ) b
    left join guardados g
      on g.norm_key = b.norm_key_join and g.old_value = b.old_value
  $q$, v_col, v_other);

  return query execute v_sql using p_after_id, p_before_id, p_only_pending, p_limit;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 8) Acesso público de leitura (a aplicação usa service_role via REST)
-- ---------------------------------------------------------------------
grant execute on function public.search_songs_accents_dry_run(text,text,text,boolean,int)
  to anon, authenticated;
