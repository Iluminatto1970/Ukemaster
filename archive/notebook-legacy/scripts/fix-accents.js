#!/usr/bin/env node
/**
 * fix-accents.js — Corretor de acentos inconsistentes em `title` e `artist`
 * na tabela `songs` do Supabase do Ukemaster Pro (v2).
 *
 * A inteligência roda no banco, em duas camadas:
 *   • ukm_restore_accents(txt): escolhe a forma majoritária do cluster
 *     (ukm_norm = minúsculas, sem acento, NFC, espaços colapsados),
 *     exigindo maioria robusta (>= 3 ocorrências e >= 2x a forma atual);
 *   • ukm_is_accent_upgrade(origem, candidato): salvaguardas por linha —
 *     nunca remove/troca acento existente, nunca muda só maiúscula, nunca
 *     churn Unicode NFD<->NFC, e todo token acentuado novo precisa existir
 *     acentuado fora do próprio cluster.
 *
 * RPC usada: search_songs_accents_dry_run(col, after_id, before_id,
 * only_pending, lim) — janela por id (after exclusivo, before inclusivo).
 *
 * Uso (a partir da pasta deste repositório — as credenciais vêm do .env.local
 * do projeto UkuMaster ou do ambiente):
 *
 *   # 1. Relatório completo (nada é alterado):
 *   node scripts/fix-accents.js
 *
 *   # 2. Relatório só do que ainda está pendente (após aplicações parciais):
 *   node scripts/fix-accents.js --pendente
 *
 *   # 3. Aplicar de verdade (exige SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/fix-accents.js --aplicar
 *
 *   # 4. Aplicar apenas um campo:
 *   node scripts/fix-accents.js --aplicar --campo title
 *
 * Flags: --campo title|artist|ambos · --janela N (padrão 10000)
 *        --limite N (para o dry-run após N linhas — teste rápido)
 *        --excluir arquivo.json (array de row_id a pular no --aplicar)
 *        --pendente (só linhas ainda não corrigidas) · --retomar (checkpoint)
 *
 * Fluxo recomendado: dry-run -> revisar o relatório JSON (e criar o
 * --excluir para as propostas indesejadas) -> rodar com --aplicar.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ------------------------- argumentos ------------------------------ */
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valorArg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};
const MODO_APLICAR = flag('--aplicar');
const SO_PENDENTE = flag('--pendente');
const RETOMAR = flag('--retomar');
const CAMPO = valorArg('--campo') || 'ambos'; // title | artist | ambos
const JANELA = Math.max(200, parseInt(valorArg('--janela') || '10000', 10));
const LIMITE_LINHAS = Math.max(0, parseInt(valorArg('--limite') || '0', 10));
const ARQ_EXCLUIR = valorArg('--excluir'); // JSON com array de row_id a pular

if (!['title', 'artist', 'ambos'].includes(CAMPO)) {
  console.error(`--campo invalido: "${CAMPO}" (use title, artist ou ambos)`);
  process.exit(1);
}
const CAMPOS = CAMPO === 'ambos' ? ['title', 'artist'] : [CAMPO];

/* ------------------------ credenciais ------------------------------ */
function pegaEnv(txt, chave) {
  const m = txt.match(new RegExp(`^\\s*${chave}\\s*=\\s*"?([^"\\n\\r]*)"?(?:\\s|#.*)?$`, 'm'));
  return m ? m[1].trim() : undefined;
}

function carregarEnv() {
  let url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  let anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  let service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const fallbacks = [
    path.resolve(__dirname, '../../../Sistemas_Dev/UkuMaster/.env.local'),
    path.resolve(__dirname, '../../UkuMaster/.env.local'),
    path.resolve(process.cwd(), '.env.local'),
  ];
  for (const envLocal of fallbacks) {
    if (!fs.existsSync(envLocal)) continue;
    const txt = fs.readFileSync(envLocal, 'utf8');
    url = url || pegaEnv(txt, 'VITE_SUPABASE_URL') || pegaEnv(txt, 'SUPABASE_URL');
    anon = anon || pegaEnv(txt, 'VITE_SUPABASE_ANON_KEY') || pegaEnv(txt, 'SUPABASE_ANON_KEY');
    service = service || pegaEnv(txt, 'SUPABASE_SERVICE_ROLE_KEY');
  }
  if (!url || !anon) {
    console.error('Credenciais ausentes: defina SUPABASE_URL/VITE_SUPABASE_URL e a anon key');
    console.error('(no ambiente ou no .env.local do projeto UkuMaster).');
    process.exit(1);
  }
  return { url: url.replace(/\/+$/, ''), anon, service };
}

