/**
 * Autenticação direta no Supabase (Auth REST) — substitui o Clerk.
 *
 * Usa os endpoints /auth/v1 do Supabase GoTrue com a chave anon/publishable:
 *  - signup:     POST {url}/auth/v1/signup            { email, password, data }
 *  - login:      POST {url}/auth/v1/token?grant_type=password
 *  - refresh:    POST {url}/auth/v1/token?grant_type=refresh_token
 *  - oauth:      GET  {url}/auth/v1/authorize?provider=google  (PKCE)
 *  - pkce:       POST {url}/auth/v1/token?grant_type=pkce      (troca o code)
 *  - logout:     POST {url}/auth/v1/logout            (Bearer access_token)
 *  - user:       GET  {url}/auth/v1/user              (Bearer access_token)
 *
 * Login social (Google) usa o fluxo PKCE nativo do GoTrue: o app gera um
 * code_verifier, redireciona para o authorize, e quando o Google devolve o
 * code no callback (/auth/callback), troca por uma sessão completa.
 *
 * A sessão (access_token + refresh_token + user) fica no localStorage e é
 * restaurada no bootstrap com refresh automático quando expirada. Sem chave
 * Supabase configurada, todas as funções retornam null/false — o app segue
 * em modo visitante (guest), igual ao comportamento anterior do Clerk.
 */
import { getSupabase, isSupabaseConfigured } from './supabase';

export interface SupabaseUser {
  id: string;
  email?: string;
  user_metadata?: { name?: string; whatsapp?: string; [k: string]: unknown };
  app_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch em SEGUNDOS
  user: SupabaseUser | null;
}

export const SESSION_KEY = 'ukemaster_supabase_session_v1';
const OAUTH_VERIFIER_KEY = 'ukemaster_oauth_code_verifier';
/** Mensagem postMessage da popup do Google para a janela que a abriu. */
export const OAUTH_POPUP_MESSAGE = 'ukemaster-oauth-success';

/** Carrega a sessão salva (sem validar). */
export function loadStoredSession(): SupabaseSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SupabaseSession;
    return s && s.access_token ? s : null;
  } catch {
    return null;
  }
}

function storeSession(s: SupabaseSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // cota cheia/privado — segue sem persistir
  }
}

interface GoTrueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user?: SupabaseUser | null;
}

function toSession(r: GoTrueTokenResponse): SupabaseSession | null {
  if (!r.access_token) return null;
  const expiresAt =
    r.expires_at && r.expires_at > 0
      ? r.expires_at
      : Math.floor(Date.now() / 1000) + (r.expires_in || 3600);
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: expiresAt,
    user: r.user || null,
  };
}

