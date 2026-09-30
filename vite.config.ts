import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    // Expõe ao cliente tanto VITE_* quanto NEXT_PUBLIC_* (compatibilidade
    // com o padrão de nomes do Next.js usado no painel da Supabase).
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      // Quando o HMR está ativo, desativa só o overlay de erro do navegador
      // (erros continuam visíveis no terminal do dev server).
      hmr:
        process.env.DISABLE_HMR === 'true'
          ? false
          : {overlay: false},
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
