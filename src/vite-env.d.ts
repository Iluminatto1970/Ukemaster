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

/**
 * Tipos mínimos de next/server apenas para o typecheck do middleware.ts.
 * Em runtime, a Vercel resolve o módulo real (o middleware é compilado pelo
 * bundler da plataforma, não pelo Vite). Nenhuma dependência do Next instalada.
 */
declare module 'next/server' {
  export class NextRequest extends Request {
    readonly nextUrl: URL;
    constructor(input: string | URL, init?: RequestInit);
  }
  export class NextResponse extends Response {
    static next(): NextResponse;
    static json(body: unknown, init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
  }
}