async function postForm(
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Promise<GoTrueTokenResponse | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}${path}`, {
      method: 'POST',
      headers: {
        apikey: sb.anonKey,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      // Erro conhecido: expõe a mensagem do Supabase para o usuário.
      const err = new Error(data?.msg || data?.error_description || data?.message || `Erro ${res.status}`);
      (err as any).status = res.status;
      (err as any).code = data?.error_code || data?.code || '';
      throw err;
    }
    return data as GoTrueTokenResponse;
  } catch (e) {
    if (e instanceof Error) throw e;
    return null;
  }
}

export interface SignUpMetadata {
  name?: string;
  whatsapp?: string;
}

/**
 * Cria a conta (e-mail + senha). Se o projeto Supabase tiver "Confirm email"
 * LIGADO, a resposta vem sem access_token — nesse caso o usuário precisa
 * confirmar o e-mail antes do primeiro login (comportamento seguro padrão).
 * Retorna { session } quando a sessão já nasce ativa, ou { needsConfirmation }
 * quando falta confirmar o e-mail.
 */
export async function signUp(
  email: string,
  password: string,
  metadata?: SignUpMetadata
): Promise<{ session: SupabaseSession | null; needsConfirmation: boolean; message?: string }> {
  const r = await postForm('/auth/v1/signup', {
    email,
    password,
    data: metadata || {},
  });
  if (!r) return { session: null, needsConfirmation: false, message: 'Supabase não configurado.' };
  const session = toSession(r);
  if (session) {
    storeSession(session);
    return { session, needsConfirmation: false };
  }
  // Sem token → conta criada mas aguardando confirmação de e-mail.
  return {
    session: null,
    needsConfirmation: true,
    message:
      'Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois faça login.',
  };
}

/** Login com e-mail + senha. Lança erro com mensagem amigável se falhar. */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<SupabaseSession> {
  const r = await postForm('/auth/v1/token?grant_type=password', { email, password });
  if (!r) throw new Error('Supabase não configurado.');
  const session = toSession(r);
  if (!session) throw new Error('Não foi possível iniciar a sessão.');
  storeSession(session);
  return session;
}

// ── OAuth (Google) com PKCE ──────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gera um code_verifier aleatório (43+ bytes, base64url). */
function generateCodeVerifier(): string {
  const arr = new Uint8Array(48);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

/** code_challenge = base64url(SHA-256(code_verifier)) — método S256. */
async function sha256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

export type OAuthOpenMode = 'popup' | 'redirect';

export interface OAuthOpenResult {
  mode: OAuthOpenMode;
  /** Referência da popup aberta (para o modal monitorar se foi fechada). */
  popup?: Window | null;
}

/**
 * Inicia o login social (ex.: 'google').
 *
 * Tenta PRIMEIRO abrir em popup (`window.open`) — funciona dentro de iframes
 * e webviews (onde a navegação de topo é bloqueada) e preserva o estado do
 * app na aba original. Se o navegador bloquear o popup, cai para a navegação
 * de topo clássica (`window.location.href`). Retorna o modo usado + a popup.
 *
 * No fluxo popup, o Google devolve o `?code=` para a própria popup (que carrega
 * /auth/callback); a popup troca o code por uma sessão e avisa a janela que a
 * abriu via postMessage + storage event (AuthProvider escuta os dois).
 *
 * `redirectTo` é a URL do callback (ex.: `${origin}/auth/callback`) e precisa
 * estar na lista de Redirect URLs do projeto no painel do Supabase.
 */
export async function signInWithOAuth(
  provider: string,
  redirectTo: string,
  preferPopup = true
): Promise<OAuthOpenResult> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase não configurado.');

  const verifier = generateCodeVerifier();
  try {
    localStorage.setItem(OAUTH_VERIFIER_KEY, verifier);
  } catch {
    // segue sem persistir — o verifier é exigido no callback, então sem
    // localStorage o fluxo PKCE falha; mas o try mantém o app estável.
  }
  const challenge = await sha256Challenge(verifier);

  const params = new URLSearchParams({
    provider,
    redirect_to: redirectTo,
    code_challenge: challenge,
    // RFC 7636: o método é case-sensitive e DEVE ser "S256" (maiúsculo).
    // O Google rejeita "s256" minúsculo com invalid_request.
    code_challenge_method: 'S256',
    scopes: 'email profile',
  });
  const authUrl = `${sb.url}/auth/v1/authorize?${params.toString()}`;

  if (preferPopup) {
    // Popup SEM `noopener` (precisamos do window.opener para o postMessage).
    const popup = window.open(authUrl, 'ukemaster_oauth', 'width=520,height=640');
    if (popup) {
      popup.focus();
      return { mode: 'popup', popup };
    }
    // Popup bloqueada (bloqueador/iframe restritivo) → navegação de topo.
  }

  window.location.href = authUrl;
  return { mode: 'redirect', popup: null };
}

/**
 * Processa o retorno do OAuth: se a URL atual tem ?code=, troca pelo
 * code_verifier salvo e devolve a sessão (ou null se não for um callback).
 * Chamar no bootstrap ANTES de restoreSession().
 */
export async function handleOAuthCallback(): Promise<SupabaseSession | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  let verifier = '';
  try {
    verifier = localStorage.getItem(OAUTH_VERIFIER_KEY) || '';
    localStorage.removeItem(OAUTH_VERIFIER_KEY);
  } catch {
    // sem localStorage → PKCE falha (sem verifier não há troca segura)
  }
  if (!verifier) return null;

  const r = await postForm('/auth/v1/token?grant_type=pkce', {
    auth_code: code,
    code_verifier: verifier,
  });
  if (!r) return null;
  const session = toSession(r);
  if (session) storeSession(session);
  return session;
}

/** Remove o ?code=... da URL após processar o callback (SPA limpo). */
export function cleanupOAuthUrl(): void {
  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch {
    // ignora
  }
}

/** Renova a sessão com o refresh_token (chamado quando expira). */
export async function refreshSession(session: SupabaseSession): Promise<SupabaseSession | null> {
  if (!session.refresh_token) return null;
  const r = await postForm('/auth/v1/token?grant_type=refresh_token', {
    refresh_token: session.refresh_token,
  });
  if (!r || !r.access_token) return null;
  const next = toSession(r);
  if (next) storeSession(next);
  return next;
}

/** Busca os dados atualizados do usuário com o access_token. */
export async function fetchUser(accessToken: string): Promise<SupabaseUser | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/auth/v1/user`, {
      headers: {
        apikey: sb.anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as SupabaseUser) || null;
  } catch {
    return null;
  }
}

