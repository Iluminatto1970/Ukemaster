-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Políticas de Segurança (RLS + grants mínimos)
-- Execute no Supabase Dashboard → SQL Editor (idempotente, pode rodar
-- quantas vezes quiser). Aplica-se DEPOIS do schema.sql.
--
-- MODELO DE AMEAÇAS / DECISÕES (atualizado 2026-08-05 — auth Supabase):
--  * O acervo (songs, playlists, song_votes) é PÚBLICO por design
--    (produto gratuito, dados abertos) → leitura anônima liberada.
--  * `leads` é o ÚNICO dado sensível (nome/e-mail/WhatsApp) →
--    INSERT-only: ninguém lê/exclui leads com a chave publishable.
--    O dono consulta pelo Dashboard (service role).
--  * `songs.DELETE` é exclusivo do admin (email verificado via JWT do
--    Supabase: auth.jwt() ->> 'email'). O privilégio DELETE é revogado
--    do anon e concedido só a authenticated — e mesmo autenticados só
--    deletam linhas cujo JWT tenha o e-mail do admin.
--  * `repertoires` é por usuário: o dono (auth.uid()) vê/edita o seu;
--    o público vê apenas os marcados is_public = true.
--  * Tabelas técnicas do cron (scrape_state, cron_imports, cron_log)
--    ficam de escrita aberta porque o cron roda com a mesma chave
--    publishable (upsert via PostgREST exige INSERT+UPDATE).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) LEADS: grants mínimos + RLS insert-only ─────────────────────
revoke all on public.leads from anon, authenticated;
grant insert on public.leads to anon, authenticated;

alter table public.leads enable row level security;
drop policy if exists "leads_insert" on public.leads;
create policy "leads_insert" on public.leads
  for insert with check (true);

-- ── 2) SONGS: leitura/escrita abertas, DELETE só admin ─────────────
-- Leitura pública (acervo aberto) + INSERT/UPDATE para o cron/usuários.
-- DELETE: privilégio negado ao anon; autenticados passam pelo RLS que
-- exige o e-mail do admin no JWT (auth.jwt() ->> 'email').
--
-- ATENÇÃO: o schema.sql (migração antiga) criou a política permissiva
-- "songs_all" (for all using true). Como o RLS faz OR entre políticas,
-- ela ANULARIA o delete só-admin abaixo — por isso a dropa aqui.
grant select, insert, update on public.songs to anon, authenticated;
revoke delete on public.songs from anon;
grant delete on public.songs to authenticated;

alter table public.songs enable row level security;
drop policy if exists "songs_all" on public.songs;
drop policy if exists "songs_select" on public.songs;
create policy "songs_select" on public.songs for select using (true);
drop policy if exists "songs_insert" on public.songs;
create policy "songs_insert" on public.songs for insert with check (true);
drop policy if exists "songs_update" on public.songs;
create policy "songs_update" on public.songs for update using (true) with check (true);
drop policy if exists "songs_delete_admin" on public.songs;
create policy "songs_delete_admin" on public.songs
  for delete using (lower(auth.jwt() ->> 'email') = 'iluminatto@gmail.com');

-- ── 3) SONG_VOTES: 1 voto por usuário (PK composta) ────────────────
alter table public.song_votes enable row level security;
drop policy if exists "song_votes_all" on public.song_votes;
create policy "song_votes_all" on public.song_votes
  for all using (true) with check (true);

-- ── 4) PLAYLISTS: públicas por design ──────────────────────────────
alter table public.playlists enable row level security;
drop policy if exists "playlists_all" on public.playlists;
create policy "playlists_all" on public.playlists
  for all using (true) with check (true);

-- ── 4b) AFFILIATE / PARTNER / BLOG: públicos por design ────────────
-- Dropa as versões antigas do schema.sql (se existirem) e recria
-- idempotente — mesmo padrão das demais tabelas abertas.
alter table public.affiliate_links enable row level security;
drop policy if exists "affiliate_links_all" on public.affiliate_links;
create policy "affiliate_links_all" on public.affiliate_links
  for all using (true) with check (true);

alter table public.partner_links enable row level security;
drop policy if exists "partner_links_all" on public.partner_links;
create policy "partner_links_all" on public.partner_links
  for all using (true) with check (true);

alter table public.blog_posts enable row level security;
drop policy if exists "blog_posts_all" on public.blog_posts;
create policy "blog_posts_all" on public.blog_posts
  for all using (true) with check (true);

-- ── 5) REPERTOIRES: dono vê/edita o seu; público vê só is_public ───
-- O app envia o JWT do usuário (Authorization: Bearer) quando logado;
-- auth.uid() = id do usuário no Supabase, igual ao user_id salvo.
--
-- ATENÇÃO: o schema.sql criou "repertoires_all" (for all using true), que
-- ANULARIA esta restrição por usuário (RLS = OR). A dropa é obrigatória
-- para a privacidade do repertório privado valer de fato.
alter table public.repertoires enable row level security;
drop policy if exists "repertoires_all" on public.repertoires;
drop policy if exists "repertoires_select" on public.repertoires;
create policy "repertoires_select" on public.repertoires
  for select using (user_id = auth.uid()::text or is_public = true);
drop policy if exists "repertoires_write_own" on public.repertoires;
create policy "repertoires_write_own" on public.repertoires
  for all using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- ── 6) Tabelas técnicas do cron (escrita aberta por design) ────────
alter table public.scrape_state enable row level security;
drop policy if exists "scrape_state_all" on public.scrape_state;
create policy "scrape_state_all" on public.scrape_state
  for all using (true) with check (true);

alter table public.cron_imports enable row level security;
drop policy if exists "cron_imports_all" on public.cron_imports;
create policy "cron_imports_all" on public.cron_imports
  for all using (true) with check (true);

alter table public.cron_log enable row level security;
drop policy if exists "cron_log_all" on public.cron_log;
create policy "cron_log_all" on public.cron_log
  for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO (rodar depois):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' ORDER BY tablename, cmd;
-- Esperado: NÃO pode existir nenhuma política 'repertoires_all' nem
-- 'songs_all' (foram dropadas — senão anulariam as restrições abaixo).
-- Testes via anon/publishable key:
--   SELECT * FROM public.leads;          -- 401 (bloqueado) ✅
--   INSERT INTO public.leads (...) ...   -- 201 (permitido) ✅
--   DELETE FROM public.songs WHERE ...   -- 401 (bloqueado) ✅
--   SELECT * FROM public.songs LIMIT 1;  -- 200 (público) ✅
-- ═══════════════════════════════════════════════════════════════════
