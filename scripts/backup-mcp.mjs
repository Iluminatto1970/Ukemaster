#!/usr/bin/env node
/**
 * scripts/backup-mcp.mjs
 *
 * Backup de TODAS as configurações MCP do UkeMaster em UM arquivo JSON
 * restaurável em outra máquina (scripts/restore-mcp.mjs).
 *
 * O que é coletado:
 *   1. `.mcp.json` do projeto (Supabase, Context7, Hostinger DNS/Domains)
 *   2. `mcpServers` do Claude Code  (~/.claude.json)
 *   3. Claude Desktop               (claude_desktop_config.json)
 *   4. VS Code                      (User/mcp.json)
 *   5. Env vars que os placeholders `${...}` dos MCPs resolvem
 *      (SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, HOSTINGER_API_TOKEN,
 *      CTX7_API_KEY) — lidas do ambiente e do .env.local do projeto
 *
 * Uso:
 *   node scripts/backup-mcp.mjs                     # backup completo (com tokens)
 *   node scripts/backup-mcp.mjs --mask              # tokens mascarados (não restaurável)
 *   node scripts/backup-mcp.mjs --out mcp-backup.json
 *
 * ⚠️ O backup contém TOKENS SECRETOS — guarde em local seguro (pendrive,
 * cofre, repo privado criptografado). NUNCA envie para o git.
 *
 * Exit code 0 = sucesso · 1 = erro.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── paths por SO ──────────────────────────────────────────────────────────
const isWin = process.platform === 'win32';
const APPDATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

function claudeCodePath() {
  return path.join(os.homedir(), '.claude.json');
}
function claudeDesktopPath() {
  return isWin
    ? path.join(APPDATA, 'Claude', 'claude_desktop_config.json')
    : path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}
function vscodeMcpPath() {
  return isWin
    ? path.join(APPDATA, 'Code', 'User', 'mcp.json')
    : path.join(os.homedir(), '.config', 'Code', 'User', 'mcp.json');
}

// Env vars que os MCPs usam via ${...} no .mcp.json do projeto
const MCP_ENV_VARS = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'HOSTINGER_API_TOKEN',
  'CTX7_API_KEY',
];

/** Lê JSON com tolerância a erros (retorna null se falhar). */
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

function maskValue(v) {
  if (typeof v !== 'string') return v;
  if (v.length <= 8) return '***';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/** Mascara valores sensíveis (token/secret/key) num objeto qualquer. */
function maskDeep(obj, key = '') {
  if (Array.isArray(obj)) return obj.map((x, i) => maskDeep(x, key));
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = maskDeep(v, k);
    return out;
  }
  if (/token|secret|api[_-]?key|password|auth/i.test(key)) return maskValue(obj);
  return obj;
}

/** Lê as env vars do shell e do .env.local (sem sobrescrever com vazio). */
function collectEnvVars() {
  const out = {};
  const envLocal = readDotEnvLocal();
  for (const name of MCP_ENV_VARS) {
    const val = process.env[name] || envLocal[name] || '';
    if (val) out[name] = val;
  }
  return out;
}

function readDotEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseArgs(argv) {
  const out = { mask: false, out: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--mask') out.mask = true;
    else if (argv[i] === '--out') out.out = argv[i + 1] ?? '';
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const sources = [];
const missing = [];

function addSource(name, file, extract) {
  if (!fs.existsSync(file)) {
    missing.push(name);
    return;
  }
  const content = readJson(file);
  sources.push({ name, file, content: extract ? extract(content) : content });
}

// 1. Projeto — .mcp.json inteiro (só mcpServers)
addSource('project', path.join(ROOT, '.mcp.json'), (d) => d?.mcpServers ?? {});

// 2. Claude Code — só mcpServers do ~/.claude.json (não o resto do arquivo)
addSource('claude-code', claudeCodePath(), (d) => d?.mcpServers ?? {});

// 3. Claude Desktop — arquivo inteiro (pequeno)
addSource('claude-desktop', claudeDesktopPath(), null);

// 4. VS Code — arquivo inteiro (servers + inputs)
addSource('vscode', vscodeMcpPath(), null);

const env = collectEnvVars();

const backup = {
  format: 'ukemaster-mcp-backup',
  version: 1,
  createdAt: new Date().toISOString(),
  hostname: os.hostname(),
  platform: process.platform,
  masked: args.mask,
  sources,
  missing,
  env,
};

if (args.mask) {
  backup.sources = backup.sources.map((s) => ({ ...s, content: maskDeep(s.content) }));
  backup.env = maskDeep(backup.env);
}

const outFile = args.out
  ? path.resolve(args.out)
  : path.join(ROOT, 'mcp-backup', `mcp-backup-${new Date().toISOString().slice(0, 10)}.json`);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(backup, null, 2));

console.log(`✅ Backup MCP gerado: ${outFile}`);
console.log(`   Fontes: ${sources.map((s) => s.name).join(', ')}${missing.length ? ` | ausentes: ${missing.join(', ')}` : ''}`);
console.log(`   Env vars: ${Object.keys(env).join(', ') || '(nenhuma encontrada)'}`);
console.log(args.mask
  ? '   ⚠️ MODO MASK — tokens ocultos, NÃO restaurável.'
  : '   ⚠️ Contém tokens secretos — guarde em local seguro (fora do git).');
