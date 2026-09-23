-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — RLS da tabela chord_dictionary
--
-- Problema observado: o app faz UPSERT de acordes gerados no cliente
-- (chordCache.schedulePersistGeneratedChords) e o PostgREST devolvia
--   401 — "new row violates row-level security policy"
-- porque a tabela não tinha política de INSERT para anon/authenticated.
--
-- Modelo (mesmo espírito do restante do acervo):
--  * Leitura pública: o dicionário enriquece a UI para qualquer visitante.
--  * Escrita liberada (insert/update): os acordes são gerados pelo motor
--    determinístico do cliente e compartilhados entre dispositivos —
--    conteúdo técnico sem dado de usuário (PK = nome do acorde).
--  * DELETE exclusivo do admin (mesmo padrão de songs_delete_admin).
--
-- Idempotente: pode rodar quantas vezes quiser no SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

grant select, insert, update on public.chord_dictionary to anon, authenticated;
revoke delete on public.chord_dictionary from anon;
grant delete on public.chord_dictionary to authenticated;

alter table public.chord_dictionary enable row level security;

drop policy if exists "chord_dictionary_all" on public.chord_dictionary;
drop policy if exists "chord_dictionary_select" on public.chord_dictionary;
create policy "chord_dictionary_select" on public.chord_dictionary
  for select using (true);

drop policy if exists "chord_dictionary_insert" on public.chord_dictionary;
create policy "chord_dictionary_insert" on public.chord_dictionary
  for insert with check (true);

drop policy if exists "chord_dictionary_update" on public.chord_dictionary;
create policy "chord_dictionary_update" on public.chord_dictionary
  for update using (true) with check (true);

drop policy if exists "chord_dictionary_delete_admin" on public.chord_dictionary;
create policy "chord_dictionary_delete_admin" on public.chord_dictionary
  for delete using (lower(auth.jwt() ->> 'email') = 'iluminatto@gmail.com');

-- VERIFICAÇÃO:
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'chord_dictionary';
-- Teste esperado com a publishable key:
--   SELECT * FROM chord_dictionary LIMIT 1;  -- 200 ✅
--   INSERT um acorde novo                    -- 201 ✅
--   DELETE                                   -- 401 (bloqueado p/ anon) ✅
