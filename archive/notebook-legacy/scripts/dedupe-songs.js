#!/usr/bin/env node
/**
 * dedupe-songs.js — Higienização: detecta e remove duplicatas de músicas na
 * tabela `songs` do Supabase do Ukemaster Pro.
 *
 * Duplicata = mesmo (ukm_norm(title), ukm_norm(artist)) — comparação sem
 * acento, sem diferença de caixa e com espaços colapsados. O acervo tem
 * 394.313 linhas, mas só ~62.545 músicas distintas: os scrapers reimportaram
 * o catálogo várias vezes (ex.: "Friends — Ed Sheeran" x19).
 *
 * A detecção é materializada NO BANCO na tabela `songs_dedupe_plan`
 * (função `songs_dedupe_refresh()`), porque cada agregação completa leva
 * ~25 s sobre 685 MB — inviável via API. O plano é o RELATÓRIO: fica
 * congelado, auditável, e o script apenas o pagina (instantâneo).
 *
 * Critério de sobrevivente (keep): maior `votes` → maior `views` →
 * `created_at` mais recente → título mais longo → id maior (desempate
 * determinístico).
 *
 * Uso (as credenciais vêm do .env.local do projeto UkuMaster ou ambiente):
 *
 *   # 1. Atualizar o plano (recria songs_dedupe_plan; leva ~30-60 s):
 *   node scripts/dedupe-songs.js --atualizar
 *
 *   # 2. Relatório (nada é alterado) — grava relatorio-dedupe-*.json:
 *   node scripts/dedupe-songs.js
 *
 *   # 3. Aplicar a deduplicação (exige SUPABASE_SERVICE_ROLE_KEY):
 *   node scripts/dedupe-songs.js --aplicar
 *
 *   # 3b. Aplicar pulando grupos em revisão + retomar após interrupção:
 *   node scripts/dedupe-songs.js --aplicar --excluir revisao.json --retomar
 *
 * Flags:
 *   --atualizar   roda songs_dedupe_refresh() no banco (recria o plano)
 *   --aplicar     executa a deduplicação conforme o plano atual
 *   --limite N    processa apenas os primeiros N grupos (teste rápido)
 *   --excluir f   JSON com grupos a PULAR no modo aplicar. Formatos aceitos:
 *                   ["<keep_id-uuid>", ...]  ou
 *                   [{"norm_title": "...", "norm_artist": "..."}, ...]
 *   --retomar     continua uma aplicação interrompida do checkpoint
 *                 (scripts/.dedupe-apply-state.json)
 *
 * Precauções do --aplicar:
 *   • Exige service_role (nunca aplica com a anon key);
 *   • Revalida cada grupo antes de deletar (keep existe, removíveis existem);
 *   • Transfere votos (song_votes) dos removidos para o sobrevivente
 *     (on_conflict ignore-duplicates — PK song_id+user_id);
 *   • DELETE por lotes de 100 ids via `id=in.(...)`;
 *   • Idempotente: reexecutar não faz nada (ids já deletados são pulados).
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
const ATUALIZAR = flag('--atualizar');
const MODO_APLICAR = flag('--aplicar');
const RETOMAR = flag('--retomar');
const LIMITE_GRUPOS = Math.max(0, parseInt(valorArg('--limite') || '0', 10));
const ARQ_EXCLUIR = valorArg('--excluir');
const ARQ_CHECKPOINT = path.join(__dirname, '.dedupe-apply-state.json');

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

if ((MODO_APLICAR || ATUALIZAR) && !SERVICE) {
  console.error('Essa operação exige SUPABASE_SERVICE_ROLE_KEY no .env.local/ambiente.');
  process.exit(1);
}
if (MODO_APLICAR && SERVICE === ANON) {
  console.error('SERVICE_ROLE é igual à anon key — chave errada. Abortando por segurança.');
  process.exit(1);
}

const REST = '/rest/v1';

/* --------------------- helpers de requisição ----------------------- */
async function get(caminho, chave) {
  const resp = await fetch(`${SUPA}${REST}${caminho}`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  });
  if (!resp.ok) {
    throw new Error(`GET ${caminho.split('?')[0]} → HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  return resp.json();
}

async function rpcRefresh() {
  const resp = await fetch(`${SUPA}${REST}/rpc/songs_dedupe_refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!resp.ok) {
    throw new Error(
      `songs_dedupe_refresh → HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}\n` +
      '(A agregação completa leva ~30-60 s; rode de novo se o gateway estorvar o timeout.)'
    );
  }
  const texto = await resp.text();
  console.log(`Plano atualizado: ${texto.replace(/"/g, '')} grupos materializados em songs_dedupe_plan.`);
}

