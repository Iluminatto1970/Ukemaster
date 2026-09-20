/**
 * Busca server-side no acervo via RPC `search_songs` (Supabase/PostgREST).
 *
 * Por quê: o filtro local do SongList só enxerga as ~500 músicas carregadas
 * em memória, mas o banco tem ~394 mil (com acentos inconsistentes do
 * scraping). A RPC roda no banco com índice GIN trigram, é acento-insensível,
 * multi-palavra (AND) e traz ranking (título exato > prefixo > contém).
 * Diagnóstico completo: docs/diagnostico-busca (repo Marcas/Ukemaster Pro).
 *
 * Contrato:
 *  - `searchSongsServer(q, lim, off)` devolve `{ songs, total }`;
 *  - `songs === null` → RPC indisponível/erro: o chamador faz fallback para
 *    o filtro local (comportamento atual) — degradação silenciosa;
 *  - `total === null` → ainda há mais páginas além das retornadas.
 *
 * Auth: usa a anon key e, se houver sessão, o access_token do usuário
 * (mesmo padrão do restante do app — o RLS decide o que é visível).
 */
import { getSupabase, getSessionAccessToken } from './supabase';
import { logger } from './logger';
import { Song } from '../types';

export interface ServerSearchOutcome {
  /** Resultados já mapeados para Song; null = usar filtro local. */
  songs: Song[] | null;
  /** Total de matches no banco; null = existem mais páginas. */
  total: number | null;
}

/** Linha retornada pela RPC search_songs (ver supabase/migrations no repo de marca). */
interface RpcRow {
  id: string;
  title: string;
  artist: string;
  key?: string | null;
  difficulty?: string | null;
  category?: string | null;
  lang?: string | null;
  tags?: string[] | null;
  votes?: number | null;
  views?: number | null;
  rank?: number;
}

/** Depois de detectar RPC ausente (404/PGRST202), não insiste a cada tecla. */
let rpcUnavailable = false;

/**
 * Termo mínimo para o autocomplete.
 *
 * Por quê: padrões de 1–2 caracteres não geram trigramas — o planner do
 * Postgres abandona o índice GIN e faz Seq Scan (~31 s medidos), cortado
 * pelo gateway com erro 57014. O autocomplete dispara a cada tecla, então
 * nem pode chegar perto disso; abaixo de 3 letras não há sugestões.
 */
const MIN_SUGGEST_LEN = 3;

/** Testes podem resetar o estado de disponibilidade. */
export function resetSearchServerState(): void {
  rpcUnavailable = false;
}

/** Mapeia a linha da RPC para o tipo Song do app. */
function mapRpcRow(r: RpcRow): Song {
  return {
    id: r.id,
    title: r.title ?? '',
    artist: r.artist ?? '',
    key: r.key ?? '',
    // A letra (content) NÃO vem na busca — o viewer busca sob demanda ao
    // abrir a cifra (mesmo fluxo das músicas carregadas em lote).
    content: '',
    difficulty: (r.difficulty ?? undefined) as Song['difficulty'],
    category: r.category ?? undefined,
    lang: r.lang ?? undefined,
    tags: Array.isArray(r.tags) ? r.tags : [],
    votes: r.votes ?? 0,
    views: r.views ?? 0,
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Consulta a RPC `search_songs`.
 * @param q   Termo bruto digitado (a RPC normaliza acentos/maiúsculas).
 * @param lim Máximo de resultados (a RPC clamp em 1..50).
 * @param off Offset para paginação.
 */
export async function searchSongsServer(
  q: string,
  lim = 30,
  off = 0
): Promise<ServerSearchOutcome> {
  const cfg = getSupabase();
  if (!cfg || rpcUnavailable || !q.trim()) {
    return { songs: null, total: null };
  }

  try {
    const token = getSessionAccessToken();
    const resp = await fetch(`${cfg.url}/rest/v1/rpc/search_songs`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ q, lim, off }),
    });

    // Função não publicada neste ambiente → modo local permanente na sessão.
    if (resp.status === 404 || resp.status === 501) {
      rpcUnavailable = true;
      logger.warn('[searchServer] RPC search_songs indisponível — usando filtro local.');
      return { songs: null, total: null };
    }
    if (!resp.ok) {
      logger.warn(`[searchServer] RPC falhou (${resp.status}) — usando filtro local.`);
      return { songs: null, total: null };
    }

    const rows = (await resp.json()) as RpcRow[];
    if (!Array.isArray(rows)) {
      rpcUnavailable = true;
      return { songs: null, total: null };
    }

    const songs = rows.map(mapRpcRow);
    // Menos resultados que o limite → vimos tudo; total é exato.
    const total = rows.length < lim ? off + rows.length : null;
    return { songs, total };
  } catch (err) {
    logger.warn('[searchServer] Erro de rede na busca — usando filtro local.', err);
    return { songs: null, total: null };
  }
}

/** Sugestão de autocomplete: apenas o par título/artista já basta. */
export interface SearchSuggestion {
  id: string;
  title: string;
  artist: string;
}

/**
 * Autocomplete: mesma RPC `search_songs`, porém com limite pequeno e
 * payload mínimo (id/title/artist). Usada enquanto o usuário digita.
 *
 * Devolve `[]` para termos abaixo do mínimo (ver MIN_SUGGEST_LEN) e `null`
 * quando a RPC está indisponível (degradação silenciosa — sem dropdown).
 */
export async function searchSuggestionsServer(
  q: string,
  lim = 12
): Promise<SearchSuggestion[] | null> {
  const termo = q.trim();
  const cfg = getSupabase();
  if (!cfg || rpcUnavailable || termo.length < MIN_SUGGEST_LEN) {
    return rpcUnavailable ? null : [];
  }

  try {
    const token = getSessionAccessToken();
    const resp = await fetch(`${cfg.url}/rest/v1/rpc/search_songs`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ q: termo, lim, off: 0 }),
    });

    if (resp.status === 404 || resp.status === 501) {
      rpcUnavailable = true;
      logger.warn('[searchServer] RPC search_songs indisponível — autocomplete desativado.');
      return null;
    }
    if (!resp.ok) {
      logger.warn(`[searchServer] RPC de sugestões falhou (${resp.status}).`);
      return null;
    }

    const rows = (await resp.json()) as RpcRow[];
    if (!Array.isArray(rows)) {
      rpcUnavailable = true;
      return null;
    }

    // Dedup por par título/artista normalizado: a RPC retorna linhas (a mesma
    // música pode aparecer em pot-pourris/imports repetidos) e o dropdown
    // deve mostrar músicas, não linhas do banco.
    const vistos = new Set<string>();
    const sugestoes: SearchSuggestion[] = [];
    for (const r of rows) {
      const title = r.title ?? '';
      const artist = r.artist ?? '';
      const chave = `${normForDedupe(title)}|${normForDedupe(artist)}`;
      if (!title || vistos.has(chave)) continue;
      vistos.add(chave);
      sugestoes.push({ id: r.id, title, artist });
      if (sugestoes.length >= lim) break;
    }
    return sugestoes;
  } catch (err) {
    logger.warn('[searchServer] Erro de rede nas sugestões.', err);
    return null;
  }
}

/** Aproximação client-side do ukm_norm do banco (caixa/acento/espaços). */
function normForDedupe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
