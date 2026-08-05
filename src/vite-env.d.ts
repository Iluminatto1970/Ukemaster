/**
 * Declarações de tipos das variáveis de ambiente VITE_* (import.meta.env) para o TypeScript.
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADSENSE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
