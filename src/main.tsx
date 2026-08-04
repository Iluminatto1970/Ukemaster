import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from './auth.tsx';
import App from './App.tsx';
import './index.css';

// Chave pública do Clerk (vem do .env.local / variável de ambiente do Vercel).
// Sem chave, o AuthProvider renderiza o app em "modo visitante" (sem quebrar).
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </AuthProvider>
  </StrictMode>,
);
