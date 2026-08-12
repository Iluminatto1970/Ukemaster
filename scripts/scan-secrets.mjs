/**
 * Scan de segredos no bundle — roda no build (após o vite build).
 *
 * Varre os artefatos que vão ao NAVEGADOR (dist/assets/* e dist/index.html)
 * e falha o build se encontrar:
 *   - GOCSPX-...          → client secret do Google OAuth (formato real)
 *   - Nomes de env secret → ADMIN_SECRET, CRON_SECRET, SUPABASE_ACCESS_TOKEN,
 *                           SUPABASE_PROJECT_REF, CLERK_SECRET_KEY,
 *                           GOOGLE_OAUTH_CLIENT_SECRET, CTX7_API_KEY,
 *                           service_role (nome da key de serviço do Supabase)
 *
 * Se qualquer padrão aparecer no bundle, é vazamento: segredos NUNCA devem
 * ir ao cliente (só envs publishable com prefixo VITE_/NEXT_PUBLIC_).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TARGET_DIR = join(ROOT, 'dist');
const SCAN_GLOBS = ['assets', 'index.html']; // arquivos servidos ao cliente

const PATTERNS = [
  { label: 'Google OAuth client secret (GOCSPX-)', re: /GOCSPX-[A-Za-z0-9_-]{8,}/ },
  { label: 'env ADMIN_SECRET', re: /\bADMIN_SECRET\b/ },
  { label: 'env CRON_SECRET', re: /\bCRON_SECRET\b/ },
  { label: 'env SUPABASE_ACCESS_TOKEN', re: /\bSUPABASE_ACCESS_TOKEN\b/ },
  { label: 'env SUPABASE_PROJECT_REF', re: /\bSUPABASE_PROJECT_REF\b/ },
  { label: 'env CLERK_SECRET_KEY', re: /\bCLERK_SECRET_KEY\b/ },
  { label: 'env GOOGLE_OAUTH_CLIENT_SECRET', re: /\bGOOGLE_OAUTH_CLIENT_SECRET\b/ },
  { label: 'env CTX7_API_KEY', re: /\bCTX7_API_KEY\b/ },
  { label: 'service_role (Supabase service key)', re: /\bservice_role\b/ },
];

/** Coleta arquivos (recursivo) de dist/assets + index.html na raiz. */
function collectFiles(dir, out = []) {
  if (!existsSafe(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, out);
    else out.push(p);
  }
  return out;
}

function existsSafe(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

const files = collectFiles(join(TARGET_DIR, 'assets'));
if (existsSafe(join(TARGET_DIR, 'index.html'))) files.push(join(TARGET_DIR, 'index.html'));

if (files.length === 0) {
  console.error('❌ scan-secrets: dist/ vazio — rode após o vite build.');
  process.exit(1);
}

const hits = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const { label, re } of PATTERNS) {
    if (re.test(content)) {
      hits.push({ file: relative(ROOT, file), label });
    }
  }
}

if (hits.length > 0) {
  console.error('\n❌ SEGREDO(S) DETECTADO(S) NO BUNDLE — build abortado:\n');
  for (const h of hits) console.error(`   • ${h.file}: ${h.label}`);
  console.error(
    '\n   Segredos nunca devem ir ao bundle. Confira as envs: só variáveis\n   publishable (VITE_*/NEXT_PUBLIC_*) podem ser lidas no cliente.\n'
  );
  process.exit(1);
}

console.log(`✅ scan-secrets: ${files.length} arquivo(s) varrido(s) — nenhum segredo no bundle.`);
