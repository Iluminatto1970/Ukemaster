/**
 * Cliente Supabase do lado do cliente (browser): acesso ao acervo de músicas, votos, playlists e repertórios via PostgREST com fallback localStorage.
 */
/**
 * Cliente Supabase mínimo (REST + anon key) — sem dependência externa.
 *
 * Usa o padrão PostgREST do Supabase:
 *  - ler:    GET  {url}/rest/v1/{table}?select=*&{filtros}
 *  - inserir/atualizar (upsert): POST {url}/rest/v1/{table}
 *    com header `Prefer: resolution=merge-duplicates` (usa a PK).
 *
 * Configuração (2 variáveis no .env.local / Vercel):
 *   VITE_SUPABASE_URL="https://xxxx.supabase.co"
 *   VITE_SUPABASE_ANON_KEY="eyJ..."   (ou sb_publishable_...)
 *
 * Também aceita os nomes no padrão Next.js (NEXT_PUBLIC_*) — o vite.config.ts
 * expõe ambos os prefixos ao cliente, então funciona das duas formas.
 *
 * Se as chaves não estiverem configuradas, todas as funções retornam
 * `null`/`false` e o app continua 100% funcional com localStorage.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** Retorna a config do Supabase ou null se não configurado. */
export function getSupabase(): SupabaseConfig | null {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined);
  const anonKey =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined);
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

// ── Autenticação nas chamadas REST ───────────────────────────────────
// O Supabase identifica o usuário pelo JWT no header `Authorization`:
//  - sem sessão → usa a anon key (papel anon — leitura pública, votos, leads);
//  - com sessão → usa o access_token do usuário logado (papel authenticated),
//    o que habilita o RLS por usuário: DELETE de música só admin, repertórios
//    privados por dono (auth.uid()).
// Lê a sessão direto do localStorage para evitar ciclo de imports com
// supabaseAuth.ts (que importa getSupabase daqui).
const SESSION_KEY = 'ukemaster_supabase_session_v1';

/** Retorna o access_token da sessão salva (ou null se não logado). */
export function getSessionAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { access_token?: string };
    return s?.access_token || null;
  } catch {
    return null;
  }
}

export const isSupabaseConfigured = () => getSupabase() !== null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: string; // ex.: "?select=*&id=eq.abc"
  body?: unknown;
  prefer?: string; // ex.: "resolution=merge-duplicates,return=minimal"
  range?: string; // ex.: "offset=0-999" (paginador do PostgREST)
  silent?: boolean; // suprime o log de erro (introspecção esperada de falhar)
}

/**
 * Executa uma chamada REST. Retorna `{ ok, data, status }` — nunca lança.
 */