/**
 * Restaura a sessão do localStorage no bootstrap:
 *  - sem sessão → null (visitante)
 *  - sessão válida → retorna como está
 *  - sessão expirada → tenta refresh automático; se falhar, limpa e retorna null
 */
export async function restoreSession(): Promise<SupabaseSession | null> {
  const stored = loadStoredSession();
  if (!stored) return null;
  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at > now + 60) return stored;
  const refreshed = await refreshSession(stored);
  if (refreshed) return refreshed;
  storeSession(null);
  return null;
}

/** Encerra a sessão no servidor e limpa o localStorage. */
export async function signOutSession(session: SupabaseSession | null): Promise<void> {
  const sb = getSupabase();
  if (sb && session?.access_token) {
    try {
      await fetch(`${sb.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: sb.anonKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      // rede falhou — segue limpando a sessão local de qualquer forma
    }
  }
  storeSession(null);
}

/** Converte um usuário do Supabase para o AuthUser do app. */
export function toAuthUser(u: SupabaseUser): {
  id: string;
  name: string;
  email: string;
} | null {
  if (!u.id) return null;
  const email = u.email || '';
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    name: (meta.name as string) || email.split('@')[0] || 'Músico',
    email,
  };
}

// ── Exclusão de conta (LGPD Art. 18, VI) ─────────────────────────────

/**
 * Exclui todos os dados do usuário e encerra a conta.
 *
 * Fluxo:
 *  1. Deleta dados do banco (repertórios, playlists do usuário)
 *  2. Deleta a conta no Supabase Auth
 *  3. Limpa o localStorage
 *
 * Retorna { ok, error? } — nunca lança exceção.
 */
export async function deleteAccount(
  session: SupabaseSession
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb || !session?.access_token) {
    return { ok: false, error: 'Sessão não disponível.' };
  }

  const headers = {
    apikey: sb.anonKey,
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
  const userId = session.user?.id;
  if (!userId) return { ok: false, error: 'Usuário não identificado.' };

  try {
    // 1. Deleta dados associados ao usuário (RLS garante que só deleta os seus)
    await fetch(`${sb.url}/rest/v1/repertoires?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers,
    });

    // 1b. Deleta leads capturados com o e-mail do usuário (LGPD Art. 18, VI).
    //     A coluna `email` é o que conecta o lead à conta criada depois.
    if (session.user?.email) {
      await fetch(
        `${sb.url}/rest/v1/leads?email=eq.${encodeURIComponent(session.user.email)}`,
        { method: 'DELETE', headers }
      );
    }

    // 1c. Deleta objetos no Storage sob o prefixo `{userId}/` (RLS Storage
    //     exige escopo por path; o `user_id` em `repertoires` é o usado no
    //     front, mas o bucket pode organizar por pasta do usuário).
    await deleteStorageForUser(sb.url, headers, userId);

    // 1d. Sinaliza ao GA4 (Measurement Protocol) que o usuário foi removido.
    //     Envia um evento `user_deletion` + limpa cookies do GA4 no cliente.
    //     A remoção definitiva do histórico no GA precisa de job server-side
    //     (Admin API), mas o signal aqui bloqueia futuras coletas para o
    //     client_id atual.
    await signalGa4Deletion(session);

    // 2. Deleta a conta no Supabase Auth
    const res = await fetch(`${sb.url}/auth/v1/user`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return { ok: false, error: `Erro ao excluir conta: ${res.status} ${errText}` };
    }

    // 3. Limpa tudo do localStorage
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(OAUTH_VERIFIER_KEY);
      localStorage.removeItem('ukemaster_songs_v1');
      localStorage.removeItem('ukemaster_playlists_v1');
      localStorage.removeItem('ukemaster_leads_v1');
      localStorage.removeItem('ukemaster_ads_shown');
      localStorage.removeItem('ukemaster_splash_seen');
    } catch {
      // ignora — localStorage pode estar cheio ou indisponível
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro ao excluir conta.' };
  }
}

