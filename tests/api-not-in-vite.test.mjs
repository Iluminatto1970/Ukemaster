/**
 * Teste de regressão — nenhuma rota /api/* pode cair no middleware do Vite.
 *
 * Causa corrigida: GET /api/admin/users-stats?after=<ISO> não tinha handler
 * no Express e caía no vite.middlewares, que tentava transformar
 * "users-stats.ts?after=..." como módulo — o esbuild derivava o loader da
 * extensão COM query ("...459Z" → `Invalid loader value`) e derrubava o HMR
 * com full-reload (o app "pulava" para a HOME do nada).
 *
 * O teste sobe o server.ts real em modo dev (NODE_ENV=development), aponta
 * requisições para TODAS as rotas /api existentes (incluindo uma inexistente
 * e a problemática com querystring) e garante que a resposta é JSON do
 * Express — nunca HTML do index.html transformado pelo Vite, nem texto de
 * erro do esbuild/Vite.
 *
 * Uso: npm test  (não precisa de servidor externo; o server sobe em porta
 * livre aleatória via PORT=0 — e, se o server não suportar PORT=0, o teste
 * escolhe uma porta livre e passa em PORT).
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, child, timeoutMs = 45000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    // O servidor caiu (ex.: EADDRINUSE) — falha rápido com o motivo.
    if (child && child.exitCode !== null) {
      throw new Error(`processo do servidor morreu (exit ${child.exitCode})`);
    }
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (res.status < 500) return; // servidor aceitando conexões
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Servidor não subiu em ${timeoutMs}ms: ${lastErr}`);
}

/** Coleta todas as rotas /api existentes a partir da pasta api/ + server.ts. */
function collectApiRoutes() {
  const routes = new Set(['/api/nao-existe']); // guard 404 sempre testado
  const apiDir = path.join(ROOT, 'api');
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const rel = `${prefix}/${entry.name.replace(/\.ts$/, '')}`.replace(/\/index$/, '');
      routes.add(`/api${rel === '' ? '' : rel}`.replace('/api/api', '/api'));
    }
  };
  walk(apiDir);
  // Rotas registradas apenas no server.ts (sem arquivo em api/)
  routes.add('/api/health');
  // A rota que disparava o bug original (polling com querystring)
  routes.add('/api/admin/users-stats?after=2026-09-30T03:19:39.459Z');
  return [...routes];
}

const VITE_SIGNATURES = [
  'invalid loader',
  'esbuild',
  '<script type="module" src="/@vite/',
  '/@vite/client',
  'internal server error',
  'transformrequest',
  'failed to load url',
];

function looksLikeViteError(body) {
  const lower = String(body).toLowerCase();
  return VITE_SIGNATURES.some((sig) => lower.includes(sig));
}

async function main() {
  // ATENÇÃO: PORT=0 no ambiente (ou passado por engano) faria o server.ts
  // cair na porta fixa 3000 (Number('0') || 3000). Só usamos PORT quando é
  // uma porta válida (>0); caso contrário escolhemos uma livre real.
  const envPort = Number(process.env.PORT) || 0;
  const port = envPort > 0 ? envPort : await getFreePort();
  const base = `http://127.0.0.1:${port}`;

  console.log(`▶ Subindo server.ts em modo dev (porta ${port})…`);
  // server.ts: Number('0') || 3000 → 0 é falsy e cairia na porta 3000
  // fixa! Sempre passamos uma porta livre REAL (nunca "0").
  if (!port) throw new Error('porta livre inválida');
  // Windows: "C:\Program Files\nodejs" tem espaço — via shell precisa de
  // aspas no comando. O caminho seguro é invocar node sem shell: process.execPath
  // com args em array não passa pelo cmd.exe. (O erro ENOENT original era o
  // bash do Git resolvendo o caminho; spawn direto do node funciona.)
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'server.ts'],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        PORT: String(port),
        // Sem Supabase real: os handlers devem responder erro JSON limpo
        // (401/403/500/502), nunca cair no Vite — isso é o que o teste garante.
        VITE_SUPABASE_URL: '',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        SUPABASE_ACCESS_TOKEN: '',
        SUPABASE_PROJECT_REF: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let serverLog = '';
  child.stdout.on('data', (d) => (serverLog += d));
  child.stderr.on('data', (d) => (serverLog += d));
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[server saiu com código ${code}]\n${serverLog.slice(-1500)}`);
    }
  });
  const tailLog = () => serverLog.split('\n').slice(-25).join('\n');

  let failures = 0;
  try {
    await waitForServer(`${base}/api/health`, child);
    console.log('✔ servidor no ar\n');

    for (const route of collectApiRoutes()) {
      const res = await fetch(`${base}${route}`, {
        headers: { 'user-agent': UA },
        // Não segue redirect: uma resposta de redirect pra "/" também seria
        // um sintoma de a rota ter caído no SPA do Vite.
        redirect: 'manual',
      });
      const body = await res.text();
      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      // Alguns handlers legítimos NÃO são JSON (robots.txt, sitemap.xml,
      // prerender de crawler em HTML) — o que o teste garante é que a
      // resposta veio do HANDLER do Express, não do Vite (nem shell do SPA,
      // nem erro de transform do esbuild).
      const handledByExpress =
        isJson ||
        ct.includes('text/plain') ||
        ct.includes('text/xml') ||
        ct.includes('application/xml') ||
        // Prerender de crawler (api/home, api/musica) e erros de handler
        // (ex.: sitemap sem Supabase) podem vir em text/html gerado pelo
        // PRÓPRIO handler — o que importa é NÃO ser o shell do Vite
        // (o shell SPA do Vite sempre injeta /@vite/client).
        (ct.includes('text/html') && !body.includes('/@vite/client'));
      const viteLike = looksLikeViteError(body) || looksLikeViteError(serverLog);

      const problems = [];
      if (viteLike) problems.push('resposta/log com assinatura do Vite/esbuild');
      if (!handledByExpress) problems.push(`content-type inesperado "${ct}" — não parece resposta do Express`);

      if (problems.length) {
        failures++;
        console.log(`✗ ${route}`);
        console.log(`    ${problems.join('; ')}`);
        console.log(`    corpo: ${body.slice(0, 160).replace(/\n/g, ' ')}`);
      } else {
        console.log(`✓ ${route} → ${res.status} JSON`);
      }
    }

    // O log do servidor não pode ter registrado erro do loader do esbuild
    if (/invalid loader/i.test(serverLog)) {
      failures++;
      console.log('\n✗ server.log contém "Invalid loader" — requisição /api chegou ao Vite');
    }
  } finally {
    child.kill('SIGTERM');
    // Windows: garante que o processo morreu antes de liberar a porta
    await new Promise((r) => setTimeout(r, 500));
    if (!child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignora */
      }
    }
  }

  console.log(`\n${failures === 0 ? '✔ TODOS' : `✗ ${failures}`} — rotas /api nunca caem no Vite`);
  if (failures > 0) {
    console.log('\n--- tail do log do servidor ---\n' + tailLog());
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ Falha no teste:', err);
  process.exit(1);
});
