-- ═══════════════════════════════════════════════════════════════════
-- UkeMaster Pro — Registro público de certificados emitidos
-- Execute no Supabase Dashboard → SQL Editor (idempotente, pode rodar
-- quantas vezes quiser).
--
-- Cada certificado emitido (UKM-ANO-XXXXXX) é registrado aqui para que
-- a página pública /verificar/:code consiga validar a autenticidade.
-- Os dados são denormalizados de propósito (trail_title/level/holder_name)
-- para a verificação não depender do cliente — o registro é a fonte da
-- verdade do que foi emitido.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.certificates (
  number text primary key,          -- UKM-2026-XXXXXX (código de verificação)
  trail_id text not null,           -- id da trilha (learningTrails.ts)
  trail_title text not null,        -- título da trilha (denormalizado)
  level text not null,              -- iniciante | intermediario | avancado
  holder_name text not null,        -- nome impresso no certificado
  issued_on text not null,          -- data de emissão (yyyy-mm-dd)
  created_at timestamptz not null default now()
);

-- Registro aberto por design (como o acervo): leitura pública para
-- qualquer um poder verificar; escrita aberta porque a emissão é
-- client-side (mesmo modelo de votos/playlists). O upsert usa a PK
-- (number), então re-emitir é idempotente.
alter table public.certificates enable row level security;
drop policy if exists "certificates_all" on public.certificates;
create policy "certificates_all" on public.certificates
  for all using (true) with check (true);

-- ── VERIFICAÇÃO (rodar depois) ─────────────────────────────────────
--   SELECT * FROM pg_policies WHERE tablename='certificates';
--   SELECT * FROM public.certificates LIMIT 5;  -- 200 (público) ✅
--   INSERT INTO public.certificates (number, trail_id, trail_title,
--     level, holder_name, issued_on)
--   VALUES ('UKM-2026-TESTE01', 'teste', 'Teste', 'iniciante',
--     'Teste', '2026-08-10');  -- 201 (permitido) ✅
-- ═══════════════════════════════════════════════════════════════════
