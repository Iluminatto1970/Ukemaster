-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Diagnóstico Detalhado do Tamanho do Banco de Dados
-- Cole este script no Supabase Dashboard → SQL Editor e clique em Run.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Tamanho total do banco de dados atual
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- 2. Tamanho detalhado por tabela (tabela, tamanho dos dados, tamanho dos índices e total)
SELECT
  ns.nspname AS schema_name,
  cl.relname AS table_name,
  pg_size_pretty(pg_relation_size(cl.oid)) AS data_size,
  pg_size_pretty(pg_indexes_size(cl.oid)) AS indexes_size,
  pg_size_pretty(pg_total_relation_size(cl.oid)) AS total_size,
  pg_total_relation_size(cl.oid) AS total_bytes
FROM pg_class cl
JOIN pg_namespace ns ON ns.oid = cl.relnamespace
WHERE ns.nspname = 'public'
  AND cl.relkind = 'r'
ORDER BY total_bytes DESC;

-- 3. Contagem estimada e real de linhas por tabela principal
SELECT
  c.relname AS tabela,
  reltuples::bigint AS linhas_estimadas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY reltuples DESC;

-- 4. Análise de volume de logs e histórico do cron (que costumam inflar o banco)
SELECT
  'cron_log' AS tabela,
  COUNT(*) AS total_linhas,
  MIN(ran_at) AS mais_antigo,
  MAX(ran_at) AS mais_recente
FROM public.cron_log
UNION ALL
SELECT
  'cron_imports' AS tabela,
  COUNT(*) AS total_linhas,
  MIN(imported_at) AS mais_antigo,
  MAX(imported_at) AS mais_recente
FROM public.cron_imports;
