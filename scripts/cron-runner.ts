/**
 * CLI do cron de plataformas (gera ukemaster-cron.mjs): flags --platform/--artist/--repair/--fast/--budget/--reset e leitura de .env.
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
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL / VITE_SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / ...
 *
 * Exit code: 0 = ok, 1 = houve erros no processamento.
 */

import fs from 'fs';
import path from 'path';
import { runPlatformCron } from '../src/lib/platformCron';

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

async function main() {
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
