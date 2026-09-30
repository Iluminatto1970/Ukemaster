-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Correção de policies legadas do chord_dictionary
--
-- A policy `chord_dictionary_write_auth` (ALL using(true) with
-- check(true)) foi criada fora das migrations do repo e FURA o modelo
-- de exclusão: RLS combina policies com OR, então qualquer usuário
-- autenticado podia DELETAR acordes (o DELETE deveria ser exclusivo do
-- admin, policy chord_dictionary_delete_admin).
--
-- Também remove `chord_dictionary_select_public` (redundante com
-- chord_dictionary_select, mesmo efeito).
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "chord_dictionary_write_auth" on public.chord_dictionary;
drop policy if exists "chord_dictionary_select_public" on public.chord_dictionary;

-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename='chord_dictionary' ORDER BY cmd, policyname;
-- Esperado (5 linhas):
--   chord_dictionary_delete_admin :: DELETE   (só admin por e-mail no JWT)
--   chord_dictionary_insert       :: INSERT
--   chord_dictionary_select       :: SELECT
--   chord_dictionary_update       :: UPDATE
--   ...e nenhuma policy ALL.
-- ═══════════════════════════════════════════════════════════════════
