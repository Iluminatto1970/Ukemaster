/**
 * Agendamento Supabase (pg_cron + pg_net) — redundância da varredura de cifras.
 *
 * O Desktop processa a fila de plataformas continuamente; se ele cair/parar,
 * este agendamento dispara a rotação na Vercel a cada 30 min (mesma fila e
 * mesmo lease — sem duplicação). A rotação automática inclui TODAS as
 * plataformas habilitadas, inclusive CifraClub (pt) — mantendo o repertório
 * atualizado em todos os idiomas.
 *
 * O ADMIN_SECRET é lido do .env.local e injetado no SQL em um arquivo
 * temporário (apagado ao final) — NUNCA vai para o git.
 *
 * Uso: node scripts/setup-supabase-cron.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();

function loadEnv(file) {
  const env = {};
  try {
    const content = fs.readFileSync(file, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    });
  } catch {}
  return env;
}

const env = loadEnv(path.join(root, '.env.local'));
const secret = env.ADMIN_SECRET;
if (!secret) {
  console.error('❌ ADMIN_SECRET não encontrado no .env.local');
  process.exit(1);
}

const sql = `-- Agendamento Supabase: varredura de plataformas de cifras (redundância ao Desktop).
-- Se o Desktop cair, o pg_cron dispara a rotação na Vercel a cada 30 min.
-- A rotação automática inclui TODAS as plataformas habilitadas — inclusive
-- CifraClub Brasil (pt) — mantendo o repertório atualizado em todos os idiomas.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ukemaster-rotacao-plataformas')
where exists (select 1 from cron.job where jobname = 'ukemaster-rotacao-plataformas');

select cron.schedule(
  'ukemaster-rotacao-plataformas',
  '*/30 * * * *',
  $cron$
    select net.http_post(
      url := 'https://ukemasterpro.com/api/scrape-platforms',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-admin-secret', '${secret}'
      ),
      body := '{}',
      timeout_milliseconds := 60000
    );
  $cron$
);
`;

const tmp = path.join(os.tmpdir(), `supabase-cron-${Date.now()}.sql`);
fs.writeFileSync(tmp, sql, 'utf-8');
try {
  console.log('▶ Aplicando agendamento no Supabase...');
  const out = execFileSync(
    'npx',
    ['--no-install', 'supabase', 'db', 'query', '--linked', '-f', tmp],
    { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }
  );
  console.log(out.trim() || 'SQL executado sem saída.');
  console.log('✅ Agendamento criado/atualizado.');
} catch (e) {
  console.error('❌ Falha ao aplicar o SQL:');
  console.error(e.stderr?.toString() || e.message);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { force: true });
}

// Verificação: lista os agendamentos do cron
try {
  const check = execFileSync(
    'npx',
    ['--no-install', 'supabase', 'db', 'query', '--linked', '--output', 'table',
     "select jobid, jobname, schedule, active from cron.job where jobname like 'ukemaster%'"],
    { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], shell: true }
  );
  console.log('\n=== AGENDAMENTOS CRON ===');
  console.log(check.trim());
} catch (e) {
  console.error('(verificação não disponível)');
  console.error(e.stderr?.toString() || e.message);
}
