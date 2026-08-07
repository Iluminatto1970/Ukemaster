/**
 * Stub de tipos de `next/server` para o middleware.ts (Vercel Edge).
 *
 * O Vercel fornece o runtime REAL de `next/server` no build do middleware —
 * este módulo só existe para o `tsc --noEmit` local resolver o import sem
 * instalar o Next.js inteiro (~150MB) só por causa de 2 classes.
 *
 * NOTA: não usar estes tipos em código do app — apenas no middleware.
 */
declare module 'next/server' {
  export class NextResponse extends Response {
    static next(): NextResponse;
    static redirect(url: string | URL): NextResponse;
    static rewrite(url: string | URL): NextResponse;
  }
  export class NextRequest extends Request {
    nextUrl: URL;
  }
}
