-- 2026-08-11 — SEGURANÇA: fecha o RLS de public.songs para escrita anônima.
--
-- ANTES: qualquer pessoa SEM login conseguia ALTERAR músicas do acervo via
-- REST (PATCH anon retornava 204 e mudava título/cifra/votos de verdade).
-- DELETE já era negado a anônimos; SELECT é público por design (acervo).
--
-- DEPOIS:
--   SELECT  → público (anon + authenticated)      [acervo aberto]
--   INSERT  → só autenticados (contribuir com login)
--   UPDATE  → só autenticados (editar cifra com login)
--   DELETE  → só o proprietário (e-mail no JWT = iluminatto@gmail.com)
--
-- Obs.: o banco pode ter policies de songs criadas FORA das migrations (nomes
-- desconhecidos) — o loop abaixo derruba TODAS antes de recriar, para nenhuma
-- policy antiga frouxa continuar valendo (RLS combina policies com OR).

-- 1) Derrota todas as policies atuais de public.songs
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'songs'
  loop
    execute format('drop policy if exists %I on public.songs', p.policyname);
  end loop;
end $$;

alter table public.songs enable row level security;

-- 2) Leitura pública (acervo aberto para todos)
create policy "songs_select_public" on public.songs
  for select to anon, authenticated
  using (true);

-- 3) Contribuição (nova cifra) exige login
create policy "songs_insert_auth" on public.songs
  for insert to authenticated
  with check (auth.uid() is not null);

-- 4) Edição de cifra exige login
create policy "songs_update_auth" on public.songs
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- 5) Exclusão: só o proprietário (e-mail presente no JWT da sessão)
create policy "songs_delete_admin" on public.songs
  for delete to authenticated
  using (coalesce(auth.jwt() ->> 'email', '') = 'iluminatto@gmail.com');
