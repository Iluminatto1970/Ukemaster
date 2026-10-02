// src/services/search.js
// Busca server-side de músicas no Supabase — referência para o app UkeMaster Pro.
// Diagnóstico: docs/diagnostico-busca-2026-09-19.md
//
// Produção filtrava ~500 músicas em memória de um catálogo de 394 mil.
// Caminho primário agora é a RPC `search_songs` (índice GIN trigram + ranking,
// acento-insensível, multi-palavra) criada nas migrations `ukm_search_functions`
// e `ukm_search_songs_rpc`. Se a RPC não estiver disponível, cai para a busca
// `ilike` via PostgREST (camada antiga, mantida como fallback).
//
// Uso:
//   import { searchSongs, createDebouncedSearcher } from './services/search';
//   const buscar = createDebouncedSearcher(r => renderResults(r), 300);
//   buscar('legiao urbana');

const SUPABASE_URL = 'https://asvjdjawaenxrlwdyziy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_w7Wr47WNSZmbDShcnJy8Uw_9TNM0Rdj'; // chave pública (anon)

const COLUNAS = 'id,title,artist,key,difficulty,category,lang,tags,votes,views';

/** Normaliza removendo acentos (para gerar a variante sem acento do termo). */
export function semAcento(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Escapa caracteres especiais do padrão LIKE do PostgREST. */
function escaparLike(str) {
  return String(str).replace(/([%_\\(),])/g, '\\$1').trim();
}

/**
 * Busca via RPC `search_songs` (recomendado — índice trigram + ranking).
 * Retorna { items, total: null } ou null se a RPC não existir.
 */
async function buscarViaRpc(termo, limite, ordemIgnorada) {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_songs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: termo, lim: limite, off: 0 }),
    });
    if (!resp.ok) return null; // 404/PGRST202 → RPC ausente; sinaliza fallback
    const items = await resp.json();
    return { items: Array.isArray(items) ? items : [], total: null };
  } catch {
    return null;
  }
}

/**
 * Conta resultados via Content-Range (count=exact) — usado no fallback ilike.
 */
async function contar(filtro) {
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/songs?select=id&${filtro}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Prefer: 'count=exact', Range: '0-0' } }
    );
    const cr = resp.headers.get('content-range') || '*/0';
    const m = cr.match(/\/(\d+)$/);
    return m ? parseInt(m[1], 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Busca fallback via PostgREST (ilike com 2 variantes de acento), caso a RPC
 * ainda não esteja publicada no ambiente.
 */
async function buscarViaIlike(termo, limite, ordem, comCont) {
  const limpo = escaparLike(termo);
  const variante = escaparLike(semAcento(termo));
  const filtro =
    `or=(title.ilike.*${limpo}*,artist.ilike.*${limpo}*,category.ilike.*${limpo}*,` +
    `title.ilike.*${variante}*,artist.ilike.*${variante}*,category.ilike.*${variante}*)` +
    `&order=${encodeURIComponent(ordem)}` +
    `&limit=${limite}`;
  try {
    const resp = await fetch(
      `${SUPABASE_URL}/rest/v1/songs?select=${encodeURIComponent(COLUNAS)}&${filtro}`,
      { headers: { apikey: SUPABASE_KEY } }
    );
    if (!resp.ok) return { items: [], total: comCont ? 0 : null };
    const items = await resp.json();
    const total = comCont
      ? await contar(filtro.replace(/&order=[^&]+/, '').replace(/&limit=\d+/, ''))
      : null;
    return { items, total };
  } catch {
    return { items: [], total: comCont ? 0 : null };
  }
}

/**
 * Busca músicas no servidor.
 * @param {string} termo  Texto digitado pelo usuário.
 * @param {object} opcoes
 * @param {number}  opcoes.limite   Máximo de resultados (padrão 30, máx. 50 na RPC).
 * @param {string}  opcoes.ordem    Ordenação do fallback ilike.
 * @param {boolean} opcoes.comCont  Retorna total exato (apenas fallback ilike).
 * @returns {Promise<{items: Array, total: number|null}>}
 */
export async function searchSongs(
  termo,
  { limite = 30, ordem = 'votes.desc.nullslast,views.desc.nullslast,title.asc', comCont = false } = {}
) {
  const q = String(termo || '').trim();
  if (!q) return { items: [], total: comCont ? 0 : null };

  const viaRpc = await buscarViaRpc(q, limite, ordem);
  if (viaRpc) return viaRpc;
  return buscarViaIlike(q, limite, ordem, comCont);
}

/**
 * Cria um buscador com debounce + deduplicação de termos.
 * @param {Function} fn      Recebe ({ items, total, termo }).
 * @param {number}   espera  Delay do debounce em ms (padrão 300).
 */
export function createDebouncedSearcher(fn, espera = 300) {
  let timer = null;
  let ultimoTermo = null;
  return function buscar(termo) {
    if (termo === ultimoTermo) return; // nada mudou, não refaz
    clearTimeout(timer);
    timer = setTimeout(async () => {
      ultimoTermo = termo;
      const resultado = await searchSongs(termo, { comCont: true });
      if (termo !== ultimoTermo) return; // termo mudou enquanto buscava
      fn({ ...resultado, termo });
    }, espera);
  };
}
