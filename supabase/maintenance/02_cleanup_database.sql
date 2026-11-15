-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Script de Limpeza Segura e Otimização do Banco
-- Execute no Supabase Dashboard → SQL Editor (por etapas ou completo).
-- ═══════════════════════════════════════════════════════════════════

-- ── ETAPA 1: Limpeza de Histórico Antigo do Cron (Logs de Scraping) ───────
-- O cron_log guarda cada execução do scraping. Manter logs muito antigos infla o banco.
-- Esta instrução remove registros de execução com mais de 60 dias:
DELETE FROM public.cron_log
WHERE ran_at < NOW() - INTERVAL '60 days';

-- ── ETAPA 2: Limpeza de Comandos Antigos dos Workers ──────────────────────
-- Remove registros de comandos do painel admin já concluídos/falhos há mais de 14 dias:
DELETE FROM public.worker_commands
WHERE created_at < NOW() - INTERVAL '14 days'
  AND status IN ('done', 'failed', 'canceled');

-- ── ETAPA 3: Limpeza de Músicas Inválidas ou Sem Conteúdo ─────────────────
-- Remove registros corrompidos/nulos onde título e conteúdo não existem:
DELETE FROM public.songs
WHERE (title IS NULL OR TRIM(title) = '')
  AND (content IS NULL OR TRIM(content) = '');

-- ── ETAPA 4: Reorganização e Liberação de Espaço em Disco ─────────────────
-- No PostgreSQL, o DELETE marca as linhas como excluídas, mas não libera
-- o espaço em disco automaticamente. O VACUUM ANALYZE atualiza as estatísticas
-- e reorganiza as páginas do banco de dados.

VACUUM ANALYZE public.cron_log;
VACUUM ANALYZE public.worker_commands;
VACUUM ANALYZE public.songs;
VACUUM ANALYZE public.cron_imports;
VACUUM ANALYZE public.chord_dictionary;

-- ═══════════════════════════════════════════════════════════════════
-- FIM DO SCRIPT DE LIMPEZA
-- ═══════════════════════════════════════════════════════════════════
