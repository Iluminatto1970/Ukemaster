-- =====================================================================
-- UkeMaster Pro — Plano de deduplicação de songs (2026-09-20)
-- Complementa 20260919120000_ukm_search.sql e 20260920120000_ukm_accent_fixer.sql.
--
-- Problema: 394.313 linhas, mas só ~62.545 músicas distintas — os scrapers
-- reimportaram o catálogo várias vezes (ex.: "Friends — Ed Sheeran" x19).
--
-- Arquitetura: cada agregação completa leva ~25 s sobre 685 MB, inviável
-- via API/gateway. A detecção é MATERIALIZADA na tabela songs_dedupe_plan
-- (função songs_dedupe_refresh, ~30-60 s, uma vez). O plano é o RELATÓRIO:
-- fica congelado, auditável e paginável; o script Node apenas o lê.
--
-- Script orquestrador: scripts/dedupe-songs.js (repo da marca)
--   node scripts/dedupe-songs.js --atualizar            # recria o plano
--   node scripts/dedupe-songs.js                        # relatório (dry-run)
--   node scripts/dedupe-songs.js --aplicar              # aplica (service_role)
--   node scripts/dedupe-songs.js --aplicar --excluir revisao.json --retomar
--
-- Critério de sobrevivente (keep) — determinístico:
--   maior votes → maior views → created_at mais recente →
--   título mais longo → id maior.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela do plano: uma linha por cluster duplicado (ukm_norm title+artist)
-- ---------------------------------------------------------------------
create table if not exists public.songs_dedupe_plan (
  norm_title      text not null,
  norm_artist     text not null,
  n               integer not null,              -- tamanho do cluster
  keep_id         text,
  keep_title      text,
  keep_artist     text,
  keep_votes      integer,
  keep_views      integer,
  keep_created_at text,                          -- created_at é text (scraping)
  keep_key        text,
  keep_difficulty text,
  remover_ids     text[],                        -- ids a deletar (todos menos o keep)
  gerado_em       timestamptz not null default now(),
  constraint songs_dedupe_plan_pkey primary key (norm_title, norm_artist)
);

alter table public.songs_dedupe_plan enable row level security;

-- O app/anon pode LER o plano (relatório); escrita só via service_role.
drop policy if exists songs_dedupe_plan_read on public.songs_dedupe_plan;
create policy songs_dedupe_plan_read
  on public.songs_dedupe_plan
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 2) Materialização do plano (~30-60 s sobre o acervo completo)
--    SECURITY DEFINER: escrita na tabela do plano sem abrir a songs.
--    Idempotente: truncate + reinsert (sempre regenera do estado atual).
-- ---------------------------------------------------------------------
create or replace function public.songs_dedupe_refresh()
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n bigint;
begin
  truncate public.songs_dedupe_plan;

  insert into public.songs_dedupe_plan
    (norm_title, norm_artist, n, keep_id, keep_title, keep_artist,
     keep_votes, keep_views, keep_created_at, keep_key, keep_difficulty, remover_ids)
  select
    r.norm_title, r.norm_artist, r.n,
    max(r.id) filter (where r.rn = 1),
    max(r.title) filter (where r.rn = 1),
    max(r.artist) filter (where r.rn = 1),
    max(r.votes) filter (where r.rn = 1),
    max(r.views) filter (where r.rn = 1),
    max(r.created_at) filter (where r.rn = 1),
    max(r.key) filter (where r.rn = 1),
    max(r.difficulty) filter (where r.rn = 1),
    array_agg(r.id order by r.rn) filter (where r.rn > 1)
  from (
    select
      public.ukm_norm(s.title)  as norm_title,
      public.ukm_norm(s.artist) as norm_artist,
      s.id, s.title, s.artist, s.votes, s.views, s.created_at, s.key, s.difficulty,
      count(*) over (partition by public.ukm_norm(s.title), public.ukm_norm(s.artist)) as n,
      row_number() over (
        partition by public.ukm_norm(s.title), public.ukm_norm(s.artist)
        order by coalesce(s.votes, 0) desc,
                 coalesce(s.views, 0) desc,
                 s.created_at desc nulls last,
                 length(coalesce(s.title, '')) desc,
                 s.id desc
      ) as rn
    from public.songs s
    where public.ukm_norm(s.title) <> ''
  ) r
  where r.n > 1
  group by r.norm_title, r.norm_artist, r.n;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3) Acesso: leitura pública do plano; recriação restrita ao service_role
--    (a função faz truncate + insert — não pode ficar exposta ao anon).
-- ---------------------------------------------------------------------
revoke execute on function public.songs_dedupe_refresh() from public, anon, authenticated;
grant execute on function public.songs_dedupe_refresh() to service_role;

-- =====================================================================
-- Observações de operação:
--   • Reexecutar --atualizar DEPOIS de aplicar é seguro: clusters já
--     deduplicados deixam de aparecer (n <= 1).
--   • O cron de importação pode recriar duplicatas — rodar o plano
--     periodicamente (ex.: após grandes importações).
--   • song_votes tem FK ON DELETE CASCADE: o script transfere os votos
--     dos removidos para o keep ANTES do delete (on_conflict ignore).
-- =====================================================================