const { url: SUPA, anon: ANON, service: SERVICE } = carregarEnv();

if (MODO_APLICAR && !SERVICE) {
  console.error('Modo --aplicar exige SUPABASE_SERVICE_ROLE_KEY no .env.local/ambiente.');
  console.error('(Bypassa o RLS para escrever em toda a tabela — a anon key nao consegue.)');
  process.exit(1);
}
if (MODO_APLICAR && SERVICE === ANON) {
  console.error('SERVICE_ROLE é igual à anon key — chave errada. Abortando por segurança.');
  process.exit(1);
}

const REST = '/rest/v1';

// row_ids a excluir da aplicação (revisão humana do relatório de dry-run)
let EXCLUIR = new Set();
if (ARQ_EXCLUIR) {
  try {
    const lista = JSON.parse(fs.readFileSync(path.resolve(ARQ_EXCLUIR), 'utf8'));
    EXCLUIR = new Set(Array.isArray(lista) ? lista : []);
    console.log(`Excluindo ${EXCLUIR.size} row_id(s) indicados em ${ARQ_EXCLUIR}`);
  } catch (e) {
    console.error(`--excluir: não consegui ler ${ARQ_EXCLUIR}: ${e.message}`);
    process.exit(1);
  }
}

/* --------------------- helpers de requisição ----------------------- */
async function bordaJanela(campo, afterId, limite) {
  // Devolve a borda INCLUSIVA da janela (beforeId) e se há mais linhas depois.
  // Usa offset no índice da PK: 3 requisições leves por janela, sem baixar ids.
  const filtroBase = () => {
    const p = new URLSearchParams({ select: 'id', [campo]: 'not.eq.', order: 'id.asc' });
    if (afterId) p.set('id', `gt.${afterId}`);
    return p;
  };
  const pega = async (p) => {
    const resp = await fetch(`${SUPA}${REST}/songs?${p}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!resp.ok) throw new Error(`ids HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    return resp.json();
  };

  // linha na posição limite-1 (borda da janela)
  const pBorda = filtroBase(); pBorda.set('limit', '1'); pBorda.set('offset', String(limite - 1));
  const linhaBorda = await pega(pBorda);
  if (!linhaBorda.length) {
    // janela parcial: pega a última linha existente
    const pUltima = filtroBase(); pUltima.set('limit', '1');
    const ultima = await pega(pUltima);
    return { beforeId: ultima.length ? ultima[0].id : null, temMais: false };
  }
  // existe linha na posição limite? (há mais catálogo depois da janela?)
  const pProx = filtroBase(); pProx.set('limit', '1'); pProx.set('offset', String(limite));
  const proxima = await pega(pProx);
  return { beforeId: linhaBorda[0].id, temMais: proxima.length > 0 };
}

async function rpcDryRun(campo, afterId, beforeId, onlyPending, limite) {
  const resp = await fetch(`${SUPA}${REST}/rpc/search_songs_accents_dry_run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({
      p_column: campo,
      p_after_id: afterId || '',
      p_before_id: beforeId || '',
      p_only_pending: onlyPending,
      p_limit: limite,
    }),
  });
  if (!resp.ok) {
    const corpo = (await resp.text()).slice(0, 300);
    throw new Error(`dry_run HTTP ${resp.status}: ${corpo}`);
  }
  return resp.json();
}

/* --------------------------- relatório ----------------------------- */
function linhaRelatorio(r) {
  const partes = [];
  if (r.majority_count != null && r.current_count != null) {
    partes.push(`maioria ${r.majority_count} vs atual ${r.current_count}`);
  }
  if (r.context_key) partes.push(`contexto: ${r.context_key}`);
  return `${JSON.stringify(r.old_value)} -> ${JSON.stringify(r.new_value)}  [${partes.join(' · ')}]`;
}

/* -------------------------- relatório acumulado -------------------- */
function sufixoRelatorio() {
  return MODO_APLICAR ? 'aplicado' : 'relatorio';
}

function lerRelatorioExistente(sufixo) {
  try {
    const dir = path.join(__dirname, '..');
    const arquivos = fs.readdirSync(dir)
      .filter((f) => f.startsWith(`relatorio-acentos-${sufixo}-`) && f.endsWith('.json'))
      .sort();
    if (!arquivos.length) return {};
    return JSON.parse(fs.readFileSync(path.join(dir, arquivos[arquivos.length - 1]), 'utf8'));
  } catch {
    return {};
  }
}

/* ---------------------------- aplicar ------------------------------ */
async function aplicar(campo, propostas, stats) {
  if (!propostas.length) return;

  console.log(`\nAplicando ${propostas.length} correções em "${campo}"...`);
  for (let i = 0; i < propostas.length; i++) {
    const r = propostas[i];

    // 1) Revalidação: o valor no banco ainda é o que o dry-run viu?
    const check = await fetch(
      `${SUPA}${REST}/songs?id=eq.${encodeURIComponent(r.row_id)}&select=${campo}`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    if (!check.ok) throw new Error(`Falha revalidação ${r.row_id}: HTTP ${check.status}`);
    const arr = await check.json();
    const valorAtual = arr.length ? arr[0][campo] : undefined;
    if (valorAtual !== r.old_value) {
      console.warn(`  ! ${r.row_id}: valor mudou desde o dry-run (${JSON.stringify(valorAtual)}) — pulando.`);
      stats.pulados++;
      continue;
    }

    // 2) Update pela PK, marcando accents_fixed_at
    const upd = await fetch(`${SUPA}${REST}/songs?id=eq.${encodeURIComponent(r.row_id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ [campo]: r.new_value, accents_fixed_at: new Date().toISOString() }),
    });
    if (!upd.ok) {
      const corpo = (await upd.text()).slice(0, 200);
      throw new Error(`UPDATE ${r.row_id} falhou: HTTP ${upd.status} ${corpo}`);
    }
    stats.aplicados++;
    if (stats.aplicados % 25 === 0) {
      console.log(`   ${stats.aplicados}/${propostas.length} atualizadas...`);
    }
  }
}

