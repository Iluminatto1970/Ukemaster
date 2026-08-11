/**
 * Obtém a service role key do Supabase via Management API (envs server-side
 * SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN) com cache em memória.
 * Usado pelos endpoints administrativos (api/admin/*) — nunca vai ao bundle.
 */
let cache: { key: string; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getServiceRoleKey(): Promise<string | null> {
  const ref = process.env.SUPABASE_PROJECT_REF || '';
  const token = process.env.SUPABASE_ACCESS_TOKEN || '';
  if (!ref || !token) return null;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.key;
  }
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const keys = (await r.json()) as { name: string; api_key: string }[];
    const sr = keys.find((k) => k.name === 'service_role');
    if (!sr?.api_key) return null;
    cache = { key: sr.api_key, at: Date.now() };
    return sr.api_key;
  } catch {
    return null;
  }
}
