/**
 * Camada de autenticação: wrapper do Clerk com fallback de sessão local (guest) para o app funcionar sem login; expõe useAuth(), ClerkProvider e utilitários de usuário atual.
 */
import React, { createContext, useContext } from 'react';
import { ClerkProvider, useClerk, useUser } from '@clerk/clerk-react';

/**
 * Camada de autenticação do UkeMaster Pro.
 *
 * Usa o Clerk quando uma chave pública válida está configurada e degrada
 * graciosamente para "modo visitante" quando:
 *  - a chave VITE_CLERK_PUBLISHABLE_KEY está ausente, ou
 *  - a chave é inválida (formato errado / placeholder).
 *
 * Consumo nos componentes: `const { available, isSignedIn, user, openSignIn, ... } = useAuth();`
 */

export interface AuthUser {
  id: string; // id único do Clerk (chaveia dados individuais: repertório, etc.)
  name: string;
  email: string;
}

interface AuthContextValue {
  /** true quando o Clerk está ativo (chave válida). */
  available: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
  openSignIn: () => void;
  openSignUp: () => void;
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

// Modo visitante (sem Clerk): autenticação desligada, app segue funcionando.
const guestAuth: AuthContextValue = {
  available: false,
  isLoaded: true,
  isSignedIn: false,
  user: null,
  openSignIn: () => {},
  openSignUp: () => {},
  signOut: async () => {},
};

const GuestMode: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={guestAuth}>{children}</AuthContext.Provider>
);

// Ponte: dentro do ClerkProvider, alimenta o AuthContext com os dados reais.
const ClerkBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn, user } = useUser();
  const { openSignIn, openSignUp, signOut } = useClerk();

  const value: AuthContextValue = {
    available: true,
    isLoaded,
    isSignedIn,
    user:
      isSignedIn && user
        ? {
            id: user.id,
            name:
              user.fullName ||
              user.username ||
              user.primaryEmailAddress?.emailAddress?.split('@')[0] ||
              'Músico',
            email: user.primaryEmailAddress?.emailAddress || '',
          }
        : null,
    openSignIn,
    openSignUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Validação leve da chave pública do Clerk: apenas o prefixo estável
 * (`pk_test_` / `pk_live_`). NÃO decodificamos o payload — chaves reais usam
 * base64url e uma checagem manual poderia rejeitar uma chave válida e
 * desativar a autenticação silenciosamente.
 *
 * Chaves que passem aqui mas sejam inválidas em runtime são capturadas pelo
 * ClerkErrorBoundary, que degrada para o modo visitante sem quebrar o app.
 */
function isValidClerkKey(key?: string): boolean {
  return !!key && (key.startsWith('pk_test_') || key.startsWith('pk_live_'));
}

interface ClerkErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

// Rede de segurança: se o ClerkProvider lançar erro em runtime (ex.: chave que
// passa na nossa validação leve mas é rejeitada pelo Clerk), o app cai para o
// modo visitante em vez de quebrar com página em branco.
class ClerkErrorBoundary extends React.Component<ClerkErrorBoundaryProps, { hasError: boolean }> {
  props: ClerkErrorBoundaryProps;
  state: { hasError: boolean };

  constructor(props: ClerkErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export const AuthProvider: React.FC<{ publishableKey?: string; children: React.ReactNode }> = ({
  publishableKey,
  children,
}) => {
  if (!isValidClerkKey(publishableKey)) {
    return <GuestMode>{children}</GuestMode>;
  }

  return (
    <ClerkErrorBoundary fallback={<GuestMode>{children}</GuestMode>}>
      <ClerkProvider publishableKey={publishableKey as string} afterSignOutUrl="/">
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkProvider>
    </ClerkErrorBoundary>
  );
};