/* -------------------------- checkpoint ----------------------------- */
// Arquivos POR CAMPO: permite rodar title e artist em paralelo sem
// sobrescrever o progresso um do outro.
const estadoPath = (campo) => path.join(__dirname, `.fix-accents-state-${campo}.json`);
const propostasPath = (campo) => path.join(__dirname, `.fix-accents-propostas-${campo}.jsonl`);

function salvarCheckpoint(campo, afterId) {
  try {
    fs.writeFileSync(estadoPath(campo), JSON.stringify({ campo, afterId }, null, 2));
  } catch (e) {
    console.warn(`  checkpoint: ${e.message}`);
  }
}

function lerCheckpoint(campo) {
  try {
    const st = JSON.parse(fs.readFileSync(estadoPath(campo), 'utf8'));
    return st.campo === campo ? st.afterId : '';
  } catch {
    return '';
  }
}

// Propostas persistem em JSONL (append): uma interrupção não perde o que
// já foi encontrado; na montagem do relatório, dedupe por row_id (última
// ocorrência vence — janela refeita após timeout pode duplicar).
function registrarProposta(campo, r) {
  try { fs.appendFileSync(propostasPath(campo), JSON.stringify(r) + '\n'); } catch { /* best-effort */ }
}

function lerPropostasAcumuladas(campo) {
  try {
    const linhas = fs.readFileSync(propostasPath(campo), 'utf8').split('\n').filter(Boolean);
    const mapa = new Map();
    for (const l of linhas) {
      try { const r = JSON.parse(l); mapa.set(r.row_id, r); } catch { /* linha truncada */ }
    }
    return [...mapa.values()];
  } catch { return []; }
}

