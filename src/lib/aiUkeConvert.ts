/**
 * UkeMaster Pro — conversão IA de cifras para UKULELE no pipeline de importação.
 *
 * Provider local: 9router (gateway OpenAI-compatível em 127.0.0.1:20128),
 * modelo padrão "free-roundrobin" (round-robin entre modelos grátis locais).
 * Config por env:
 *   AI_UKE_ENABLED   (1/0, padrão 1)
 *   AI_UKE_BASE_URL  (padrão http://127.0.0.1:20128/v1 — no Desktop usar o IP
 *                     Tailscale do notebook, ex.: http://100.108.235.116:20128/v1)
 *   AI_UKE_MODEL     (padrão free-roundrobin)
 *   AI_UKE_TIMEOUT_MS      (padrão 45000 por música)
 *   AI_UKE_MAX_PER_RUN     (padrão 400 músicas por rodada do cron)
 *
 * Estratégia em 2 camadas:
 *   1. IA: reescreve SOMENTE os acordes para shapes reais de ukulele (gCEA),
 *      preferindo tom com acordes fáceis — letra e estrutura preservadas.
 *   2. Fallback determinístico (sem IA/erro/saída inválida): transpõe o tom
 *      inteiro, quando necessário, para minimizar acordes difíceis no uke.
 *
 * Saída inválida NUNCA substitui o original (a cifra de origem é válida —
 * nomes de acordes são universais; a conversão é um ganho, não um risco).
 */

import type { Song } from '../types';

export interface AiUkeConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxPerRun: number;
}

export function getAiUkeConfig(): AiUkeConfig {
  const num = (v: string | undefined, def: number) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  return {
    enabled: process.env.AI_UKE_ENABLED !== '0',
    baseUrl: (process.env.AI_UKE_BASE_URL || 'http://127.0.0.1:20128/v1').replace(/\/+$/, ''),
    apiKey: process.env.AI_UKE_API_KEY || '',
    model: process.env.AI_UKE_MODEL || 'free-roundrobin',
    timeoutMs: num(process.env.AI_UKE_TIMEOUT_MS, 45_000),
    maxPerRun: num(process.env.AI_UKE_MAX_PER_RUN, 400),
  };
}

/**
 * Parse tolerante da resposta do 9router: o router pode devolver JSON puro,
 * JSON com `data: [DONE]` anexado, ou corpo SSE (linhas `data: {...}`).
 */
function parseRespostaRouter(text: string): any | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t.replace(/data:\s*\[DONE\]\s*$/, ''));
    } catch {
      /* cai para o fallback abaixo */
    }
  }
  // SSE: primeira linha data: que contenha um chat.completion
  const linha = t.split(/\r?\n/).find((l) => l.startsWith('data:') && l.includes('chat.completion'));
  if (linha) {
    try {
      return JSON.parse(linha.slice(5).trim());
    } catch {
      return null;
    }
  }
  return null;
}

// ── Extração/validação de acordes ────────────────────────────────────────────
const CHORD_RE = /\[([A-G][^\]\s]{0,11})\]/g;
const UKE_CHORD_OK =
  /^[A-G](#|b)?(m|maj|min|dim|aug|sus4|sus2|add[0-9]*|M)?[0-9]*(\/[A-G](#|b)?)?$/;

function extractChords(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CHORD_RE.source, 'g');
  while ((m = re.exec(text)) !== null) out.push(m[1]);
  return out;
}

/** Linhas "de letra" normalizadas (ignora acordes/cabeçalhos/vazio). */
function lyricLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    // Remove TODOS os tokens [..] (acordes e cabeçalhos de seção) e compara
    // o texto residual — numa cifra com acordes sobre a letra, acorde e
    // letra dividem a MESMA linha (filtrar linhas com colchete zerava tudo).
    .map((l) => l.replace(/\[[^\]]*\]/g, ' ').trim())
    .filter((l) => l.length > 0)
    .map((l) => l.toLowerCase().replace(/\s+/g, ' '));
}

/**
 * Valida a saída da IA: acordes plausíveis de ukulele, letra preservada e
 * estrutura (cabeçalhos de seção) mantida. Inválida → usa fallback.
 */
function outputValido(entrada: string, saida: string): boolean {
  if (!saida || saida.trim().length < 10) return false;
  const chordsIn = extractChords(entrada);
  const chordsOut = extractChords(saida);
  if (chordsIn.length === 0 || chordsOut.length < Math.floor(chordsIn.length * 0.5)) return false;
  if (!chordsOut.every((c) => UKE_CHORD_OK.test(c))) return false;
  // Letra: ≥85% das linhas de letra da saída existem na entrada (ordem livre).
  const inLyrics = new Set(lyricLines(entrada));
  const outLyrics = lyricLines(saida);
  if (outLyrics.length === 0) return false;
  const ok = outLyrics.filter((l) => inLyrics.has(l)).length;
  return ok / outLyrics.length >= 0.85;
}

// ── Camada 1: IA via 9router ─────────────────────────────────────────────────
const PROMPT = `Você é um arranjador experiente de UKULELE (afinação padrão gCEA).
Recebe uma cifra em formato com acordes entre colchetes (ex.: [C], [Am], [G7]) e a devolve CONVERTIDA PARA UKULELE.

Regras OBRIGATÓRIAS:
1. Substitua APENAS os acordes entre colchetes. NÃO altere letras, pontuação, linhas em branco ou cabeçalhos de seção como [Primeira Parte], [Refrão].
2. Use acordes de ukulele padrão (shapes reais gCEA): C, C7, Cm, D, Dm, D7, E, Em, E7, F, Fm, F7, G, G7, Gm, A, Am, A7, B7, Bm, Bb, e equivalentes com sus/add/maiúsculas.
3. Se o tom original tem acordes difíceis no ukulele (B, F#, C#, Eb, Ab e derivados), transponha o TOM INTEIRO (ex.: -2 ou +2 semitons) para cair em tom amigável (C, G, D, A, Am, Em, F) — transpondo TODOS os acordes coerentemente, inclusive o baixo de acordes com barra (ex.: [D/F#] → [C/E]).
4. Mantenha o número aproximado de acordes por linha (mesma grade harmônica).
5. Responda APENAS com a cifra convertida, sem comentários, sem markdown, sem introdução.`;

