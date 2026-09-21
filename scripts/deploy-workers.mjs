#!/usr/bin/env node
/**
 * UkeMaster Pro — deploy do worker (dist-cron) para as máquinas do proprietário.
 *
 * Copia dist-cron/ukemaster-cron.mjs para as máquinas-alvo, preservando o
 * dist-cron/.env local de cada uma (nunca sobrescreve credenciais), confere o
 * hash do bundle recebido e, opcionalmente, dispara uma rodada imediata.
 *
 * Não há daemon: "reiniciar o worker" = bundle novo no disco + rodada imediata
 * (as rodadas agendadas passam a usar o bundle novo automaticamente).
 *
 * Máquinas (descoberta em scripts/deploy-vps.py, docs/CHECKLIST_CRON_UKEMATER.md):
 *   vps     → root@100.72.114.76 (Tailscale; SSH por chave; /root/ukemaster-cron)
 *   desktop → iluminatto@desktop (Tailscale; Windows; plink/pscp com senha)
 *   acer    → configurável via ACER_HOST/ACER_USER/ACER_CRON_DIR (opcional)
 *
 * Autenticação do Desktop (plink): variável DESKTOP_PW com a senha do usuário.
 * A host key é fixada por fingerprint (DESKTOP_HOSTKEY) — sem prompt interativo.
 *
 * Uso:
 *   DESKTOP_PW='...' node scripts/deploy-workers.mjs               # todas as máquinas
 *   DESKTOP_PW='...' node scripts/deploy-workers.mjs --alvo desktop
 *   node scripts/deploy-workers.mjs --alvo vps --rodada-imediata
 *   node scripts/deploy-workers.mjs --dry-run
 *
 * Flags:
 *   --alvo <vps|desktop|acer|all>   alvo do deploy (padrão: all)
 *   --rodada-imediata               roda 1 rodada curta (--budget 60000) após copiar
 *   --dry-run                        mostra o que faria, não altera nada
 *   --exigir-todas                   sai com erro se alguma máquina falhar (padrão: só avisa)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist-cron', 'ukemaster-cron.mjs');
const ENV_LOCAL = join(ROOT, 'dist-cron', '.env');

// ── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const ALVO = getOpt('--alvo', 'all');
const RODADA_IMEDIATA = args.includes('--rodada-imediata');
const DRY_RUN = args.includes('--dry-run');
const EXIGIR_TODAS = args.includes('--exigir-todas');

// ── Configuração das máquinas ───────────────────────────────────────────────
const DESKTOP_PW = process.env.DESKTOP_PW || '';
const DESKTOP_HOSTKEY = process.env.DESKTOP_HOSTKEY || 'SHA256:9r9ZMvZ0poacWczrPFuuc9mB/M4kwTio2puvmqDT+K8';
const DESKTOP_CRON_DIR = process.env.DESKTOP_CRON_DIR || ''; // ex.: C:\Users\iluminatto\dist-cron
const ACER_HOST = process.env.ACER_HOST || '';
const ACER_USER = process.env.ACER_USER || 'iluminatto';
const ACER_CRON_DIR = process.env.ACER_CRON_DIR || '';

const MACHINES = [
  {
    id: 'vps',
    host: '100.72.114.76',
    user: 'root',
    os: 'linux',
    cronDir: '/root/ukemaster-cron',
    auth: 'key', // ssh/scp com ~/.ssh/id_ed25519
  },
  {
    id: 'desktop',
    host: 'desktop',
    user: 'iluminatto',
    os: 'windows',
    cronDir: DESKTOP_CRON_DIR, // descoberto via schtasks quando não informado
    auth: 'password', // plink/pscp -pw DESKTOP_PW -hostkey <fp>
  },
  ...(ACER_HOST
    ? [{
        id: 'acer',
        host: ACER_HOST,
        user: ACER_USER,
        os: 'linux',
        cronDir: ACER_CRON_DIR,
        auth: 'key',
      }]
    : []),
];

// ── Helpers de execução ─────────────────────────────────────────────────────
function sh(cmd, cmdArgs, opts = {}) {
  try {
    const out = execFileSync(cmd, cmdArgs, {
      encoding: 'utf8',
      timeout: opts.timeout ?? 30_000,
      ...opts,
    });
    return { ok: true, out: String(out).trim() };
  } catch (err) {
    return { ok: false, out: `${err.stdout || ''}${err.stderr || ''}`.trim() || String(err.message) };
  }
}

function md5Local(file) {
  return createHash('md5').update(readFileSync(file)).digest('hex');
}

// Windows remoto às vezes responde CRLF; normaliza hash
const normHash = (s) => s.toLowerCase().replace(/[^a-f0-9]/g, '');

// ── Comandos por tipo de máquina ────────────────────────────────────────────
function plinkArgs(machine, remoteCmd, timeoutMs) {
  return ['-batch', '-ssh', '-pw', DESKTOP_PW, '-hostkey', DESKTOP_HOSTKEY,
    `${machine.user}@${machine.host}`, remoteCmd];
}

function remoteRun(machine, remoteCmd, timeoutMs = 30_000) {
  if (machine.os === 'windows') {
    return sh('plink', plinkArgs(machine, remoteCmd), { timeout: timeoutMs });
  }
  return sh('ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
     `${machine.user}@${machine.host}`, remoteCmd],
    { timeout: timeoutMs });
}

function remotePut(machine, localFile, remoteFile) {
  if (machine.os === 'windows') {
    return sh('pscp', ['-batch', '-pw', DESKTOP_PW, '-hostkey', DESKTOP_HOSTKEY,
      localFile, `${machine.user}@${machine.host}:${remoteFile}`],
      { timeout: 120_000 });
  }
  return sh('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    localFile, `${machine.user}@${machine.host}:${remoteFile}`],
    { timeout: 120_000 });
}

// Converte /c/Users/... → C:\Users\... (pscp/plink exigem caminho nativo)
function toWinPath(p) {
  if (!/^[a-zA-Z]:/.test(p) && /^\/[a-zA-Z]\//.test(p)) {
    return `${p[1].toUpperCase()}:${p.slice(2).replace(/\//g, '\\')}`;
  }
  return p;
}

// Descobre o cronDir do Desktop pela tarefa agendada (aponta para run-cron.cmd)
function discoverDesktopCronDir(machine) {
  const q = remoteRun(machine,
    'schtasks /query /fo LIST /v 2>nul | findstr /i /c:"run-cron.cmd"', 20_000);
  if (!q.ok) return '';
  // linha típica: Task To Run: "C:\Users\iluminatto\dist-cron\run-cron.cmd"
  const m = q.out.match(/([A-Za-z]:\\[^"]*?dist-cron)\\run-cron\.cmd/i);
  return m ? m[1] : '';
}

// ── Deploy em uma máquina ───────────────────────────────────────────────────
async function deploy(machine) {
  const log = (...xs) => console.log(`  [${machine.id}]`, ...xs);

  // 0) Autenticação disponível?
  if (machine.auth === 'password' && !DESKTOP_PW) {
    return { id: machine.id, ok: false, skip: true,
      msg: 'DESKTOP_PW não definida (senha do Desktop necessária)' };
  }

  // 1) Descobrir cronDir (Desktop sem caminho fixo)
  if (machine.os === 'windows' && !machine.cronDir) {
    log('descobrindo pasta do cron via tarefa agendada…');
    machine.cronDir = discoverDesktopCronDir(machine);
    if (!machine.cronDir) {
      return { id: machine.id, ok: false,
        msg: 'não achei dist-cron (defina DESKTOP_CRON_DIR ou verifique a tarefa agendada)' };
    }
    log('pasta:', machine.cronDir);
  }

  // 2) Conectividade + Node
  const ping = remoteRun(machine, 'node --version', 15_000);
  if (!ping.ok) {
    return { id: machine.id, ok: false,
      msg: `inalcançável ou sem Node: ${ping.out.split('\n')[0] || 'sem resposta'}` };
  }
  log(`conectado — Node ${ping.out.split('\n')[0].trim()}`);

  // 3) .env remoto existe? (NUNCA sobrescreve)
  const envProbe = remoteRun(machine,
    machine.os === 'windows'
      ? `if exist "${machine.cronDir}\\.env" (echo SIM) else (echo NAO)`
      : `test -f ${machine.cronDir}/.env && echo SIM || echo NAO`, 15_000);
  const temEnv = envProbe.ok && /SIM/i.test(envProbe.out);
  if (!temEnv && !DRY_RUN) {
    if (!existsSync(ENV_LOCAL)) {
      return { id: machine.id, ok: false,
        msg: `sem ${machine.cronDir}/.env e sem dist-cron/.env local de referência — configure antes` };
    }
    const putEnv = remotePut(machine, ENV_LOCAL, `${machine.cronDir}/.env`);
    if (!putEnv.ok) {
      return { id: machine.id, ok: false, msg: `falha ao criar .env: ${putEnv.out.split('\n')[0]}` };
    }
    log('⚠ .env não existia — criei a partir do local (confira CRON_WORKER_NAME!');
  } else if (temEnv) {
    log('✔ .env remoto preservado (não sobrescrito)');
  }

  // 4) Enviar bundle
  const localBundle = toWinPath(BUNDLE);
  const localHash = md5Local(BUNDLE);
  const remoteBundle = machine.os === 'windows'
    ? `${machine.cronDir}\\ukemaster-cron.mjs`
    : `${machine.cronDir}/ukemaster-cron.mjs`;
  log(`enviando bundle (${(statSync(BUNDLE).size / 1024 / 1024).toFixed(2)} MB)…`);
  if (!DRY_RUN) {
    const put = remotePut(machine, localBundle, remoteBundle);
    if (!put.ok) {
      return { id: machine.id, ok: false, msg: `falha no envio: ${put.out.split('\n')[0]}` };
    }
  }

  // 5) Conferir hash remoto
  if (!DRY_RUN) {
    const h = remoteRun(machine,
      machine.os === 'windows'
        ? `certutil -hashfile "${remoteBundle}" MD5 | findstr /v /i "hash certutil"`
        : `md5sum ${remoteBundle} | cut -d" " -f1`, 30_000);
    if (!h.ok || normHash(h.out) !== localHash) {
      return { id: machine.id, ok: false,
        msg: `hash divergente (local ${localHash.slice(0, 8)}…, remoto ${normHash(h.out).slice(0, 8) || '?'}…)` };
    }
    log(`✔ hash confere (${localHash.slice(0, 8)}…)`);
  }

  // 6) Rodada imediata (opcional) — o bundle novo entra em ação na hora
  if (RODADA_IMEDIATA && !DRY_RUN) {
    log('rodada imediata (orçamento 60s)…');
    const runCmd = machine.os === 'windows'
      ? `cd /d "${machine.cronDir}" && node ukemaster-cron.mjs --budget 60000`
      : `cd ${machine.cronDir} && node ukemaster-cron.mjs --budget 60000`;
    const r = remoteRun(machine, runCmd, 150_000);
    const tail = r.out.split('\n').slice(-6).join('\n').trim();
    log(r.ok ? 'saída:\n' + tail : '△ rodada com erros:\n' + tail);
  }

  return { id: machine.id, ok: true, msg: RODADA_IMEDIATA ? 'deploy + rodada imediata' : 'deploy OK' };
}

// ── Main ────────────────────────────────────────────────────────────────────
if (!existsSync(BUNDLE)) {
  console.error('✖ dist-cron/ukemaster-cron.mjs não existe. Rode: npm run build:cron');
  process.exit(1);
}

const selecionadas = ALVO === 'all'
  ? MACHINES
  : MACHINES.filter((m) => m.id === ALVO);
if (selecionadas.length === 0) {
  console.error(`✖ alvo desconhecido: ${ALVO} (use vps|desktop|acer|all)`);
  process.exit(1);
}

console.log(`▸ Deploy do worker — bundle ${md5Local(BUNDLE).slice(0, 8)}… (${(statSync(BUNDLE).size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`  alvos: ${selecionadas.map((m) => m.id).join(', ')}` + (DRY_RUN ? ' [DRY-RUN]' : '') + (RODADA_IMEDIATA ? ' [+ rodada imediata]' : '') + '\n');

const resultados = [];
for (const m of selecionadas) {
  console.log(`▸ ${m.id} (${m.user}@${m.host})`);
  resultados.push(await deploy(m));
  console.log('');
}

console.log('▸ Resumo');
for (const r of resultados) {
  const icon = r.ok ? '✔' : (r.skip ? '△' : '✖');
  console.log(`  ${icon} ${r.id}: ${r.msg}`);
}

const falhas = resultados.filter((r) => !r.ok && !r.skip).length;
const skips = resultados.filter((r) => r.skip).length;
if (EXIGIR_TODAS && (falhas + skips) > 0) process.exit(1);