/* ----------------------------- main -------------------------------- */
const DATA_HORA = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

(async () => {
  const inicio = Date.now();
  console.log('Ukemaster — corretor de acentos em songs (v2)');
  console.log(`Modo: ${MODO_APLICAR ? 'APLICAR' : 'relatorio (dry-run — nada é alterado)'}`);
  console.log(`Campos: ${CAMPOS.join(', ')} · janela ${JANELA}${SO_PENDENTE ? ' · só pendentes' : ''}${LIMITE_LINHAS ? ` · LIMITE DE TESTE: ${LIMITE_LINHAS} linhas` : ''}\n`);

  const relatorio = {
    gerado_em: new Date().toISOString(),
    modo: MODO_APLICAR ? 'aplicar' : 'dry-run',
    total_propostas: 0,
    campos: {},
  };
  const statsGlobais = { aplicados: 0, pulados: 0 };

  for (const campo of CAMPOS) {
    let afterId = RETOMAR ? lerCheckpoint(campo) : '';
    if (afterId) console.log(`Retomando "${campo}" depois de ${afterId}`);

    // Acumula o relatório entre execuções (mesmo campo = substitui)
    const existente = lerRelatorioExistente(sufixoRelatorio());
    const statsBase = existente.campos?.[campo] || {};

    const stats = {
      lidas: 0, janelas: 0, correcoes: 0,
      primeiroId: null, ultimoId: null,
      exemplos: [], todas: [], aplicados: 0, pulados: 0,
    };
    let janelaAtual = JANELA;
    let tentativasJanela = 0;

    while (true) {
      // 1) borda da janela via REST (leve, usa a PK)
      let borda;
      try {
        borda = await bordaJanela(campo, afterId, janelaAtual);
      } catch (e) {
        if (/57014|statement timeout/i.test(e.message) && janelaAtual > 50) {
          janelaAtual = Math.max(50, Math.floor(janelaAtual / 2));
          console.warn(`timeout nos ids — reduzindo janela para ${janelaAtual}...`);
          continue;
        }
        throw e;
      }
      if (!borda.beforeId) break; // catálogo esgotado
      const beforeId = borda.beforeId;

      // 2) decisões da RPC para esta janela
      let lote;
      try {
        lote = await rpcDryRun(campo, afterId, beforeId, SO_PENDENTE, janelaAtual);
      } catch (e) {
        if (/57014|statement timeout/i.test(e.message)) {
          tentativasJanela++;
          // 1) encolhe a janela até o piso de 50 (borda recalculada no topo)
          if (janelaAtual > 50) {
            janelaAtual = Math.max(50, Math.floor(janelaAtual / 2));
            console.warn(`timeout na RPC — reduzindo janela para ${janelaAtual}...`);
            continue; // refaz a MESMA janela, menor (afterId inalterado)
          }
          // 2) no piso, o timeout costuma ser carga transitória (o cron de
          //    importação roda em paralelo) — pausa e tenta de novo
          if (tentativasJanela <= 8) {
            console.warn(`timeout no piso — pausa e nova tentativa (${tentativasJanela}/8, janela ${janelaAtual})...`);
            await new Promise((r) => setTimeout(r, 2500));
            continue;
          }
        }
        if (/404|not found/i.test(e.message)) {
          console.error('A RPC search_songs_accents_dry_run não existe — aplique a migration.');
          process.exit(2);
        }
        throw e;
      }
      tentativasJanela = 0; // janela bem-sucedida: reseta o contador

      stats.janelas++;
      stats.lidas += lote.length;

      for (const r of lote) {
        if (r.corrigido === true) continue;
        if (!r.new_value || r.new_value === r.old_value) continue;
        if (EXCLUIR.has(r.row_id)) continue; // revisão humana: pular
        stats.correcoes++;
        if (stats.primeiroId === null) stats.primeiroId = r.row_id;
        stats.ultimoId = r.row_id;
        if (stats.exemplos.length < 15) stats.exemplos.push(r);
        stats.todas.push(r);
        registrarProposta(campo, r); // sobrevive a interrupções
      }

      if (MODO_APLICAR || true) salvarCheckpoint(campo, beforeId);

      afterId = beforeId;          // janela EXCLUSIVA → paginação exata
      if (!borda.temMais) break;   // não há mais catálogo depois da borda
      if (LIMITE_LINHAS && stats.lidas >= LIMITE_LINHAS) break; // teste rápido
      process.stdout.write(
        `${campo}: ${stats.lidas} linhas, ${stats.correcoes} propostas...   \r`
      );
    }
    console.log('');

    console.log(`---------- ${campo} ----------`);
    console.log(`Linhas com variante acentuada: ${stats.lidas} (em ${stats.janelas} janelas)`);
    console.log(`Correções propostas:           ${stats.correcoes}`);
    if (stats.correcoes > 0) {
      console.log(`Faixa de ids:                  ${stats.primeiroId} ... ${stats.ultimoId}`);
      console.log('Amostra (até 15):');
      for (const r of stats.exemplos) console.log('  • ' + linhaRelatorio(r));
    }

    if (MODO_APLICAR && stats.todas.length) {
      await aplicar(campo, stats.todas, stats);
      if (stats.pulados > 0) console.log(`   ! ${stats.pulados} puladas (valor mudou desde o dry-run).`);
    }

    // Relatório usa o ACUMULADO (persistido), não só o desta execução
    const acumuladas = lerPropostasAcumuladas(campo);
    statsGlobais.aplicados += stats.aplicados;
    statsGlobais.pulados += stats.pulados;
    relatorio.campos[campo] = {
      ...statsBase,
      linhas_avaliadas: (statsBase.linhas_avaliadas || 0) + stats.lidas,
      janelas: (statsBase.janelas || 0) + stats.janelas,
      correcoes: acumuladas.length,
      primeiro_id: acumuladas[0]?.row_id || statsBase.primeiro_id,
      ultimo_id: acumuladas[acumuladas.length - 1]?.row_id || statsBase.ultimo_id,
      exemplos: acumuladas.slice(0, 15),
      propostas: acumuladas,
    };
    relatorio.total_propostas = Object.values(relatorio.campos)
      .reduce((s, c) => s + (c.correcoes || 0), 0);
  }

  /* ---------------------- arquivo de relatório --------------------- */
  const arquivo = path.join(__dirname, '..', `relatorio-acentos-${sufixoRelatorio()}-${DATA_HORA}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(relatorio, null, 2));
  // Concluído: limpa os arquivos de trabalho do(s) campo(s) processado(s)
  for (const campo of CAMPOS) {
    try { fs.unlinkSync(estadoPath(campo)); } catch { /* sem checkpoint */ }
    try { fs.unlinkSync(propostasPath(campo)); } catch { /* sem jsonl */ }
  }

  console.log('\n' + '='.repeat(62));
  console.log(
    `Resumo — ${Object.entries(relatorio.campos)
      .map(([c, s]) => `${c}: ${s.correcoes}`)
      .join(' · ')}`
  );
  if (MODO_APLICAR) {
    console.log(`${statsGlobais.aplicados} linhas atualizadas · ${statsGlobais.pulados} puladas.`);
  } else {
    console.log('Nenhuma linha foi alterada (dry-run).');
    console.log('Revise o relatório e, se estiver OK, rode com --aplicar');
    console.log('(exige SUPABASE_SERVICE_ROLE_KEY no .env.local do UkuMaster).');
  }
  console.log(`Relatório completo: ${arquivo}`);
  console.log(`${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  process.exit(0);
})().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  console.error('Checkpoint por campo em scripts/.fix-accents-state-<campo>.json e propostas em .fix-accents-propostas-<campo>.jsonl — rode o mesmo comando para retomar sem perder nada.');
  process.exit(1);
});
