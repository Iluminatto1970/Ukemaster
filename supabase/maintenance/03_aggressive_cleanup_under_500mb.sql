-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Limpeza Agressiva para Reduzir o Banco para < 500 MB
-- Execute no Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Limpeza total de logs antigos do cron (mantém apenas os últimos 3 dias)
DELETE FROM public.cron_log
WHERE ran_at < NOW() - INTERVAL '3 days';

-- ── 2. Limpeza de comandos de worker antigos/concluídos
DELETE FROM public.worker_commands
WHERE created_at < NOW() - INTERVAL '3 days';

-- ── 3. Remoção de colunas de texto redundantes na tabela songs
-- (Muitas músicas guardam 'medium_content' e 'simplified_content' duplicados.
-- Zerar estas colunas não essenciais reduz drasticamente o tamanho do banco de dados)
UPDATE public.songs
SET medium_content = NULL,
    simplified_content = NULL
WHERE views = 0 AND votes = 0;

-- ── 4. Remoção de músicas órfãs, vazias ou sem engajamento e muito antigas
-- (Remove músicas com 0 visualizações, 0 votos e criadas há mais de 30 dias se necessário,
--  ou você pode ajustar o filtro conforme sua preferência)
DELETE FROM public.songs
WHERE views = 0
  AND votes = 0
  AND (content IS NULL OR LENGTH(content) < 20);

-- ── 5. Compactação e reindexação física das tabelas principais
-- (O PostgreSQL por padrão apenas marca linhas como deletadas.
--  Estes comandos otimizam as tabelas e liberam espaço físico real no disco do Supabase)
VACUUM FULL public.songs;
VACUUM FULL public.cron_log;
VACUUM FULL public.cron_imports;
VACUUM FULL public.song_votes;
VACUUM FULL public.song_comments;

-- ── 6. Atualização de estatísticas do planejador
VACUUM ANALYZE;
