-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Limpeza em Lotes (Sem VACUUM FULL para evitar Lock/Replica Errors)
-- Execute no Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Excluir logs do cron em lotes pequenos para liberar espaço sem travar o banco
DELETE FROM public.cron_log
WHERE id IN (
  SELECT id FROM public.cron_log
  WHERE ran_at < NOW() - INTERVAL '2 days'
  LIMIT 5000
);

-- 2. Excluir comandos de worker antigos
DELETE FROM public.worker_commands
WHERE id IN (
  SELECT id FROM public.worker_commands
  WHERE created_at < NOW() - INTERVAL '2 days'
  LIMIT 1000
);

-- 3. Limpar músicas sem conteúdo ou órfãs em lotes
DELETE FROM public.songs
WHERE id IN (
  SELECT id FROM public.songs
  WHERE (content IS NULL OR LENGTH(content) < 10)
    AND views = 0
    AND votes = 0
  LIMIT 1000
);
