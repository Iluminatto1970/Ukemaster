/**
 * Verifica o estado das importações: cron_log recente (quem rodou, o que importou)
 * e o total por plataforma/idioma. Autentica pela SUPABASE_SERVICE_ROLE_KEY do
 * .env.local quando presente (sem login UkeMaster); cai para o login
 * CRON_UKEMATER_* (dist-cron/.env) se a service key não estiver disponível.
 */
import fs from 'node:fs';
import path from 'node:path';

// Carrega dist-cron/.env (credenciais do cron) com fallback .env.local
function loadEnv(file: string) {
  const env: Record<string, string> = {};
  try {
    const content = fs.readFileSync(file, 'utf-8');
    content.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*?)"?\s*$/);
      if (m) env[m[1]] = m[2];
    });
  } catch {}
  return env;
}
const env = { ...loadEnv(path.join(process.cwd(), 'dist-cron/.env')), ...loadEnv(path.join(process.cwd(), '.env.local')) };

const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const email = env.CRON_UKEMATER_EMAIL;
const password = env.CRON_UKEMATER_PASSWORD;

async function main() {
  // 1) Service role key (bypassa RLS, sem login) — caminho preferido.
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
  let headers: Record<string, string>;
  if (serviceKey) {
    console.log('autenticando via SUPABASE_SERVICE_ROLE_KEY (sem login UkeMaster)');
    headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  } else {
    // 2) Fallback: login como UkeMaster (password grant).
    const login = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) {
      console.error('login UkeMaster falhou', login.status);
      process.exit(1);
    }
    const { access_token } = (await login.json()) as { access_token: string };
    headers = { apikey: anon, Authorization: `Bearer ${access_token}` };
  }

  // Últimas 25 execuções do cron_log (mais recentes primeiro)
  const logRes = await fetch(
    `${url}/rest/v1/cron_log?select=${encodeURIComponent('ran_at,platform,imported,duplicates,errors,worker,message')}&order=${encodeURIComponent('ran_at.desc')}&limit=25`,
    { headers }
  );
  if (!logRes.ok) {
    console.error('cron_log falhou', logRes.status);
    process.exit(1);
  }
  const rows = (await logRes.json()) as any[];
  console.log('=== ÚLTIMAS EXECUÇÕES (cron_log) ===');
  for (const r of rows) {
    const when = new Date(r.ran_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    console.log(
      `${when}  [${r.worker || '?'}] ${r.platform || '?'}  importou=${r.imported ?? 0} dup=${r.duplicates ?? 0} err=${r.errors ?? 0}${r.message ? '  msg=' + r.message.slice(0, 60) : ''}`
    );
  }

  // Totais por plataforma nas últimas 200 importações
  const impRes = await fetch(
    `${url}/rest/v1/cron_imports?select=${encodeURIComponent('platform,imported_at')}&order=${encodeURIComponent('imported_at.desc')}&limit=200`,
    { headers }
  );
  if (impRes.ok) {
    const imps = (await impRes.json()) as { platform: string; imported_at: string }[];
    const byPlatform = new Map<string, number>();
    for (const i of imps) byPlatform.set(i.platform, (byPlatform.get(i.platform) || 0) + 1);
    console.log('\n=== ÚLTIMAS 200 IMPORTAÇÕES POR PLATAFORMA ===');
    for (const [p, c] of [...byPlatform.entries()].sort((a, b) => b[1] - a[1])) console.log(`${p}: ${c}`);
    const oldest = new Date(imps[imps.length - 1]?.imported_at || 0);
    console.log('janela:', oldest.toLocaleString('pt-BR'), '→', new Date(imps[0]?.imported_at || 0).toLocaleString('pt-BR'));
  } else {
    console.log('cron_imports falhou', impRes.status);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
