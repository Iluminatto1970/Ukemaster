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
 *   VITE_SUPABASE_ANON_KEY="eyJ..."
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
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export const isSupabaseConfigured = () => getSupabase() !== null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: string; // ex.: "?select=*&id=eq.abc"
  body?: unknown;
  prefer?: string; // ex.: "resolution=merge-duplicates,return=minimal"
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
  const headers: Record<string, string> = {
    apikey: sb.anonKey,
    Authorization: `Bearer ${sb.anonKey}`,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers['Prefer'] = options.prefer;

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/${table}${options.query || ''}`,
      {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      }
    );

    if (!res.ok) {
      console.error(`[supabase] ${method} ${table} → ${res.status}`, await res.text().catch(() => ''));
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
 */
export async function fetchRows<T>(
  table: string,
  query = '',
  columns = '*'
): Promise<T[] | null> {
  const { ok, data } = await supabaseRequest<T[]>(table, {
    query: `?select=${encodeURIComponent(columns)}${query}`,
  });
  return ok ? (data as T[]) : null;
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

/** Apaga linhas por um filtro. Ex.: deleteRows('songs', '?id=in.("a","b")') */
export async function deleteRows(table: string, query: string): Promise<boolean> {
  const { ok } = await supabaseRequest(table, {
    method: 'DELETE',
    query,
  });
  return ok;
}
