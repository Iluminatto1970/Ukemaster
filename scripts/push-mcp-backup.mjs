#!/usr/bin/env node
/**
 * scripts/push-mcp-backup.mjs
 *
 * Gera o backup dos MCPs (scripts/backup-mcp.mjs) e faz commit + push no
 * repositório privado `Iluminatto1970/ukemaster-mcp-backup`.
 *
 * O repo de backup fica em mcp-backup/ (subpasta do projeto, ignorada pelo
 * git principal). É um repositório git próprio com o remote do GitHub.
 *
 * Uso:
 *   node scripts/push-mcp-backup.mjs            # gera, commita e pusha
 *   node scripts/push-mcp-backup.mjs --dry-run  # gera e mostra, sem push
 *   node scripts/push-mcp-backup.mjs --mask     # NÃO recomendado — backup sem tokens
 *
 * ⚠️ O backup contém TOKENS SECRETOS. O repositório é PRIVADO — não o torne
 * público e não compartilhe os arquivos.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'mcp-backup');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const mask = args.includes('--mask');

if (mask) {
  console.error('❌ --mask não é suportado aqui: o backup sem tokens não serve para backup/restauração.');
  process.exit(1);
}

if (!fs.existsSync(path.join(BACKUP_DIR, '.git'))) {
  console.error(`❌ ${BACKUP_DIR} não é um repositório git. Configure antes:`);
  console.error('   git init -b main && git remote add origin https://github.com/Iluminatto1970/ukemaster-mcp-backup.git');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const outFile = path.join(BACKUP_DIR, `mcp-backup-${today}.json`);

// 1. Gera o backup
console.log('1️⃣  Gerando backup...');
execSync(`node scripts/backup-mcp.mjs --out "${outFile}"`, { stdio: 'inherit', cwd: ROOT });

// 2. Commit
console.log('2️⃣  Commitando...');
const hasChanges = execSync('git status --porcelain', { cwd: BACKUP_DIR })
  .toString()
  .trim();
if (!hasChanges) {
  console.log('   Nada para commitar (backup do dia já está no repo).');
} else {
  execSync('git add -A', { cwd: BACKUP_DIR });
  execSync(`git commit -m "backup MCP ${today}"`, { cwd: BACKUP_DIR, stdio: 'inherit' });
}

// 3. Push
if (dryRun) {
  console.log(`\n🔎 DRY-RUN — sem push. Backup local: ${outFile}`);
  console.log('   Para enviar: node scripts/push-mcp-backup.mjs');
  process.exit(0);
}

console.log('3️⃣  Enviando para o GitHub (repo privado)...');
execSync('git push origin main', { cwd: BACKUP_DIR, stdio: 'inherit' });

console.log(`\n✅ Backup ${today} enviado para Iluminatto1970/ukemaster-mcp-backup (privado).`);
