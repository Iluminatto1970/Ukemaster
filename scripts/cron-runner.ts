/**
 * CLI do cron de plataformas (gera ukemaster-cron.mjs): flags --platform/--artist/--repair/--fast/--budget/--reset, leitura de .env e FILA DE COMANDOS das máquinas.
 */
/**
 * Cron runner standalone — roda o cron de plataformas fora da Vercel.
 *
 * Uso (após bundlar com esbuild → ukemaster-cron.mjs):
 *   node ukemaster-cron.mjs                 # modo automático (cursor Supabase)
 *   node ukemaster-cron.mjs --fast          # sem delays (teste rápido)
 *   node ukemaster-cron.mjs --platform cifraclub-br
 *   node ukemaster-cron.mjs --artist "https://www.cifraclub.com.br/alceu-valenca/"
 *   node ukemaster-cron.mjs --reset         # recomeça a varredura do início
 *   node ukemaster-cron.mjs --repair        # re-scrapeia e repara conteúdo vazio (preserva ids)
 *   node ukemaster-cron.mjs --update        # re-scrapeia o que JÁ TEMOS e atualiza (conteúdo,
 *                                           # dificuldade, tom, categoria, SEO) + importa as
 *                                           # variações simplificadas novas
 *
 * Configuração via ambiente (ou .env ao lado do script):
 *   CRON_ENV_FILE          Caminho do .env (padrão: ".env")
 *   CRON_TIME_BUDGET_MS    Orçamento por execução (padrão: 480000 = 8 min)
 *   CRON_WORKER_NAME       Nome DESTA máquina (ex.: "acer", "windows"). Usado
 *                          pela fila de comandos do painel admin (target).
 *                          Padrão: hostname do sistema.
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / ...
 *
 * Exit code: 0 = ok, 1 = houve erros no processamento.
 */

import fs from 'fs';
import path from 'path';
import { runPlatformCron, getSupabaseEnv, cronHeaders, getWorkerName } from '../src/lib/platformCron';