export async function supabaseRequest<T = unknown>(
  table: string,
  options: RequestOptions = {}
): Promise<{ ok: boolean; data: T | null; status: number }> {
  const sb = getSupabase();
  if (!sb) {
    return { ok: false, data: null, status: 0 };
  }

  const method = options.method || 'GET';
  // JWT do usuário logado quando existir (habilita RLS por usuário);
  // visitantes seguem com a anon key (papel anon).
  const accessToken = getSessionAccessToken();
  const headers: Record<string, string> = {
    apikey: sb.anonKey,
    Authorization: `Bearer ${accessToken || sb.anonKey}`,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers['Prefer'] = options.prefer;
  // Página solicitada (ex.: "offset=0-999") — sem Range o PostgREST devolve
  // no máximo 1000 linhas.
  if (options.range) headers['Range'] = options.range;

  try {
    let res = await fetch(
      `${sb.url}/rest/v1/${table}${options.query || ''}`,
      {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      }
    );

    // Fallback de sessão expirada: se o JWT do usuário foi revogado/expirou
    // (401), tenta UMA vez com a anon key (papel anon) para o app continuar
    // funcionando — leitura pública e escrita de votos/leads seguem OK até
    // o próximo refresh da sessão no bootstrap.
    if (res.status === 401 && accessToken) {
      headers['Authorization'] = `Bearer ${sb.anonKey}`;
      res = await fetch(
        `${sb.url}/rest/v1/${table}${options.query || ''}`,
        {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        }
      );
    }

    if (!res.ok) {
      if (!options.silent) {
        console.error(`[supabase] ${method} ${table} → ${res.status}`, await res.text().catch(() => ''));
      }
      return { ok: false, data: null, status: res.status };
    }

    // DELETE e algumas respostas vêm vazias
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : null;
    return { ok: true, data, status: res.status };
  } catch (e) {
    console.error('[supabase] Erro de rede:', e);
    return { ok: false, data: null, status: 0 };
  }
}

/**
 * Busca linhas: GET /rest/v1/{table}?select={colunas}{filtros}
 * `columns` padrão "*" (todas). Para só ids: fetchRows('songs', '', 'id').
 * `silent` suprime o log de erro (introspecção que falha de propósito).
 */
export async function fetchRows<T>(
  table: string,
  query = '',
  columns = '*',
  silent = false
): Promise<T[] | null> {
  const { ok, data } = await supabaseRequest<T[]>(table, {
    query: `?select=${encodeURIComponent(columns)}${query}`,
    silent,
  });
  return ok ? (data as T[]) : null;
}

/**
 * Busca TODAS as linhas de uma tabela, paginando com `limit`/`offset` na QUERY
 * (o PostgREST limita a resposta em 1000 linhas por padrão). Usa query params
 * e não header `Range` porque o navegador pode descartar o header em CORS
 * (pré-flight) — o que faria o loop repetir a mesma página indefinidamente.
 * Retorna `[]` se a tabela estiver vazia e `null` se alguma página falhar.
 */
export async function fetchAllRows<T>(
  table: string,
  query = '',
  columns = '*',
  pageSize = 1000,
  silent = false
): Promise<T[] | null> {
  const all: T[] = [];
  let offset = 0;
  // Normaliza o filtro: callers passam '' ou "&filtro=..." (sem o '?')
  const filter = query.startsWith('&') ? query.slice(1) : query.replace(/^\?/, '');
  // Limite de segurança: 50 páginas (50k linhas) — nunca deve ser alcançado.
  for (let page = 0; page < 50; page++) {
    const { ok, data } = await supabaseRequest<T[]>(table, {
      query: `?select=${encodeURIComponent(columns)}&${filter}limit=${pageSize}&offset=${offset}`,
      silent,
    });
    if (!ok) return null;
    if (data && data.length) all.push(...data);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

/** Upsert em lote (POST + resolution=merge-duplicates, usa a PK). */
export async function upsertRows<T>(table: string, rows: T[]): Promise<boolean> {
  if (!rows.length) return true;
  const { ok } = await supabaseRequest(table, {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
  return ok;
}

/**
 * Upsert em lote com PAGINAÇÃO (a API rejeita corpos muito grandes). Divide
 * em chunks de `chunkSize` e envia sequencialmente. Retorna false se algum
 * chunk falhar.
 */
export async function upsertRowsChunked<T>(
  table: string,
  rows: T[],
  chunkSize = 400
): Promise<boolean> {
  if (!rows.length) return true;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const ok = await upsertRows(table, chunk);
    if (!ok) return false;
  }
  return true;
}

/** Apaga linhas por um filtro. Ex.: deleteRows('songs', '?id=in.("a","b")') */
export async function deleteRows(table: string, query: string): Promise<boolean> {
  const { ok } = await supabaseRequest(table, {
    method: 'DELETE',
    query,
  });
  return ok;
}

/**
 * Atualiza campos específicos de linhas existentes por filtro (PATCH).
 * Diferente do upsert (POST + merge-duplicates), o PATCH não exige os
 * campos NOT NULL da tabela — ideal para atualizar só `votes` em `songs`
 * sem reenviar title/artist/content. Ex.: patchRows('songs', '?id=eq.abc',
 * { votes: 3 }). Retorna true se a chamada foi aceita.
 */
export async function patchRows(
  table: string,
  query: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const { ok } = await supabaseRequest(table, {
    method: 'PATCH',
    query,
    body,
    prefer: 'return=minimal',
  });
  return ok;
}
