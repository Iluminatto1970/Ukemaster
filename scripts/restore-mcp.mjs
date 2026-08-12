#!/usr/bin/env node
/**
 * scripts/restore-mcp.mjs
 *
 * Restaura o backup de MCPs gerado pelo scripts/backup-mcp.mjs em outra
 * máquina (ou após o PC dar pau). Compatível com o formato
 * `ukemaster-mcp-backup` v1.
 *
 * O que restaura:
 *   1. `.mcp.json` do projeto  → merge de mcpServers (mantém servidores que
 *      já existem na máquina e não estão no backup)
 *   2. Claude Code              → merge de mcpServers no ~/.claude.json
 *      (NUNCA sobrescreve o arquivo inteiro — ele tem histórico/estado)
 *   3. Claude Desktop           → merge top-level (chaves do backup vencem)
 *   4. VS Code                  → merge top-level (idem)
 *   5. Env vars dos placeholders ${...} → só com `--env-local` (grava no
 *      .env.local do projeto; em outros apps, configure na mão)
 *
 * Segurança:
 *   - Backup com `--mask` (tokens ocultos) é RECUSADO — não é restaurável.
 *   - Antes de cada escrita, o arquivo atual é copiado para `<arquivo>.bak-<timestamp>`.
 *   - `--dry-run` mostra o que seria feito sem escrever nada.
 *
 * Uso:
 *   node scripts/restore-mcp.mjs <backup.json>            # restaura (com merge)
 *   node scripts/restore-mcp.mjs <backup.json> --dry-run  # só mostra
 *   node scripts/restore-mcp.mjs <backup.json> --env-local # tb grava env vars no .env.local
 *
 * Exit code 0 = sucesso · 1 = erro/recusa.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── paths por SO (iguais aos do backup — a restauração recalcula no destino) ──
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

function parseArgs(argv) {
  const out = { file: '', dryRun: false, envLocal: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') out.dryRun = true;
    else if (argv[i] === '--env-local') out.envLocal = true;
    else if (!argv[i].startsWith('-') && !out.file) out.file = argv[i];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (!args.file) {
  console.error('❌ Uso: node scripts/restore-mcp.mjs <backup.json> [--dry-run] [--env-local]');
  process.exit(1);
}

// ── carrega e valida o backup ──────────────────────────────────────────────
let backup;
try {
  backup = JSON.parse(fs.readFileSync(args.file, 'utf-8'));
} catch (e) {
  console.error(`❌ Não consegui ler o backup em ${args.file}: ${e.message}`);
  process.exit(1);
}

if (backup.format !== 'ukemaster-mcp-backup') {
  console.error(`❌ Formato inválido: esperava "ukemaster-mcp-backup", achei "${backup.format}".`);
  process.exit(1);
}
if (backup.masked) {
  console.error('❌ Este backup foi gerado com --mask (tokens ocultos). Não é restaurável.');
  console.error('   Gere um backup completo: node scripts/backup-mcp.mjs');
  process.exit(1);
}
if (!Array.isArray(backup.sources)) {
  console.error('❌ Backup inválido: campo "sources" ausente ou não é uma lista.');
  console.error('   O arquivo pode estar corrompido ou ser de um formato incompatível.');
  process.exit(1);
}

/** Lê JSON com tolerância (arquivo-alvo corrompido → null + aviso). */
function readJsonTolerant(p, label) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    console.warn(`   ⚠️ ${label} não é um JSON válido — tratado como inexistente (não será sobrescrito por ele).`);
    return null;
  }
}

console.log(`📦 Backup: ${backup.createdAt} (${backup.hostname}, ${backup.platform})`);
console.log(`   Fontes no backup: ${backup.sources.map((s) => s.name).join(', ')}${backup.missing.length ? ` | ausentes na origem: ${backup.missing.join(', ')}` : ''}`);
console.log(`   Env vars: ${Object.keys(backup.env || {}).join(', ') || '(nenhuma)'}`);
if (args.dryRun) console.log('\n🔎 MODO DRY-RUN — nada será escrito.\n');

