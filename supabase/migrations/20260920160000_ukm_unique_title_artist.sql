-- =============================================================================
-- UKM — Índice ÚNICO (title, artist) normalizados — 2026-09-20
--
-- Última linha de defesa anti-duplicata: o PRÓPRIO BANCO rejeita (23505/409)
-- qualquer INSERT/UPDATE que crie duas músicas com o mesmo
-- (ukm_norm(title), ukm_norm(artist)) — sem acento, sem caixa, espaços
-- colapsados. Vale para TODOS os escritores: cron de plataformas, push do
-- app (cloudSync) e importações manuais da área admin.
--
-- Requisito: o catálogo deve estar SEM duplicatas antes de criar o índice
-- (verificado em 2026-09-20 após a deduplicação de 331.768 linhas:
-- 0 grupos duplicados). Se novas duplicatas existirem, o CREATE falha e
-- aponta o conflito — rodar o ciclo do dedupe (scripts/dedupe-songs.js)
-- antes de reaplicar.
--
-- Parcial: linhas com título normalizado vazio (ukm_norm <> '') ficam fora —
-- títulos vazios/lixo não podem bloquear imports legítimos entre si.
--
-- Consumidores que fazem upsert por (title, artist) SEM passarem o id
-- existente receberão 409 do PostgREST. O app adota o id da nuvem antes do
-- push (cloudSync.adoptExistingSongIdsFromCloud) e o cron compara contra o
-- acervo inteiro (fetchExistingSongs maxRows 500k) — duplicata só chega ao
-- banco se passar por essas duas camadas.
-- =============================================================================

create unique index if not exists ukm_songs_title_artist_norm_uniq
  on songs (ukm_norm(title), ukm_norm(artist))
  where coalesce(ukm_norm(title), '') <> '';

-- Validação:
--   select indexname from pg_indexes
--    where tablename = 'songs' and indexname = 'ukm_songs_title_artist_norm_uniq';
