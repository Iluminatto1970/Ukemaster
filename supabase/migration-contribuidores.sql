-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Migration: Ranking de Contribuidores + trava de login
-- Execute no Supabase Dashboard → SQL Editor (idempotente).
--
-- Regra de ouro (pedido do proprietário):
--   "NUNCA PODE CONTRIBUIR SEM LOGAR"
--
-- O que esta migration faz:
--   1. Cria a tabela `contributions` (log de cada contribuição) com RLS
--      que SÓ aceita INSERT de usuário autenticado, e grava user_id =
--      auth.uid() — impossível forjar a autoria (o JWT do Supabase
--      decide quem é o autor, não o corpo da requisição).
--   2. Votação (song_votes): passa a exigir login — INSERT com
--      user_id = auth.uid()::text e DELETE só do próprio voto.
--   3. Comentários (song_comments): INSERT exige login e grava user_id.
--   4. Correção de cifra (song_feedback): INSERT exige login.
--   5. Playlists: escrever (criar/editar/excluir) exige login; leitura
--      continua pública (listas da comunidade).
--   6. Backfill: votos antigos gravados como "user:<uuid>" viram o uuid
--      puro, para casar com auth.uid()::text do RLS novo.
--
-- ⚠️ `songs` CONTINUA de escrita aberta (INSERT/UPDATE por anon) de
-- PROPOSITO: o cron de scraping (platformCron) roda com a anon key no
-- Vercel e alimenta o acervo. A restrição "sem login não contribui"
-- no acervo é aplicada na UI do app (criar/editar cifra exige login).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) CONTRIBUTIONS (ranking de maiores contribuidores) ────────────
create table if not exists public.contributions (
  id text primary key,
  user_id text not null,
  user_name text not null default 'Músico',
  action text not null,          -- 'song_new' | 'song_edit' | 'vote' | 'comment' | 'feedback' | 'playlist_new'
  target_type text,              -- 'song' | 'playlist' | ...
  target_id text,
  created_at timestamptz not null default now()
);

create index if not exists contributions_user_idx on public.contributions (user_id);
create index if not exists contributions_created_idx on public.contributions (created_at desc);

alter table public.contributions enable row level security;
-- Leitura pública (o ranking aparece no site); escrita SÓ com login e a
-- autoria é forçada pelo JWT: user_id TEM que ser o auth.uid() da sessão.
grant select, insert on public.contributions to anon, authenticated;
drop policy if exists "contributions_select" on public.contributions;
create policy "contributions_select" on public.contributions
  for select using (true);
drop policy if exists "contributions_insert_auth" on public.contributions;
create policy "contributions_insert_auth" on public.contributions
  for insert with check (auth.uid() is not null and user_id = auth.uid()::text);

-- ── 2) SONG_VOTES — votar exige login, 1 voto por usuário ──────────
-- (a contagem agregada em songs.votes continua pública)
drop policy if exists "song_votes_all" on public.song_votes;
drop policy if exists "song_votes_select" on public.song_votes;
drop policy if exists "song_votes_insert" on public.song_votes;
drop policy if exists "song_votes_own" on public.song_votes;
create policy "song_votes_select" on public.song_votes
  for select using (true);
create policy "song_votes_insert" on public.song_votes
  for insert with check (auth.uid() is not null and user_id = auth.uid()::text);
create policy "song_votes_own" on public.song_votes
  for update using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);
create policy "song_votes_delete_own" on public.song_votes
  for delete using (user_id = auth.uid()::text);

revoke insert, update, delete on public.song_votes from anon;
grant select on public.song_votes to anon, authenticated;
grant insert, update, delete on public.song_votes to authenticated;

-- Backfill: votos antigos ("user:<uuid>") viram o uuid puro — o formato
-- novo do app (user_id = auth.uid()::text) é o uuid sem prefixo.
update public.song_votes
  set user_id = substring(user_id from 6)
  where user_id like 'user:%' and substring(user_id from 6) <> '';

-- ── 3) SONG_COMMENTS — comentar exige login (autoria via JWT) ───────
alter table public.song_comments add column if not exists user_id text;

drop policy if exists "song_comments_select" on public.song_comments;
create policy "song_comments_select" on public.song_comments
  for select using (true);
drop policy if exists "song_comments_insert" on public.song_comments;
create policy "song_comments_insert" on public.song_comments
  for insert with check (auth.uid() is not null and user_id = auth.uid()::text);

revoke insert on public.song_comments from anon;
grant select on public.song_comments to anon, authenticated;
grant insert on public.song_comments to authenticated;

-- ── 4) SONG_FEEDBACK — "corrigir cifra" também é contribuir ─────────
alter table public.song_feedback add column if not exists user_id text;

drop policy if exists "song_feedback_insert" on public.song_feedback;
create policy "song_feedback_insert" on public.song_feedback
  for insert with check (auth.uid() is not null and user_id = auth.uid()::text);

revoke insert on public.song_feedback from anon;
grant select on public.song_feedback to anon, authenticated;
grant insert on public.song_feedback to authenticated;

-- ── 5) PLAYLISTS — criar/editar/excluir exige login; ler é público ──
drop policy if exists "playlists_all" on public.playlists;
drop policy if exists "playlists_select" on public.playlists;
drop policy if exists "playlists_insert_auth" on public.playlists;
drop policy if exists "playlists_write_auth" on public.playlists;
create policy "playlists_select" on public.playlists
  for select using (true);
create policy "playlists_insert_auth" on public.playlists
  for insert with check (auth.uid() is not null);
create policy "playlists_write_auth" on public.playlists
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null);
create policy "playlists_delete_auth" on public.playlists
  for delete using (auth.uid() is not null);

revoke insert, update, delete on public.playlists from anon;
grant select on public.playlists to anon, authenticated;
grant insert, update, delete on public.playlists to authenticated;

-- ── VERIFICAÇÃO (rodar depois) ──────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname='public' AND tablename IN
--   ('contributions','song_votes','song_comments','song_feedback','playlists')
--   ORDER BY tablename, cmd;
-- INSERT INTO public.contributions (id,user_id,user_name,action) VALUES
--   ('teste','fake','X','vote');  -- deve FALHAR (anon sem login)
