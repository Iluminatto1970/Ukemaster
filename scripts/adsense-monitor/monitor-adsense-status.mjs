#!/usr/bin/env node
/**
 * scripts/adsense-monitor/monitor-adsense-status.mjs
 *
 * Consulta o status de aprovação do site ukemasterpro.com na conta AdSense
 * via MCP (Appsyogi) e:
 *   1. Loga o status atual em .ukemaster/adsense-status.log (com data/hora);
 *   2. Guarda o último status conhecido em .ukemaster/adsense-status.json;
 *   3. Quando o status MUDAR para READY ("aprovado e servindo anúncios"),
 *      escreve um aviso destacado no log e dispara uma notificação do SO
 *      (Windows: msg/balão via PowerShell · Linux: notify-send).
 *
 * Roda localmente (precisa do OAuth já feito: `adsense-mcp init`) — o token
 * fica na keychain da máquina. Agendamento diário: install.sh (Windows
 * Agendador de Tarefas / crontab).
 *
 * Uso:
 *   node scripts/adsense-monitor/monitor-adsense-status.mjs
 *   node scripts/adsense-monitor/monitor-adsense-status.mjs --once   # sem notificação, só log
 *   node scripts/adsense-monitor/monitor-adsense-status.mjs --force  # notifica mesmo sem mudança
 *
 * Exit: 0 = ok · 1 = erro de conexão/MCP.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, '.ukemaster');
const LOG_FILE = path.join(STATE_DIR, 'adsense-status.log');
const STATE_FILE = path.join(STATE_DIR, 'adsense-status.json');

const DOMAIN = 'ukemasterpro.com';
const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const FORCE = args.includes('--force');

/** Resolve o entry JS do MCP para chamar com `node` (sem shell/wrapper). */
function findMcpEntry() {
  // 1) Windows: caminho padrão do npm global (o shim npm.cmd não resolve via spawn).
  const win = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules',
    '@appsyogi', 'adsense-mcp-server', 'dist', 'cli', 'index.js');
  if (fs.existsSync(win)) return win;
  // 2) npm root -g via execFileSync (funciona nos shims).
  try {
    const npmRoot = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['root', '-g'], { encoding: 'utf8' }).stdout?.trim();
    if (npmRoot) {
      const candidate = path.join(npmRoot, '@appsyogi', 'adsense-mcp-server', 'dist', 'cli', 'index.js');
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* tenta o fallback */ }
  // 3) Fallback: deixa o PATH resolver o binário (Linux/macOS).
  return 'adsense-mcp';
}

/** Chama uma ferramenta do MCP via JSON-RPC em stdio. */
function callMcpTool(toolName, argsObj = {}) {
  return new Promise((resolve, reject) => {
    const entry = findMcpEntry();
    const child = spawn(process.execPath, [entry, 'run'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: argsObj },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timeout consultando o MCP do AdSense'));
    }, 30_000);

    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const lines = out.split('\n').filter(Boolean);
        // O MCP pode responder 2 mensagens (tools/list do handshake + tools/call).
        // A que tem id:1 e result.content é a resposta da nossa chamada.
        let parsed = null;
        for (const line of lines.reverse()) {
          try {
            const msg = JSON.parse(line);
            if (msg?.id === 1 && msg?.result?.content) {
              parsed = msg.result;
              break;
            }
          } catch {
            /* linha não-JSON (log) — ignora */
          }
        }
        if (!parsed) {
          if (err.includes('No tokens found')) {
            reject(new Error('Sem token OAuth — rode `adsense-mcp init` antes.'));
          } else {
            reject(new Error(`Resposta inesperada do MCP (stderr: ${err.slice(0, 200)})`));
          }
          return;
        }
        const text = parsed.content?.[0]?.text || '';
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error(`Falha ao interpretar resposta do MCP: ${e.message}`));
      }
    });
    child.stdin.write(request + '\n');
    child.stdin.end();
  });
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastStatus: null, lastCheck: null };
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Notificação do SO (Windows balão · Linux notify-send) — silencioso se falhar. */
function notify(title, message) {
  try {
    if (process.platform === 'win32') {
      const ps = [
        `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null`,
        `$xml = New-Object Windows.UI.Notifications.ToastNotificationManager.GetTemplateContent(Windows.UI.Notifications.ToastTemplateType.ToastText02)`,
        `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode('${title}')) > $null`,
        `$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode('${message}')) > $null`,
        `$toast = New-Object Windows.UI.Notifications.ToastNotification($xml)`,
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('UkeMaster AdSense Monitor').Show($toast)`,
      ].join('; ');
      spawn('powershell', ['-NoProfile', '-Command', ps], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      }).unref();
    } else if (fs.existsSync('/usr/bin/notify-send')) {
      spawn('/usr/bin/notify-send', [title, message], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    /* notificação é best-effort */
  }
}

async function main() {
  let sites;
  try {
    sites = await callMcpTool('adsense_list_sites');
  } catch (e) {
    log(`⚠ Falha ao consultar o MCP: ${e.message}`);
    console.error(e.message);
    process.exit(1);
  }

  const site = sites?.sites?.find((s) => s.domain === DOMAIN);
  if (!site) {
    log(`⚠ Site ${DOMAIN} não encontrado na conta AdSense (sites conhecidos: ${(sites?.sites || []).map((s) => s.domain).join(', ') || 'nenhum'}).`);
    process.exit(0);
  }

  const status = site.status; // READY | GETTING_READY | NEEDS_ATTENTION | REQUIRES_REVIEW
  const state = loadState();
  const changed = status !== state.lastStatus;
  const isReady = status === 'READY';

  log(`Status de ${DOMAIN}: ${status}${changed ? ' (MUDOU de ' + (state.lastStatus || '—') + ')' : ''}`);

  if (isReady && (changed || FORCE)) {
    log('🎉🎉🎉 SITE APROVADO — o AdSense está servindo anúncios em ukemasterpro.com! 🎉🎉🎉');
    if (!ONCE) {
      notify('UkeMaster — AdSense APROVADO 🎉', 'O site ukemasterpro.com está aprovado e servindo anúncios!');
    }
  } else if (changed && !ONCE) {
    // Mudou para outro estado que não READY — só informa se for algo que exige ação.
    if (status === 'NEEDS_ATTENTION' || status === 'REQUIRES_REVIEW') {
      log(`⚠ Atenção: status mudou para ${status} — pode exigir ação no painel do AdSense.`);
      notify('UkeMaster — AdSense: ' + status, `O site ${DOMAIN} mudou para ${status}. Veja o painel do AdSense.`);
    }
  }

  saveState({ lastStatus: status, lastCheck: new Date().toISOString() });
  process.exit(0);
}

main();
