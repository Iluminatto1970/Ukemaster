import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchUser } from '../../src/lib/supabaseAuth.js';
import { getSupabaseServer } from '../../src/lib/supabaseServer.js';

export const maxDuration = 30;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function restGet(path: string, token: string): Promise<any[] | null> {
  const sb = getSupabaseServer();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/rest/v1/${path}`, {
      headers: {
        apikey: sb.key,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as any[];
  } catch {
    return null;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method Not Allowed' });

  const authHeader = req.headers['authorization'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (!token) return sendJson(res, 401, { error: 'Unauthorized' });

  const user = await fetchUser(token);
  if (!user) return sendJson(res, 401, { error: 'Invalid token' });

  const repertoires = (await restGet(
    `repertoires?user_id=eq.${encodeURIComponent(user.id)}`,
    token
  )) || [];

  let leads: any[] = [];
  if (user.email) {
    leads = (await restGet(
      `leads?email=eq.${encodeURIComponent(user.email)}`,
      token
    )) || [];
  }

  const playlists = (await restGet('playlists?select=*', token)) || [];

  sendJson(res, 200, { user, repertoires, leads, playlists });
}
