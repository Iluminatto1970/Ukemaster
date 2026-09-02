/**
 * Logger central do UkeMaster Pro.
 *
 * Por padrão delega para `console.*` com prefixo de escopo. Quando um
 * provedor externo for injetado via `setLoggerProvider` (ex.: Sentry),
 * `error`/`warn` passam a ser enviados a ele também.
 *
 * Não cria dependência de Sentry — a integração é opcional via env
 * `VITE_SENTRY_DSN` e bootstrap manual em `src/main.tsx`.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Marca o escopo do log (ex.: '[supabase]'). */
  scope?: string;
  /** Campos extras anexados como objeto. NÃO inclui PII. */
  extra?: Record<string, unknown>;
  /** Erro anexado (enviado como exception no provedor). */
  err?: unknown;
}

export interface LoggerProvider {
  captureException?(err: unknown, context?: LogContext): void;
  captureMessage?(msg: string, level: 'info' | 'warn' | 'error', context?: LogContext): void;
}

let provider: LoggerProvider | null = null;

export function setLoggerProvider(p: LoggerProvider | null): void {
  provider = p;
}

function serialize(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Normaliza args em `{ msg, context }` para log uniforme. */
function pack(args: unknown[]): { msg: string; ctx: LogContext } {
  const ctx: LogContext = {};
  let msg = '';
  if (args.length === 1) {
    msg = typeof args[0] === 'string' ? args[0] : serialize(args[0]);
  } else {
    const [first, ...rest] = args;
    msg = typeof first === 'string' ? first : serialize(first);
    if (rest.length === 1 && rest[0] && typeof rest[0] === 'object') {
      Object.assign(ctx, rest[0] as LogContext);
    } else if (rest.length > 0) {
      ctx.extra = { args: rest.map(serialize) };
    }
  }
  // Erro posicionado por último → anexa como `err`.
  const last = args[args.length - 1];
  if (last instanceof Error) {
    ctx.err = last;
    if (!msg) msg = last.message;
  }
  return { msg, ctx };
}

function emit(level: Level, args: unknown[]): void {
  const { msg, ctx } = pack(args);
  const prefix = ctx.scope ? `${ctx.scope} ` : '';
  const line = `${prefix}${msg}`;
  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn' ? console.warn :
    level === 'info' ? console.info :
    console.debug;

  if (ctx.extra && Object.keys(ctx.extra).length) {
    consoleFn(line, ctx.extra);
  } else {
    consoleFn(line);
  }

  if (!provider) return;
  if (level === 'error') {
    provider.captureException?.(ctx.err ?? msg, ctx);
  } else if (level === 'warn' || level === 'info') {
    provider.captureMessage?.(msg, level, ctx);
  }
}

export const logger = {
  // monkey-patch console methods for centralization
  // ensures console.error/warn route through logger (and provider)
  // preserves original console output
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _initConsolePatch: (function(){
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args:any[])=>{ logger.error(...args); origError(...args); };
    console.warn = (...args:any[])=>{ logger.warn(...args); origWarn(...args); };
  })(),
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};

/** Atalho para usar dentro de `catch (e)` — loga erro e re-levanta opcionalmente. */
export function logError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  logger.error(scope, err, extra);
}

/** Captura explicitamente uma exceção para o provedor (sem logar no console). */
export function reportError(scope: string, err: unknown, extra?: Record<string, unknown>): void {
  if (provider) provider.captureException?.(err, { scope, extra });
}
