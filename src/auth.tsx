/**
 * Camada de autenticação do UkeMaster Pro — login/cadastro DIRETO no Supabase.
 *
 * Substitui o Clerk por e-mail + senha nativos do Supabase Auth (REST), sem
 * dependência externa. A sessão fica no localStorage com refresh automático.
 *
 * Quando o Supabase não está configurado, o app degrada para "modo visitante"
 * (guest) e segue 100% funcional — a mesma garantia do comportamento anterior.
 *
 * Consumo nos componentes:
 *   const { available, isLoaded, isSignedIn, user, openSignIn, openSignUp, signOut } = useAuth();
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { AuthModal, AuthModalMode, SignUpPrefill } from './components/AuthModal';
import {
  restoreSession,
  signInWithPassword,
  signUp,
  signOutSession,
  deleteAccount,
  toAuthUser,
  handleOAuthCallback,
  cleanupOAuthUrl,
  SupabaseSession,
  SESSION_KEY,
  OAUTH_POPUP_MESSAGE,
} from './lib/supabaseAuth';

export interface AuthUser {
  id: string; // id do usuário no Supabase (chaveia repertório, votos etc.)
  name: string;
  email: string;
}

interface AuthContextValue {
  /** true quando o Supabase está configurado (auth disponível). */
  available: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  /** Abre o modal de login. */
  openSignIn: () => void;
  /** Abre o modal de cadastro (aceita dados do lead capturado antes). */
  openSignUp: (prefill?: SignUpPrefill) => void;
  signOut: () => Promise<void>;
  /** Exclui permanentemente a conta e todos os dados do usuário (LGPD Art. 18, VI). */
  deleteAccount: () => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue>({
  available: false,
  isLoaded: false,
  isSignedIn: false,
  user: null,
  openSignIn: () => {},
  openSignUp: () => {},
  signOut: async () => {},
  deleteAccount: async () => ({ ok: false }),
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [modalMode, setModalMode] = useState<AuthModalMode | null>(null);
  const [signUpPrefill, setSignUpPrefill] = useState<SignUpPrefill | undefined>(undefined);

  // Bootstrap: 1) se veio do OAuth (Google) com ?code=, troca pela sessão;
  // 2) se veio com ?error= (usuário cancelou/recusou no Google), apenas
  //    limpa a URL e segue; 3) senão, restaura a sessão do localStorage
  //    (com refresh automático).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error');
      const oauthCode = params.get('code');

      if (oauthError) {
        // Login Google recusado/cancelado — não loga sessão antiga por engano.
        console.warn('[auth] OAuth recusado:', oauthError);
        cleanupOAuthUrl();
        // Popup: fechou/recusou no Google → fecha a popup (evita aba órfã).
        if (window.opener && window.opener !== window) {
          window.setTimeout(() => window.close(), 400);
        }
        setIsLoaded(true);
        return;
      }

      if (oauthCode) {
        try {
          const oauthSession = await handleOAuthCallback();
          cleanupOAuthUrl(); // remove o ?code=... da URL
          if (cancelled) return;
          if (oauthSession) {
            setSession(oauthSession);
            setIsLoaded(true);
            // Fluxo POPUP: avisa a janela que abriu (já salva a sessão no
            // localStorage — ela também recebe o evento `storage`) e fecha a
            // popup sozinha. No fluxo redirect (mesma aba), não há opener.
            if (window.opener && window.opener !== window) {
              try {
                window.opener.postMessage(
                  { type: OAUTH_POPUP_MESSAGE, session: oauthSession },
                  window.location.origin
                );
              } catch {
                // origem não permitida — o storage event cobre o fallback
              }
              window.setTimeout(() => window.close(), 500);
            }
            return;
          }
          // Troca falhou (verifier ausente/erro) — não cair numa sessão
          // antiga como se o Google tivesse funcionado.
          await signOutSession(null);
        } catch (e) {
          console.error('[auth] Falha no callback OAuth:', e);
          cleanupOAuthUrl();
          await signOutSession(null);
        }
      }

      restoreSession().then((s) => {
        if (cancelled) return;
        setSession(s);
        setIsLoaded(true);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Popup do Google: a sessão pode chegar por dois canais — o postMessage
  // direto da popup OU o evento `storage` (a popup salva no localStorage e
  // outras abas da MESMA origem recebem o evento). Escuta os dois para não
  // depender de um só. Fecha o modal de login ao autenticar.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type !== OAUTH_POPUP_MESSAGE || !e.data?.session) return;
      setSession(e.data.session as SupabaseSession);
      setModalMode(null);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY) return;
      try {
        const raw = e.newValue;
        const s = raw ? (JSON.parse(raw) as SupabaseSession) : null;
        if (s?.access_token) {
          setSession(s);
          setModalMode(null);
        }
      } catch {
        // valor corrompido — ignora
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const user = session?.user ? toAuthUser(session.user) : null;

  const openSignIn = useCallback(() => {
    setSignUpPrefill(undefined);
    setModalMode('signin');
  }, []);

  const openSignUp = useCallback((prefill?: SignUpPrefill) => {
    setSignUpPrefill(prefill);
    setModalMode('signup');
  }, []);

  const closeModal = useCallback(() => setModalMode(null), []);

  const handleAuthenticated = useCallback((s: SupabaseSession) => {
    setSession(s);
    setModalMode(null);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOutSession(session);
    setSession(null);
  }, [session]);

  const handleDeleteAccount = useCallback(async () => {
    if (!session) return { ok: false, error: 'Sessão não disponível.' };
    const result = await deleteAccount(session);
    if (result.ok) {
      setSession(null);
    }
    return result;
  }, [session]);

  const value: AuthContextValue = {
    available: true,
    isLoaded,
    isSignedIn: !!user,
    user,
    openSignIn,
    openSignUp,
    signOut: handleSignOut,
    deleteAccount: handleDeleteAccount,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal
        isOpen={modalMode !== null}
        mode={modalMode || 'signin'}
        prefill={signUpPrefill}
        onClose={closeModal}
        onAuthenticated={handleAuthenticated}
      />
    </AuthContext.Provider>
  );
};

// Re-exporta as funções de auth do Supabase para quem precisar chamar direto.
export { signInWithPassword, signUp };
