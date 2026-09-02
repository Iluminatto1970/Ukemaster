-- 2026-09-02 — RLS songs: leitura deixa de ser "todos veem tudo" e passa a
-- exigir login OU marcação explícita is_public = true.
--
-- ANTES: songs_select_public using (true) — qualquer anon lia a tabela
-- inteira do acervo.
-- DEPOIS:
--   SELECT  → authenticated: tudo; anon: só onde is_public = true.
--   INSERT  → só authenticated.
--   UPDATE  → só authenticated.
--   DELETE  → só admin (e-mail no JWT = iluminatto@gmail.com).
--
-- Coluna nova: is_public boolean not null default false (default seguro:
-- registros antigos ficam invisíveis ao anon até alguém marcá-los).

alter table public.songs
  add column if not exists is_public boolean not null default false;

create index if not exists songs_is_public_idx on public.songs (is_public);

-- Derruba policies atuais de songs (incluindo a "songs_select_public" do
-- migration-rls-songs.sql e qualquer política órfã) antes de recriar.
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

-- 1) Leitura: autenticados veem tudo; anon só vê is_public = true.
create policy "songs_select_auth_or_public" on public.songs
  for select to anon, authenticated
  using (
    auth.role() = 'authenticated'
    or is_public = true
  );

-- 2) Inserção: só autenticados.
create policy "songs_insert_auth" on public.songs
  for insert to authenticated
  with check (auth.uid() is not null);

-- 3) Atualização: só autenticados.
create policy "songs_update_auth" on public.songs
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- 4) Exclusão: só admin (e-mail do dono no JWT).
create policy "songs_delete_admin" on public.songs
  for delete to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'iluminatto@gmail.com');

-- GRANTs: leitura segue aberta no PostgREST (a policy filtra); escrita só
-- para authenticated, delete só pelo policy acima.
grant select on public.songs to anon, authenticated;
grant insert, update on public.songs to authenticated;
