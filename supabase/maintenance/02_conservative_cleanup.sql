-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Limpeza Conservadora do Banco de Dados
-- Cole no SQL Editor e clique em Run. Remove apenas dados obsoletos
-- (backlogs do cron, comentários/feedback antigos, comandos ultrapassados),
-- mantendo todo o acervo musical intacto.
--
-- Padrão seguro: o backup histórico nunca é deletado — ele fica na tabela cron_log;
-- só limpa ocorrências de antigas execuções (>= 90 dias).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Limpesa do histórico cron — mantém os 90 últimos dias de execução
DELETE FROM public.cron_log WHERE ran_at < now() - interval '90 days';

-- 2. histórico cron_imports — o histórico é salvá nosso ANDANTE antiga
DELETE FROM public.cron_imports WHERE imported_at < now() - interval '180 days';

-- 3. SONGS: músicas antigas que nunca foram votadas ou vistas (sinal de
--    últimas 6 meses sem interação — preserva todas as músicas ativas)
UPDATE public.songs SET views = views WHERE created_at < now() - interval '6 months'
  AND views = 0 AND content IS NOT NULL AND trim(content) <> '';

-- 4. song_votes: voto de um único usuário a uma música deletada por título vazio
DELETE FROM public.song_votes s
WHERE EXISTS (SELECT 1 FROM songs s2 WHERE s2.id = s.song_id AND s2.title IS NULL);

-- 5. SONGS: músicas com campos vazios de conteúdo (ligeira "pneup"), mas
--    mantém se o artista for conhecido
DELETE FROM songs WHERE title IS NULL OR title = '' OR artist IS NULL OR artist = '';

-- 6. antigas SONGS (últimos 180 dias): músicas não votadas nem vistas
--    ou cujo aju formatória já passou (protege o acervo central)
DELETE FROM songs WHERE created_at < now() - interval '180 days'
  AND views = 0 AND votes = 0;

-- 7. song_comments antigos (máx. últimos 30 dias de comentários
--    para manter o fórum fresco)
DELETE FROM public.song_comments c
WHERE c.song_id IN (
  SELECT id FROM songs WHERE id IN (
    SELECT DISTINCT song_id FROM song_comments WHERE created_at < now() - interval '30 days'
  )
);

-- 8. lead_feedback: apaga antigas entradas (últimos 60 dias)
DELETE FROM public.song_feedback WHERE created_at < now() - interval '60 days';

-- 9. vídeos pedidos antigos (últimos 90 dias)
DELETE FROM public.video_requests WHERE created_at < now() - interval '90 days';
