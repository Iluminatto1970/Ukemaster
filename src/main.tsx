/**
 * Entrada do app (bootstrap): monta o React no DOM, configura Clerk (auth), analytics e o ThemeProvider/estilos globais.
 */
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from './auth.tsx';
import {initAnalytics} from './lib/analytics';
import App from './App.tsx';
import './index.css';

// Analytics (GA4/Plausible) — injeta o script antes do render se houver chave
initAnalytics();

// Chave pública do Clerk (vem do .env.local / variável de ambiente do Vercel).
// Aceita os dois padrões de nome: VITE_CLERK_PUBLISHABLE_KEY (Vite) e
// NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (padrão Next.js/Clerk).
// Sem chave, o AuthProvider renderiza o app em "modo visitante" (sem quebrar).
const PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