/* ------------------ exclusões e checkpoint ------------------------- */
function carregarExclusoes() {
  if (!ARQ_EXCLUIR) return { keepIds: new Set(), chaves: new Set() };
  const bruto = JSON.parse(fs.readFileSync(ARQ_EXCLUIR, 'utf8'));
  const lista = Array.isArray(bruto) ? bruto : bruto.excluir || [];
  const keepIds = new Set();
  const chaves = new Set();
  for (const e of lista) {
    if (typeof e === 'string') {
      keepIds.add(e.trim().toLowerCase()); // uuid do sobrevivente a preservar (grupo inteiro)
    } else if (e && typeof e === 'object') {
      if (e.keep_id) keepIds.add(String(e.keep_id).trim().toLowerCase());
      else if (e.norm_title) chaves.add(`${e.norm_title}/${e.norm_artist}`.trim().toLowerCase());
    }
  }
  console.log(`Exclusões carregadas: ${keepIds.size} keep_id(s), ${chaves.size} chave(s) título/artista.`);
  return { keepIds, chaves };
}

function salvarCheckpoint(indiceProximo, stats, planoGeradoEm) {
  fs.writeFileSync(ARQ_CHECKPOINT, JSON.stringify({
    proximo_indice: indiceProximo,
    plano_gerado_em: planoGeradoEm || null,
    stats,
    salvo_em: new Date().toISOString(),
  }, null, 2));
}

function carregarCheckpoint() {
  if (!fs.existsSync(ARQ_CHECKPOINT)) return null;
  try { return JSON.parse(fs.readFileSync(ARQ_CHECKPOINT, 'utf8')); } catch { return null; }
}

/* --------------------------- relatório ----------------------------- */
async function relatar() {
  const inicio = Date.now();
  const grupos = [];
  let offset = 0;
  const PAGINA = 1000;

  while (true) {
    const pag = await get(`/songs_dedupe_plan?select=*&order=norm_title.asc,norm_artist.asc&limit=${PAGINA}&offset=${offset}`, ANON);
    if (!pag.length) break;
    grupos.push(...pag);
    offset += pag.length;
    if (pag.length < PAGINA) break;
    process.stdout.write(`lendo plano: ${grupos.length} grupos...   \r`);
  }
  console.log('');

  const fatia = LIMITE_GRUPOS ? grupos.slice(0, LIMITE_GRUPOS) : grupos;

  // estatísticas
  const histograma = {};
  let linhasRemover = 0;
  for (const g of fatia) {
    histograma[g.n] = (histograma[g.n] || 0) + 1;
    linhasRemover += g.remover_ids.length;
  }

  const maiores = [...fatia]
    .sort((a, b) => b.n - a.n || a.norm_title.localeCompare(b.norm_title))
    .slice(0, 20);

  // catálogo atual (count exato via content-range; com retries — sob carga
  // o gateway pode responder sem o header)
  let totalAtual = null;
  for (let tent = 0; tent < 3 && totalAtual === null; tent++) {
    try {
      const respCount = await fetch(`${SUPA}${REST}/songs?select=id&limit=1`, {
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Prefer: 'count=exact', Range: '0-0' },
      });
      const faixa = respCount.headers.get('content-range') || '';
      const n = parseInt(faixa.split('/')[1] || '', 10);
      if (Number.isFinite(n) && n > 0) totalAtual = n;
      else await new Promise((r) => setTimeout(r, 1500));
    } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }

  const relatorio = {
    gerado_em: new Date().toISOString(),
    modo: MODO_APLICAR ? 'aplicar' : 'dry-run',
    plano_gerado_em: fatia[0]?.gerado_em || null,
    resumo: {
      catalogo_atual: totalAtual,
      grupos_duplicados: fatia.length,
      linhas_a_remover: linhasRemover,
      catalogo_estimado_apos: totalAtual != null ? totalAtual - linhasRemover : null,
    },
    histograma_tamanhos_de_grupo: Object.fromEntries(
      Object.entries(histograma).sort((a, b) => Number(a[0]) - Number(b[0]))
    ),
    maiores_grupos: maiores.map((g) => ({
      norm_title: g.norm_title,
      norm_artist: g.norm_artist,
      n: g.n,
      keep: `${g.keep_title} — ${g.keep_artist} (${g.keep_id})`,
      remover: g.remover_ids.length,
    })),
    ...(LIMITE_GRUPOS ? { grupos_detalhado: fatia } : {}),
  };

  console.log(`\n---------- RELATÓRIO DE DUPLICATAS ----------`);
  console.log(`Catálogo atual:         ${totalAtual != null ? totalAtual.toLocaleString('pt-BR') + ' linhas' : 'indisponível (transitório — não bloqueia)'}`);
  console.log(`Grupos duplicados:      ${relatorio.resumo.grupos_duplicados.toLocaleString('pt-BR')}`);
  console.log(`Linhas a remover:       ${linhasRemover.toLocaleString('pt-BR')}`);
  if (totalAtual != null) {
    console.log(`Catálogo após dedupe:   ${relatorio.resumo.catalogo_estimado_apos.toLocaleString('pt-BR')} músicas distintas`);
  }
  console.log(`\nMaiores grupos (top 10):`);
  for (const g of maiores.slice(0, 10)) {
    console.log(`  • ${g.n}×  "${g.keep_title}" — ${g.keep_artist}`);
  }

  const sufixo = MODO_APLICAR ? 'aplicado' : 'relatorio';
  const arquivo = path.join(
    __dirname, '..',
    `relatorio-dedupe-${sufixo}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`
  );
  fs.writeFileSync(arquivo, JSON.stringify(relatorio, null, 2));
  console.log(`\nRelatório completo: ${arquivo}`);
  console.log(`${((Date.now() - inicio) / 1000).toFixed(1)}s`);

  return { relatorio, fatia, arquivo };
}