async function chamarIa(cfg: AiUkeConfig, content: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = parseRespostaRouter(await res.text());
    const text: string | undefined = json?.choices?.[0]?.message?.content;
    return typeof text === 'string' ? text.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Camada 2: fallback determinístico (transposição para tom amigável) ──────
const SEMITONS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// Sustenidos para transpor para CIMA; bemóis para BAIXO (enarmonia correta).
const NOMES: string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOMES_BEMOL: string[] = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const RAIZ_RE = /^([A-G])([#b]?)([^/\s]*)(?:\/([A-G][#b]?))?$/;
// Acordes difíceis no ukulele (por raiz): B, F# e tudo além de 1 sustenido.
const RAIZ_DIFICIL = new Set(['B', 'F#', 'C#', 'Eb', 'Ab', 'Db', 'Gb']);

function transporAcorde(chord: string, shift: number, usarBemol: boolean): string {
  const m = chord.match(RAIZ_RE);
  if (!m) return chord;
  const [, letra, acidente, qualidade, baixo] = m;
  const idx = SEMITONS[letra] + (acidente === '#' ? 1 : acidente === 'b' ? -1 : 0);
  const novo = ((idx + shift) % 12 + 12) % 12;
  const nome = usarBemol ? NOMES_BEMOL[novo] : NOMES[novo];
  let baixoNovo = '';
  if (baixo) {
    const bi = SEMITONS[baixo[0]] + (baixo[1] === '#' ? 1 : baixo[1] === 'b' ? -1 : 0);
    const bn = ((bi + shift) % 12 + 12) % 12;
    baixoNovo = '/' + (usarBemol ? NOMES_BEMOL[bn] : NOMES[bn]);
  }
  return nome + (qualidade || '') + baixoNovo;
}

/** Transpõe todos os acordes do texto; se shift=0, devolve o original. */
function transporTexto(content: string, shift: number, usarBemol: boolean): string {
  return content.replace(CHORD_RE.source ? /\[([A-G][^\]\s]{0,11})\]/g : /x/, (all, c: string) =>
    `[${transporAcorde(c, shift, usarBemol)}]`
  );
}

function contarDificeis(content: string): number {
  let dif = 0, tot = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(CHORD_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    tot++;
    const raiz = (m[1].match(/^([A-G][#b]?)/) || [])[1] || '';
    if (RAIZ_DIFICIL.has(raiz)) dif++;
  }
  return tot > 0 ? dif : 0;
}

/**
 * Fallback: se a cifra tem muitos acordes difíceis, testa deslocamentos e
 * aplica o que minimiza dificuldade (sem mudar nada se já está amigável).
 */
export function fallbackUkeFriendly(content: string): { content: string; shift: number } {
  const base = contarDificeis(content);
  if (base === 0) return { content, shift: 0 };
  let melhor = { shift: 0, dif: base, usarBemol: false };
  for (const shift of [-2, 2, -3, 3, -1, 1, -4, 4]) {
    const usarBemol = shift < 0;
    const dif = contarDificeis(transporTexto(content, shift, usarBemol));
    if (dif < melhor.dif || (dif === melhor.dif && Math.abs(shift) < Math.abs(melhor.shift) && melhor.shift !== 0)) {
      melhor = { shift, dif, usarBemol };
    }
  }
  if (melhor.shift === 0 || melhor.dif >= base) return { content, shift: 0 };
  return { content: transporTexto(content, melhor.shift, melhor.usarBemol), shift: melhor.shift };
}

// ── Lote para o cron ─────────────────────────────────────────────────────────
export interface AiUkeResult {
  convertidas: number;   // reescritas pela IA
  fallback: number;      // IA falhou/inválida → transposição determinística
  mantidas: number;      // já amigáveis, nada a fazer
  desativado: boolean;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
}

/**
 * Converte o lote de músicas NOVAS (muta s.content em place) para ukulele.
 * Nunca lança: qualquer falha degrada para o fallback ou mantém o original.
 */
export async function convertBatchToUkulele(songs: Song[]): Promise<AiUkeResult> {
  const cfg = getAiUkeConfig();
  const result: AiUkeResult = { convertidas: 0, fallback: 0, mantidas: 0, desativado: !cfg.enabled };
  if (!cfg.enabled || songs.length === 0) return result;

  // Cap por rodada (custo/latência): o restante fica com o fallback.
  const alvo = songs.slice(0, cfg.maxPerRun);
  await pool(alvo, 3, async (s) => {
    if (!s.content || s.content.length < 40) {
      result.mantidas++;
      return;
    }
    const original = s.content;
    let feito = false;
    // 2 tentativas (round-robin do router já variando modelos entre chamadas).
    for (let tent = 0; tent < 2 && !feito; tent++) {
      const out = await chamarIa(cfg, original);
      if (out && outputValido(original, out) && out !== original) {
        s.content = out;
        result.convertidas++;
        feito = true;
      }
    }
    if (!feito) {
      const fb = fallbackUkeFriendly(original);
      if (fb.shift !== 0) {
        s.content = fb.content;
        result.fallback++;
      } else {
        result.mantidas++;
      }
    }
  });
  return result;
}
