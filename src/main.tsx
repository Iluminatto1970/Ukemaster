/**
 * Entrada do app (bootstrap): monta o React no DOM, configura a autenticação
 * (Supabase direto), analytics e os estilos globais.
 */
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from './auth.tsx';
import {LanguageProvider} from './lib/i18n';
import {initAnalytics} from './lib/analytics';
import App from './App.tsx';
import './index.css';

// Analytics (GA4/Plausible) — injeta o script antes do render se houver chave
initAnalytics();

// A autenticação é feita DIRETO no Supabase (e-mail + senha) usando as mesmas
// variáveis do banco (VITE_SUPABASE_URL / chave publishable). Sem elas, o app
// roda em "modo visitante" sem quebrar.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
);
