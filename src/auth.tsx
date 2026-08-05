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
  toAuthUser,
  handleOAuthCallback,
  cleanupOAuthUrl,
  SupabaseSession,
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
}

const AuthContext = createContext<AuthContextValue>({
  available: false,
  isLoaded: false,
  isSignedIn: false,
  user: null,
  openSignIn: () => {},
  openSignUp: () => {},
  signOut: async () => {},
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

  const value: AuthContextValue = {
    available: true,
    isLoaded,
    isSignedIn: !!user,
    user,
    openSignIn,
    openSignUp,
    signOut: handleSignOut,
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
