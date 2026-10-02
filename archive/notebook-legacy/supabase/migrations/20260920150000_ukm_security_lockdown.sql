-- =============================================================================
-- UKM Security Lockdown — 2026-09-20
-- Auditoria de segurança: fechar escrita anônima e proteger dados internos.
--
-- Princípios:
--   * Leitura pública SOMENTE onde o site consome anon (songs, certificates,
--     affiliate_links, partner_links, blog_posts, chord_dictionary,
--     contributions, playlists, song_votes, repertoires, song_comments,
--     songs_dedupe_plan).
--   * Escrita anônima bloqueada em TODAS as tabelas (leads/song_feedback/
--     video_requests/song_comments/contributions/song_votes já eram; as
--     demais ganham policies autenticadas).
--   * Infraestrutura de scraping (cron_imports, cron_log, scrape_state,
--     worker_commands) invisível ao anon; admin autenticado mantém acesso
--     (o app envia Bearer <JWT> quando logado — ver src/lib/supabase.ts).
--   * Tabela de backup songs_dedupe_divergencias_20260920: RLS habilitado,
--     SEM policies — invisível para anon/authenticated (só service_role).
--   * Funções administrativas com revoke de EXECUTE para anon/authenticated.
--
-- Idempotente: drop policy if exists antes de cada create.
-- =============================================================================

-- ── 1. Backup de divergências (conteúdo de letras) — NUNCA exposto ──────────
alter table public.songs_dedupe_divergencias_20260920 enable row level security;

-- ── 2. certificates — leitura pública (verificador de código), escrita só
--      autenticado (emissão/remoção no app logado) ────────────────────────────
drop policy if exists certificates_all on public.certificates;
create policy certificates_select_public on public.certificates
  for select to anon, authenticated using (true);
create policy certificates_insert_auth on public.certificates
  for insert to authenticated with check (true);
create policy certificates_update_auth on public.certificates
  for update to authenticated using (true) with check (true);
create policy certificates_delete_auth on public.certificates
  for delete to authenticated using (true);

-- ── 3. affiliate_links / partner_links — leitura pública (cards do site),
--      escrita autenticada (área admin salva via upsert) ─────────────────────
drop policy if exists affiliate_links_all on public.affiliate_links;
create policy affiliate_links_select_public on public.affiliate_links
  for select to anon, authenticated using (true);
create policy affiliate_links_insert_auth on public.affiliate_links
  for insert to authenticated with check (true);
create policy affiliate_links_update_auth on public.affiliate_links
  for update to authenticated using (true) with check (true);
create policy affiliate_links_delete_auth on public.affiliate_links
  for delete to authenticated using (true);

drop policy if exists partner_links_all on public.partner_links;
create policy partner_links_select_public on public.partner_links
  for select to anon, authenticated using (true);
create policy partner_links_insert_auth on public.partner_links
  for insert to authenticated with check (true);
create policy partner_links_update_auth on public.partner_links
  for update to authenticated using (true) with check (true);
create policy partner_links_delete_auth on public.partner_links
  for delete to authenticated using (true);

-- ── 4. blog_posts / chord_dictionary — conteúdo público, edição autenticada ──
drop policy if exists blog_posts_all on public.blog_posts;
create policy blog_posts_select_public on public.blog_posts
  for select to anon, authenticated using (true);
create policy blog_posts_write_auth on public.blog_posts
  for all to authenticated using (true) with check (true);

drop policy if exists chord_dictionary_all on public.chord_dictionary;
create policy chord_dictionary_select_public on public.chord_dictionary
  for select to anon, authenticated using (true);
create policy chord_dictionary_write_auth on public.chord_dictionary
  for all to authenticated using (true) with check (true);

-- ── 5. cron_imports / scrape_state — só autenticado (painel admin) ───────────
drop policy if exists cron_imports_all on public.cron_imports;
create policy cron_imports_admin on public.cron_imports
  for all to authenticated using (true) with check (true);

drop policy if exists scrape_state_all on public.scrape_state;
create policy scrape_state_admin on public.scrape_state
  for all to authenticated using (true) with check (true);

-- ── 6. cron_log — somente leitura autenticada (monitor do painel).
--      Nenhuma escrita via PostgREST: o cron grava com service_role. ──────────
drop policy if exists cron_log_all on public.cron_log;
create policy cron_log_admin_read on public.cron_log
  for select to authenticated using (true);

-- ── 7. worker_commands — mesmo modelo anterior, agora SEM anon:
--      admin enfileira (por e-mail), autenticados veem/andam/cancelam. ────────
drop policy if exists worker_commands_select on public.worker_commands;
create policy worker_commands_select on public.worker_commands
  for select to authenticated
  using (auth.role() = 'authenticated'::text);

drop policy if exists worker_commands_insert on public.worker_commands;
create policy worker_commands_insert on public.worker_commands
  for insert to authenticated
  with check (lower(auth.jwt() ->> 'email'::text) = 'iluminatto@gmail.com'::text);

drop policy if exists worker_commands_update on public.worker_commands;
create policy worker_commands_update on public.worker_commands
  for update to authenticated
  using (auth.role() = 'authenticated'::text)
  with check (auth.role() = 'authenticated'::text);

drop policy if exists worker_commands_delete on public.worker_commands;
create policy worker_commands_delete on public.worker_commands
  for delete to authenticated
  using (auth.role() = 'authenticated'::text);

-- ── 8. Funções administrativas — EXECUTE revogado de anon/authenticated/PUBLIC
--      (o grant padrão ao PUBLIC é herdado por anon/authenticated; revogar só
--      deles não basta — validar com has_function_privilege). ────────────────
--      songs_dedupe_refresh: trunca e recria o plano (service_role apenas).
revoke execute on function public.songs_dedupe_refresh()
  from anon, authenticated, public;
--      ukm_apply_accent_fixes: escreve em songs (2 overloads).
revoke execute on function public.ukm_apply_accent_fixes(integer, text)
  from anon, authenticated, public;
revoke execute on function public.ukm_apply_accent_fixes(integer, text, text, integer)
  from anon, authenticated, public;
--      search_songs_accents_dry_run: auditoria interna do acervo.
revoke execute on function public.search_songs_accents_dry_run(text, text, text, boolean, integer)
  from anon, authenticated, public;
--      songs_dedupe_scan: varredura pesada usada na regeneração do plano.
revoke execute on function public.songs_dedupe_scan(text, integer)
  from anon, authenticated, public;

-- ── 9. Grants residuais — TRUNCATE/REFERENCES nunca deveriam ser públicos ───
revoke truncate, references on all tables in schema public from anon;
revoke truncate, references on all tables in schema public from authenticated;

-- ── 10. Validação pós-aplicação (esperado: anon=false, auth=false, service=true)
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'execute') as anon_pode,
--        has_function_privilege('authenticated', p.oid, 'execute') as auth_pode,
--        has_function_privilege('service_role', p.oid, 'execute') as service_pode
-- from pg_proc p where p.pronamespace = 'public'::regnamespace
--   and p.proname in ('songs_dedupe_refresh','ukm_apply_accent_fixes',
--                     'search_songs_accents_dry_run','songs_dedupe_scan');
