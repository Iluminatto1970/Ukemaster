-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Migration: songs exige login (cron = UkeMater)
-- ⚠️ APLIQUE SÓ DEPOIS de converter o cron (ver CRON_DEPLOYMENT.md):
--    1. Criar a conta UkeMater no Supabase Auth;
--    2. Configurar CRON_UKEMATER_EMAIL/PASSWORD no .env das MÁQUINAS e
--       nas env vars da VERCEL (o /api/scrape-platforms usa platformCron);
--    3. Rodar o cron uma vez e conferir cron_log gravando normalmente.
--    Só então rode este arquivo no SQL Editor (idempotente).
--
-- O que faz: `songs` deixa de aceitar INSERT/UPDATE do papel anônimo.
--   * Anônimos (visitantes do site) passam a ser SÓ leitura — o app já
--     exige login para criar/editar cifras, votar, comentar, criar listas.
--   * Usuários logados escrevem normalmente (comunidade).
--   * O cron escreve autenticado como UkeMater (JWT) → auth.uid() não é
--     nulo → passa. As tabelas técnicas (scrape_state, cron_imports,
--     cron_log) continuam com as políticas de escrita atuais.
--   * DELETE continua exclusivo do admin (iluminatto@gmail.com).
-- ═══════════════════════════════════════════════════════════════════

-- Escrita em songs só com sessão autenticada (INSERT e UPDATE).
revoke insert, update on public.songs from anon;
grant select on public.songs to anon, authenticated;
grant insert, update on public.songs to authenticated;

drop policy if exists "songs_insert" on public.songs;
create policy "songs_insert" on public.songs
  for insert with check (auth.uid() is not null);

drop policy if exists "songs_update" on public.songs;
create policy "songs_update" on public.songs
  for update using (true) with check (auth.uid() is not null);

-- ── VERIFICAÇÃO (rodar depois) ──────────────────────────────────────
-- SELECT tablename, cmd, qual FROM pg_policies
--   WHERE schemaname='public' AND tablename='songs' ORDER BY cmd;
-- INSERT INTO public.songs (id,title,artist,created_at,updated_at) VALUES
--   ('teste-anon','X','Y',now(),now());  -- anon: DEVE falhar (401/403)