/* ---------------------------- aplicar ------------------------------ */
async function aplicar(fatia, arquivo) {
  if (!fatia.length) {
    console.log('Nada a aplicar: plano vazio.');
    return;
  }
  const { keepIds: exclKeep, chaves: exclChaves } = carregarExclusoes();

  let inicioIdx = 0;
  const stats = { gruposOk: 0, removidos: 0, votosTransferidos: 0, gruposPulados: 0, gruposExcluidos: 0, erros: [] };
  if (RETOMAR) {
    const ck = carregarCheckpoint();
    if (ck) {
      const mesmoPlano = !fatia[0]?.gerado_em || !ck.plano_gerado_em || fatia[0].gerado_em === ck.plano_gerado_em;
      if (mesmoPlano && ck.proximo_indice < fatia.length) {
        inicioIdx = ck.proximo_indice;
        Object.assign(stats, ck.stats || {});
        console.log(`Retomando do grupo ${inicioIdx + 1} (checkpoint de ${ck.salvo_em}) — ${stats.removidos} linhas já removidas.`);
      } else {
        console.log('Checkpoint obsoleto (plano re-gerado ou concluído) — começando do zero.');
      }
    } else {
      console.log('--retomar sem checkpoint salvo — começando do zero.');
    }
  }

  console.log(`\nAplicando deduplicação em ${fatia.length} grupos${inicioIdx ? ` (do índice ${inicioIdx})` : ''}...`);

  const TAM_LOTE = 100;

  for (let gi = inicioIdx; gi < fatia.length; gi++) {
    const g = fatia[gi];
    const idsRemover = (g.remover_ids || []).filter(Boolean);
    if (!idsRemover.length) { stats.gruposOk++; continue; }

    // 0) Grupos excluídos na revisão humana: pular (nenhum toque)
    if (exclKeep.has(String(g.keep_id).toLowerCase()) ||
        exclChaves.has(`${g.norm_title}/${g.norm_artist}`.toLowerCase())) {
      stats.gruposExcluidos++;
      continue;
    }

    // 1) Revalidação: keep existe e removíveis ainda existem?
    const todosIds = [g.keep_id, ...idsRemover];
    const cond = encodeURIComponent(`(id.in.(${todosIds.map((i) => `"${i}"`).join(',')}))`);
    const existentes = await get(`/songs?select=id,title,artist&or=${cond}`, SERVICE);
    const mapa = new Map(existentes.map((r) => [r.id, r]));

    if (!mapa.has(g.keep_id)) {
      stats.gruposPulados++;
      stats.erros.push({ grupo: `${g.norm_title}/${g.norm_artist}`, motivo: 'keep_id ausente', keep_id: g.keep_id });
      continue;
    }
    const aindaPresentes = idsRemover.filter((id) => mapa.has(id));
    if (!aindaPresentes.length) { stats.gruposOk++; continue; } // já deduplicado

    // 2) Transferir votos dos removidos para o keep
    const condVotos = encodeURIComponent(aindaPresentes.map((i) => `"${i}"`).join(','));
    const votos = await get(`/song_votes?select=song_id,user_id&song_id=in.(${condVotos})`, SERVICE);
    if (votos.length) {
      const respUp = await fetch(`${SUPA}${REST}/song_votes?on_conflict=song_id,user_id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(votos.map((v) => ({ song_id: g.keep_id, user_id: v.user_id }))),
      });
      if (!respUp.ok) {
        stats.erros.push({ grupo: g.norm_title, motivo: `transferência de votos falhou: HTTP ${respUp.status}` });
      } else {
        stats.votosTransferidos += votos.length;
      }
    }

    // 3) DELETE em lotes de 100 (via PK)
    for (let i = 0; i < aindaPresentes.length; i += TAM_LOTE) {
      const lote = aindaPresentes.slice(i, i + TAM_LOTE);
      const respDel = await fetch(
        `${SUPA}${REST}/songs?id=in.(${lote.map((id) => `"${id}"`).join(',')})`,
        { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'return=minimal' } }
      );
      if (!respDel.ok) {
        stats.erros.push({ grupo: g.norm_title, motivo: `DELETE HTTP ${respDel.status}: ${(await respDel.text()).slice(0, 120)}` });
        break;
      }
      stats.removidos += lote.length;
    }
    stats.gruposOk++;

    if ((gi + 1) % 100 === 0) {
      process.stdout.write(`${gi + 1}/${fatia.length} grupos · ${stats.removidos} removidos...   \r`);
    }
    // checkpoint periódico: retomada sem refazer trabalho
    if ((gi + 1) % 50 === 0) {
      salvarCheckpoint(gi + 1, { ...stats, erros: stats.erros.slice(-50) }, fatia[0]?.gerado_em);
    }
  }

  try { fs.unlinkSync(ARQ_CHECKPOINT); } catch { /* concluído sem checkpoint */ }

  console.log(`\n\n---------- RESULTADO ----------`);
  console.log(`Grupos processados:   ${stats.gruposOk}`);
  console.log(`Grupos excluídos:     ${stats.gruposExcluidos}${stats.gruposExcluidos ? ' (via --excluir — rever depois)' : ''}`);
  console.log(`Linhas removidas:     ${stats.removidos}`);
  console.log(`Votos transferidos:   ${stats.votosTransferidos}`);
  console.log(`Grupos pulados:       ${stats.gruposPulados}${stats.gruposPulados ? ' (keep_id ausente — revisar)' : ''}`);
  if (stats.erros.length) {
    console.log(`Erros (${stats.erros.length}):`);
    for (const e of stats.erros.slice(0, 10)) console.log(`  • ${e.grupo}: ${e.motivo}`);
  }

  // anexa o resultado ao relatório
  try {
    const atual = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    atual.aplicado = stats;
    fs.writeFileSync(arquivo, JSON.stringify(atual, null, 2));
  } catch { /* relatório opcional */ }

  return stats;
}

/* ----------------------------- main -------------------------------- */
(async () => {
  console.log('Ukemaster — higienização de duplicatas em songs');
  console.log(`Modo: ${ATUALIZAR ? 'atualizar plano · ' : ''}${MODO_APLICAR ? 'APLICAR' : 'relatório (nada é alterado)'}${LIMITE_GRUPOS ? ` · LIMITE: ${LIMITE_GRUPOS} grupos` : ''}${RETOMAR ? ' · retomar' : ''}${ARQ_EXCLUIR ? ` · exclusões: ${path.basename(ARQ_EXCLUIR)}` : ''}\n`);

  if (ATUALIZAR) await rpcRefresh();

  const { relatorio, fatia, arquivo } = await relatar();

  if (MODO_APLICAR) await aplicar(fatia, arquivo);

  process.exit(0);
})().catch((e) => {
  console.error(`\nERRO: ${e.message}`);
  process.exit(1);
});