// ── destino de cada fonte na MÁQUINA ATUAL ─────────────────────────────────
const TARGETS = {
  project: () => path.join(ROOT, '.mcp.json'),
  'claude-code': claudeCodePath,
  'claude-desktop': claudeDesktopPath,
  vscode: vscodeMcpPath,
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let changed = 0;
let skipped = 0;

/** Copia o arquivo atual para .bak antes de alterar (nunca sobrescreve). */
function backupFile(target) {
  if (!fs.existsSync(target)) return;
  const bak = `${target}.bak-${timestamp}`;
  if (fs.existsSync(bak)) return bak; // já feito nesta execução
  fs.copyFileSync(target, bak);
  return bak;
}

/** Merge de mcpServers: servidores do backup vencem por nome; os demais ficam. */
function mergeMcpServers(existing, incoming) {
  return { ...(existing || {}), ...(incoming || {}) };
}

/** Merge top-level: chaves do backup vencem; o resto do arquivo atual fica. */
function mergeTopLevel(existing, incoming) {
  return { ...(existing || {}), ...(incoming || {}) };
}

for (const source of backup.sources) {
  const resolver = TARGETS[source.name];
  if (!resolver) {
    console.log(`   ⏭️  ${source.name}: tipo desconhecido — ignorado.`);
    skipped++;
    continue;
  }
  const target = resolver();
  const existing = fs.existsSync(target) ? readJsonTolerant(target, source.name) : null;

  let next;
  if (source.name === 'claude-code') {
    // ~/.claude.json tem histórico/estado — SÓ mexe no mcpServers
    next = existing || {};
    next.mcpServers = mergeMcpServers(next.mcpServers, source.content);
  } else if (source.name === 'project') {
    next = existing || {};
    next.mcpServers = mergeMcpServers(next.mcpServers, source.content);
  } else {
    // claude-desktop / vscode — arquivos dedicados a MCP: merge top-level
    next = mergeTopLevel(existing, source.content);
  }

  const count = Object.keys(source.content || {}).length;
  const action = existing ? 'mescla' : 'cria';
  console.log(`   ${action === 'cria' ? '➕' : '🔀'} ${source.name}: ${target}`);
  if (source.name === 'claude-code' || source.name === 'project') {
    console.log(`       mcpServers: ${count} do backup (merge por nome)`);
  } else {
    console.log(`       ${count} chave(s) do backup (merge top-level)`);
  }

  if (args.dryRun) {
    changed++;
    continue;
  }

  const bak = backupFile(target);
  if (bak) console.log(`       📎 backup do atual → ${path.basename(bak)}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(next, null, 2));
  changed++;
}

// ── env vars: só com --env-local, grava no .env.local do projeto ──────────
if (backup.env && Object.keys(backup.env).length) {
  if (args.envLocal) {
    const envFile = path.join(ROOT, '.env.local');
    const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf-8').split(/\r?\n/) : [];
    let added = 0;
    for (const [name, value] of Object.entries(backup.env)) {
      const idx = lines.findIndex((l) => l.startsWith(`${name}=`));
      const line = `${name}=${value}`;
      if (idx >= 0) {
        lines[idx] = line;
      } else {
        lines.push(line);
        added++;
      }
    }
    if (args.dryRun) {
      console.log(`   🔀 env-local: ${Object.keys(backup.env).join(', ')} → .env.local (${args.dryRun ? 'dry-run' : 'gravando'})`);
    } else {
      const bak = `${envFile}.bak-${timestamp}`;
      if (fs.existsSync(envFile)) fs.copyFileSync(envFile, bak);
      fs.writeFileSync(envFile, lines.join('\n') + '\n');
      console.log(`   🔀 env-local: ${Object.keys(backup.env).join(', ')} → .env.local${added ? ` (+${added} novas)` : ''}`);
    }
  } else {
    console.log(`   ⚠️ Env vars do backup NÃO foram aplicadas. Configure manualmente:`);
    for (const name of Object.keys(backup.env)) console.log(`       export ${name}=<valor>`);
    console.log('      ou rode com --env-local para gravar no .env.local do projeto.');
  }
}

console.log('');
if (args.dryRun) {
  console.log(`🔎 Dry-run concluído: ${changed} fonte(s) prontas para restaurar, ${skipped} ignorada(s).`);
  console.log('   Rode sem --dry-run para aplicar.');
} else {
  console.log(`✅ Restauração concluída: ${changed} fonte(s) aplicada(s), ${skipped} ignorada(s).`);
  console.log('   ⚠️ Os apps (Claude Code/Desktop/VS Code) só carregam MCPs no início da sessão —');
  console.log('   reinicie o app para as configurações valerem.');
}