/**
 * Lista objetos sob o prefixo `{userId}/` em TODOS os buckets do Storage e
 * deleta cada um. Se a conta não usa Storage, o `list` retorna vazio e o
 * passo é um no-op (sem custo). Falhas individuais são silenciosas —
 * o pior caso é alguns objetos órfãos, que o admin pode limpar manualmente.
 */
async function deleteStorageForUser(
  baseUrl: string,
  headers: Record<string, string>,
  userId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    // Lista buckets públicos (mais comuns p/ avatares/capas).
    const bucketsRes = await fetch(`${baseUrl}/storage/v1/bucket`, { headers });
    if (!bucketsRes.ok) return;
    const buckets = (await bucketsRes.json().catch(() => [])) as Array<{ name: string }>;
    for (const b of buckets) {
      const listRes = await fetch(
        `${baseUrl}/storage/v1/object/list/${encodeURIComponent(b.name)}`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
        }
      );
      if (!listRes.ok) continue;
      const items = (await listRes.json().catch(() => [])) as Array<{ name: string }>;
      for (const obj of items) {
        await fetch(
          `${baseUrl}/storage/v1/object/${encodeURIComponent(b.name)}/${encodeURIComponent(`${userId}/${obj.name}`)}`,
          { method: 'DELETE', headers }
        );
      }
    }
  } catch {
    // storage não configurado ou RLS bloqueou — segue sem falhar a exclusão
  }
}

/**
 * Envia um evento de "user deletion" ao GA4 via Measurement Protocol e
 * limpa cookies do GA no cliente. A remoção retroativa do histórico no
 * Google exige o GA Admin API (server-side); este signal é o máximo
 * possível client-side — bloqueia eventos futuros do mesmo client_id.
 */
async function signalGa4Deletion(session: SupabaseSession): Promise<void> {
  // Envia um evento customizado para o GA4 (sem chaves configuradas = no-op
  // via supabaseRequest; mas aqui o GA4 não passa pelo Supabase, é direto).
  try {
    const gaId = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || '';
    if (!gaId) return;

    // Pega o client_id do cookie _ga (formato GA1.2.<client_id>.<timestamp>)
    const match = document.cookie.match(/_ga=GA\d+\.\d+\.(\d+\.\d+)/);
    const clientId = match?.[1] || session.user?.id || '';

    // Measurement Protocol exige uma API secret do GA4. Sem ela, não dá
    // para POST do client (seria expor a secret). Workaround: dispara um
    // evento `user_deletion` pelo gtag local antes do logout — vai pra
    // sessão do GA4 como evento do client atual e fica documentado para
    // o admin filtrar/remover manualmente.
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'user_deletion', {
        user_id: session.user?.id || '',
        method: 'lgpd_art_18_vi',
      });
      window.gtag('config', gaId, { client_id: clientId, send_page_view: false });
    }

    // Limpa cookies do GA4 no navegador (sem eles, futuras visitas geram
    // um novo client_id e o histórico fica órfão do ponto de vista do
    // browser — o admin ainda precisa deletar server-side).
    document.cookie = '_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    document.cookie = '_ga_*=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  } catch {
    // nunca deixa o signal quebrar a exclusão da conta
  }
}