// ── Carrega .env (parse simples, sem dependências) ────────────────────────
function loadEnv(file: string) {
  try {
    const content = fs.readFileSync(path.resolve(file), 'utf-8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"]*?)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // sem .env — usa apenas o ambiente
  }
}

const envFile = process.env.CRON_ENV_FILE || '.env';
loadEnv(envFile);

// ── Parse de argumentos simples ────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name: string) => {
  const i = args.findIndex((a) => a === name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
};

const fast = args.includes('--fast');
const reset = args.includes('--reset');
const repair = args.includes('--repair');
const update = args.includes('--update');

// Orçamento: prioriza --budget <ms> (cross-platform), depois env, depois padrão
const budgetArg = getArg('--budget');
const timeBudgetMs = budgetArg
  ? Number(budgetArg)
  : Number(process.env.CRON_TIME_BUDGET_MS || (fast ? 30_000 : 480_000));

// Timeout absoluto: o processo SEMPRE termina, mesmo se algo inesperado
// travar (DNS, rede, etc.). Orçamento + 2 min de folga.
const hardTimer = setTimeout(() => {
  console.error(JSON.stringify({ fatal: true, error: 'Hard timeout excedido — encerrando.' }));
  process.exit(2);
}, timeBudgetMs + 120_000);
hardTimer.unref?.();

// ═════════════════════════════════════════════════════════════════════════
// FILA DE COMANDOS — rodada imediata disparada pelo painel admin
// ═════════════════════════════════════════════════════════════════════════
// O painel admin grava comandos na tabela `worker_commands` (target:
// 'acer' | 'windows' | 'all'). No INÍCIO de cada execução, a máquina
// consulta os comandos pendentes para o SEU nome (CRON_WORKER_NAME, senão
// hostname) e processa o mais antigo: pending → processing → done|failed.
//
//  - claimCommand usa PATCH atômico com filtro `status=eq.pending`: se duas
//    máquinas tentarem o mesmo comando, só uma vence (0 linhas na outra).
//  - Respeita os delays normais das plataformas (fast:false — qualidade
//    antes de pressa); o orçamento de tempo limita a rodada.
//  - Se processou ≥ 1 comando, a execução ENCERRA aqui (o fluxo normal roda
//    na próxima rodada de 30 min — o comando É a rodada desta vez).
//  - Degradação graciosa: sem a tabela (schema antigo) ou sem as credenciais
//    do UkeMaster, retorna 0 e o fluxo normal roda como sempre.
// ─────────────────────────────────────────────────────────────────────────

interface WorkerCommand {
  id: string;
  command: string;
  platform_id: string | null;
  artist_url: string | null;
  update_existing: boolean | null;
  target: string;
  status: string;
  picked_at: string | null;
}

/** Comandos para esta máquina (target 'all' ou igual ao nome).
 * Busca pending + processing (para RE-TENTAR os presos — ver TTL abaixo) e
 * filtra o target NO JS: o filtro `or=(...)` do PostgREST parseia mal
 * parênteses aninhados (PGRST100), então é mais robusto filtrar aqui.
 * limit alto (100): a fila é pequena (limpeza em 24 h) e o filtro por
 * target é local — assim nenhum comando fica escondido atrás dos outros. */
async function fetchPendingCommands(
  url: string,
  key: string,
  worker: string
): Promise<WorkerCommand[]> {
  try {
    const res = await fetch(
      `${url}/rest/v1/worker_commands?select=${encodeURIComponent(
        'id,command,platform_id,artist_url,update_existing,target,status,picked_at'
      )}&status=in.(pending,processing)&order=created_at.asc&limit=100`,
      { headers: await cronHeaders(key) }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as WorkerCommand[];
    // Match por prefixo: o Desktop (Linux Mint) pode rodar com hostname
    // `desktop-qkmmsjr` sem CRON_WORKER_NAME — um comando `target=desktop`
    // deve ser pego por ele igualmente (target é o nome da máquina).
    return rows.filter(
      (r) =>
        r.target === 'all' ||
        r.target === worker ||
        (r.target && (worker ?? '').startsWith(r.target + '-'))
    );
  } catch {
    return []; // tabela ausente / RLS sem credenciais → segue fluxo normal
  }
}

/** TTL de comando preso: um processing sem conclusão há >30 min é de uma
 * máquina que caiu no meio (crash) — outro worker pode re-pegá-lo. */
const STUCK_COMMAND_TTL_MS = 30 * 60_000;

/** Pega o comando de forma ATÔMICA (só vence quem PATCHa com o filtro
 * certo — pending, ou processing antigo demais que outro worker abandonou). */
async function claimCommand(
  url: string,
  key: string,
  id: string,
  worker: string,
  filter = 'status=eq.pending'
): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/worker_commands?id=eq.${id}&${filter}`, {
      method: 'PATCH',
      headers: {
        ...(await cronHeaders(key)),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status: 'processing', worker, picked_at: new Date().toISOString() }),
    });
    if (!res.ok) return false;
    const rows = (await res.json()) as { worker?: string }[];
    return rows?.length === 1 && rows[0]?.worker === worker;
  } catch {
    return false;
  }
}

/** Marca o comando como done/failed com o resumo do resultado. */
async function finishCommand(
  url: string,
  key: string,
  id: string,
  status: 'done' | 'failed',
  result: string
): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/worker_commands?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        ...(await cronHeaders(key)),
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status, finished_at: new Date().toISOString(), result }),
    });
  } catch {
    // não derruba a execução
  }
}

/** Limpa comandos finalizados com mais de 24 h (a fila não cresce sem limite). */
async function cleanupOldCommands(url: string, key: string): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await fetch(
      `${url}/rest/v1/worker_commands?status=in.(done,failed,canceled)&finished_at=lt.${encodeURIComponent(cutoff)}`,
      { method: 'DELETE', headers: await cronHeaders(key) }
    );
  } catch {
    // sem problema — a fila pequena não atrapalha
  }
}

/** Processa os comandos pendentes. Retorna quantos foram processados. */
async function processPendingCommands(
  sb: { url: string; key: string },
  budgetMs: number
): Promise<number> {
  const worker = getWorkerName();
  const commands = await fetchPendingCommands(sb.url, sb.key, worker);
  if (commands.length === 0) {
    await cleanupOldCommands(sb.url, sb.key);
    return 0;
  }

  let processed = 0;
  const startedAt = Date.now();
  const stuckCutoff = new Date(Date.now() - STUCK_COMMAND_TTL_MS).toISOString();
  for (const cmd of commands) {
    if (processed > 0 && Date.now() - startedAt > budgetMs) break;
    // Comando preso em processing (máquina caiu no meio)? O PATCH só vence
    // se ainda estiver processing com picked_at mais antigo que o cutoff.
    const isStuck =
      cmd.status === 'processing' &&
      Boolean(cmd.picked_at) &&
      Date.parse(cmd.picked_at as string) < Date.now() - STUCK_COMMAND_TTL_MS;
    const claimed = isStuck
      ? await claimCommand(
          sb.url,
          sb.key,
          cmd.id,
          worker,
          `status=eq.processing&picked_at=lt.${encodeURIComponent(stuckCutoff)}`
        )
      : await claimCommand(sb.url, sb.key, cmd.id, worker);
    if (!claimed) continue; // outro worker pegou (ou ainda é recente)
    processed++;
    const remainingMs = Math.max(30_000, budgetMs - (Date.now() - startedAt));
    try {
      const result = await runPlatformCron({
        platformId: cmd.platform_id || undefined,
        artistUrl: cmd.artist_url || undefined,
        updateExisting: Boolean(cmd.update_existing),
        fast: false, // respeita os delays das plataformas (qualidade > pressa)
        timeBudgetMs: remainingMs,
      });
      const summary = `${result.totalImported} novas, ${result.totalUpdated} atualizadas, ${result.totalDuplicates} dup, ${result.totalErrors} err (${result.artistsProcessed} artistas)`;
      await finishCommand(
        sb.url,
        sb.key,
        cmd.id,
        result.ok ? 'done' : 'failed',
        result.message ? `${summary} — ${result.message}` : summary
      );
    } catch (e: any) {
      await finishCommand(sb.url, sb.key, cmd.id, 'failed', `Erro: ${e?.message || String(e)}`);
    }
  }

  await cleanupOldCommands(sb.url, sb.key);
  return processed;
}

// ═════════════════════════════════════════════════════════════════════════
async function main() {
  const sb = getSupabaseEnv();
  const hasDb = Boolean(sb.url && sb.key);

  // 1) Comandos do painel admin (rodada imediata nas máquinas) — se houver,
  //    processa e encerra (o fluxo normal roda na próxima execução).
  if (hasDb) {
    const commandsProcessed = await processPendingCommands(sb, timeBudgetMs);
    if (commandsProcessed > 0) {
      console.log(
        JSON.stringify(
          {
            ranAt: new Date().toISOString(),
            worker: getWorkerName(),
            commandsProcessed,
            message: 'Comandos do painel processados — fluxo normal adiado para a próxima rodada.',
          },
          null,
          2
        )
      );
      process.exit(0);
    }
  }

  // 2) Fluxo normal do cron (cursor persistente)
  const result = await runPlatformCron({
    platformId: getArg('--platform'),
    artistUrl: getArg('--artist'),
    limit: getArg('--limit') ? Number(getArg('--limit')) : undefined,
    fast,
    reset,
    repairContent: repair,
    updateExisting: update,
    timeBudgetMs,
  });

  console.log(
    JSON.stringify(
      {
        ranAt: result.ranAt,
        ok: result.ok,
        message: result.message,
        totalImported: result.totalImported,
        totalDuplicates: result.totalDuplicates,
        totalErrors: result.totalErrors,
        totalRepaired: result.totalRepaired,
        totalUpdated: result.totalUpdated,
        totalAlreadyKnown: result.totalAlreadyKnown,
        artistsProcessed: result.artistsProcessed,
        cursor: result.cursor,
        results: result.results.map((r) => ({
          platform: r.platform,
          imported: r.imported,
          duplicates: r.duplicates,
          errors: r.errors,
          repaired: r.repaired,
          updated: r.updated,
          errorMessage: r.errorMessage,
        })),
      },
      null,
      2
    )
  );

  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ fatal: true, error: e?.message || String(e) }));
  process.exit(1);
});
