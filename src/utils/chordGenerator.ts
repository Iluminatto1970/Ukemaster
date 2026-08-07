/**
 * Motor de voicings de ukulele (teoria musical).
 *
 * Dado um nome de acorde que NÃO existe no dicionário estático — ex. "D7(9)",
 * "Bb7M(9)", "Am7M", "F#9-/7", "A6(9)" — este motor:
 *   1. parseia o nome em TÔNICA + QUALIDADE (intervalos em semitons);
 *   2. converte a qualidade em um conjunto de notas do acorde (teoria musical);
 *   3. busca EXAUSTIVAMENTE no braço do ukulele (afinação GCEA, casas 0–12)
 *      a melhor posição (voicing) em que TODAS as 4 cordas tocam notas do
 *      acorde, com pontuação de tocabilidade (casas baixas, incluir
 *      fundamental/3ª/7ª, sem notas estranhas);
 *   4. gera frets + fingers + barreFret + baseFret (formato ChordFingering).
 *
 * Resultado: NUNCA apresentamos um acorde sem diagrama — o acorde que faltava
 * ganha uma posição REAL e tocável. Se nenhuma posição for encontrada, a
 * função retorna null e o chamador cai na simplificação por teoria musical
 * (ladder em chordUtils).
 */
import type { ChordDefinition, ChordFingering } from '../types.js';

// Afinação padrão do ukulele (reentrante G C E A) em semitons a partir de C4
const STRING_PCS = [7, 0, 4, 9]; // G4=7, C4=0, E4=4, A4=9
const MAX_FRET = 12;

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#',
  Eb: 'D#',
  Gb: 'F#',
  Ab: 'G#',
  Bb: 'A#',
};

interface ParsedChord {
  /** Tônica no formato sustenido (padrão do dicionário): "A#", "F#"... */
  rootSharp: string;
  /** Tônica como foi escrita (pode ser bemol: "Bb"). */
  rootOriginal: string;
  rootPc: number;
  /** Qualidade canônica (ex.: "9", "maj9", "m7(b9)", "m(maj7)"). */
  canonical: string;
  /** Intervalos do acorde em semitons (ex.: [0,4,7,10,14]). */
  intervals: number[];
}

// Qualidade → intervalos (semitons a partir da tônica). Ordem importa:
// padrões mais específicos primeiro.
const QUALITY_PATTERNS: Array<{ test: RegExp; intervals: number[]; canonical: string }> = [
  // Menor com 7ª maior (Am7M / AmM7 / Am(maj7))
  { test: /^m7M$|^mM7$|^mmaj7$|^m\(maj7\)$|^m\(M7\)$/i, intervals: [0, 3, 7, 11], canonical: 'm(maj7)' },
  // Menor com 7ª (m7) — ANTES do maj7 para não colidir com "M7" case-insensitive
  { test: /^m7$/, intervals: [0, 3, 7, 10], canonical: 'm7' },
  // 7ª maior: maj7 / 7M / 7m (notação BR: m=maior) / 7+ / M7 (case-sensitive)
  { test: /^maj7$|^7M$|^7m$|^7\+$|^M7$/i, intervals: [0, 4, 7, 11], canonical: 'maj7' },
  { test: /^m7b5$|^ø$|^Ø$|^m7\(b5\)$/i, intervals: [0, 3, 6, 10], canonical: 'm7b5' },
  { test: /^dim7$|^°7$|^°$/i, intervals: [0, 3, 6, 9], canonical: 'dim7' },
  { test: /^dim$|^°$/i, intervals: [0, 3, 6], canonical: 'dim' },
  { test: /^aug$|^aug5$|^\+5$|^#5$|^\+$/i, intervals: [0, 4, 8], canonical: 'aug' },
  { test: /^7sus4$|^7sus$/i, intervals: [0, 5, 7, 10], canonical: '7sus4' },
  // Menores com extensões — antes dos maiores para não colidir (M9 vs m9)
  { test: /^m9$/, intervals: [0, 3, 7, 10, 14], canonical: 'm9' },
  { test: /^m11$/, intervals: [0, 3, 7, 10, 14, 17], canonical: 'm11' },
  { test: /^m13$/, intervals: [0, 3, 7, 10, 14, 21], canonical: 'm13' },
  { test: /^maj9$|^M9$|^9M$/, intervals: [0, 4, 7, 11, 14], canonical: 'maj9' },
  { test: /^maj11$/, intervals: [0, 4, 7, 11, 14, 17], canonical: 'maj11' },
  { test: /^maj13$/, intervals: [0, 4, 7, 11, 14, 21], canonical: 'maj13' },
  { test: /^7b9$|^7\(b9\)$|^9-$|^9b$/, intervals: [0, 4, 7, 10, 13], canonical: '7(b9)' },
  { test: /^7#9$|^7\(#9\)$|^9\+$/, intervals: [0, 4, 7, 10, 15], canonical: '7(#9)' },
  { test: /^7b5$|^7\(b5\)$/, intervals: [0, 4, 6, 10], canonical: '7(b5)' },
  { test: /^7#5$|^7\(#5\)$/, intervals: [0, 4, 8, 10], canonical: '7(#5)' },
  { test: /^6\/9$|^6\(9\)$/, intervals: [0, 4, 7, 9, 14], canonical: '6/9' },
  { test: /^13$/, intervals: [0, 4, 7, 10, 14, 21], canonical: '13' },
  { test: /^11$/, intervals: [0, 4, 7, 10, 14, 17], canonical: '11' },
  { test: /^9$/, intervals: [0, 4, 7, 10, 14], canonical: '9' },
  { test: /^m6$/, intervals: [0, 3, 7, 9], canonical: 'm6' },
  { test: /^6$/, intervals: [0, 4, 7, 9], canonical: '6' },
  { test: /^sus2$/, intervals: [0, 2, 7], canonical: 'sus2' },
  { test: /^sus4$/, intervals: [0, 5, 7], canonical: 'sus4' },
  { test: /^add9$/, intervals: [0, 4, 7, 14], canonical: 'add9' },
  { test: /^add11$/, intervals: [0, 4, 7, 17], canonical: 'add11' },
  { test: /^7$/, intervals: [0, 4, 7, 10], canonical: '7' },
  { test: /^5$/, intervals: [0, 7], canonical: '5' },
  { test: /^m$|^min$/, intervals: [0, 3, 7], canonical: 'm' },
  { test: /^maj$/, intervals: [0, 4, 7], canonical: '' },
  { test: /^$/, intervals: [0, 4, 7], canonical: '' },
];

/** Intervalo adicional de uma extensão entre parênteses (tensão do acorde). */
const EXTENSION_INTERVALS: Record<string, number> = {
  '9': 14,
  'add9': 14,
  'b9': 13,
  '9-': 13,
  '9b': 13,
  '#9': 15,
  '9+': 15,
  '11': 17,
  '#11': 18,
  '13': 21,
  '6': 9,
  'b13': 20,
};

/**
 * Aplica uma extensão "(9)" / "(b9)" / "(13)" sobre a qualidade base,
 * devolvendo os intervalos combinados + o nome canônico do acorde resultante.
 */
function applyExtension(
  baseCanonical: string,
  baseIntervals: number[],
  extRaw: string
): { intervals: number[]; canonical: string } | null {
  const ext = extRaw.replace(/\s/g, '').toLowerCase();
  const extra = EXTENSION_INTERVALS[ext];
  if (extra === undefined) return null;

  const intervals = Array.from(new Set([...baseIntervals, extra]));

  // Nome canônico da combinação base + extensão (notação padrão)
  const map: Array<[string, string]> = [
    ['maj7+9', 'maj9'],
    ['maj7+b9', 'maj7(b9)'],
    ['m7+9', 'm9'],
    ['m7+b9', 'm7(b9)'],
    ['7+9', '9'],
    ['7+b9', '7(b9)'],
    ['7+#9', '7(#9)'],
    ['7+13', '13'],
    ['7+11', '11'],
    ['6+9', '6/9'],
    ['+9', 'add9'],
    ['+b9', '7(b9)'],
    ['+6', '6'],
  ];
  const key = `${baseCanonical}+${ext}`;
  const combo = map.find(([k]) => k === key);
  const canonical = combo ? combo[1] : baseCanonical ? `${baseCanonical}(${extRaw.trim()})` : `add${extRaw.trim()}`;

  return { intervals, canonical };
}

/**
 * Parseia "D7(9)", "Bb7M(9)", "Am7M", "F#9-/7", "A6(9)" → { tônica, intervalos }.
 * Retorna null se o nome não for um acorde reconhecível.
 */
export function parseChordName(name: string): ParsedChord | null {
  if (!name) return null;
  const clean = name.trim().replace(/^\[|\]$/g, '');
  const m = clean.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return null;

  const rootOriginal = m[1];
  let rest = m[2].trim();

  // Normaliza a tônica para sustenido (padrão do dicionário)
  const rootSharp = FLAT_TO_SHARP[rootOriginal] || rootOriginal;
  const rootPc = CHROMATIC.indexOf(rootSharp);
  if (rootPc === -1) return null;

  // Artefatos comuns de cifra:
  //  - "F#9-/7" (scrape de "F#7(9-)") → "9-"
  rest = rest.replace(/^9-?\/7$/, '9-').replace(/^9\+?\/7$/, '9+');
  //  - remove barra de baixo residual que não seja nota (slash real "G/Bb"
  //    é tratado pelo resolveChordWithTheory ANTES de chegar aqui)
  rest = rest.replace(/\/[A-G][#b]?$/, '').trim();

  // Extensão entre parênteses: "7(9)" → base "7" + extensão "9"
  const paren = rest.match(/\(([^)]+)\)/);
  const extRaw = paren ? paren[1] : null;
  if (paren) rest = rest.replace(/\([^)]*\)/g, '').trim();

  for (const { test, intervals, canonical } of QUALITY_PATTERNS) {
    if (test.test(rest)) {
      if (extRaw !== null) {
        const combined = applyExtension(canonical, intervals, extRaw);
        if (!combined) return null;
        return {
          rootSharp,
          rootOriginal,
          rootPc,
          canonical: combined.canonical,
          intervals: combined.intervals,
        };
      }
      return {
        rootSharp,
        rootOriginal,
        rootPc,
        canonical,
        intervals,
      };
    }
  }

  return null;
}

interface VoicingCandidate {
  frets: number[];
  score: number;
}

/**
 * Busca exaustiva no braço (GCEA, casas 0..MAX_FRET) por posições em que as
 * 4 cordas tocam notas do acorde. Pontua: notas certas > incluir
 * fundamental/3ª/7ª > casas baixas > pouca pestana. Retorna as 2 melhores.
 */
function searchVoicings(parsed: ParsedChord): VoicingCandidate[] {
  const toneSet = new Set(parsed.intervals.map((iv) => (parsed.rootPc + iv) % 12));

  // Notas "essenciais" do acorde para pontuar melhor
  const essentialPcs = new Set<number>([parsed.rootPc]);
  if (parsed.intervals.includes(4)) essentialPcs.add((parsed.rootPc + 4) % 12); // 3ª maior
  if (parsed.intervals.includes(3)) essentialPcs.add((parsed.rootPc + 3) % 12); // 3ª menor
  if (parsed.intervals.includes(5)) essentialPcs.add((parsed.rootPc + 5) % 12); // sus4
  if (parsed.intervals.includes(2)) essentialPcs.add((parsed.rootPc + 2) % 12); // sus2
  for (const sev of [10, 11, 9]) {
    if (parsed.intervals.includes(sev)) essentialPcs.add((parsed.rootPc + sev) % 12); // 7ª
  }

  const candidates: VoicingCandidate[] = [];

  for (let f0 = 0; f0 <= MAX_FRET; f0++) {
    if (!toneSet.has((STRING_PCS[0] + f0) % 12)) continue;
    for (let f1 = 0; f1 <= MAX_FRET; f1++) {
      if (!toneSet.has((STRING_PCS[1] + f1) % 12)) continue;
      for (let f2 = 0; f2 <= MAX_FRET; f2++) {
        if (!toneSet.has((STRING_PCS[2] + f2) % 12)) continue;
        for (let f3 = 0; f3 <= MAX_FRET; f3++) {
          if (!toneSet.has((STRING_PCS[3] + f3) % 12)) continue;

          const frets = [f0, f1, f2, f3];
          const pcs = frets.map((f, i) => (STRING_PCS[i] + f) % 12);
          const played = frets.filter((f) => f > 0);
          const maxFret = played.length ? Math.max(...played) : 0;
          const minFret = played.length ? Math.min(...played) : 0;

          // Posições muito altas (> 7ª casa) são impraticáveis
          if (maxFret > 7) continue;

          // O diagrama SVG mostra apenas 4 trastes (baseFret..baseFret+3).
          // Voicings com spread > 3 casas perderiam notas no desenho —
          // exigimos voicings compactos (padrão real de acordes de ukulele).
          if (played.length > 0 && maxFret - minFret > 3) continue;

          let score = 0;
          // Notas essenciais presentes (fundamental, 3ª, 7ª...)
          let essentials = 0;
          for (const pc of new Set(pcs)) {
            if (essentialPcs.has(pc)) essentials++;
          }
          score += essentials * 40;

          // Fundamental presente (ideal na 1ª ou 2ª corda)
          if (pcs.includes(parsed.rootPc)) score += 25;

          // Prefere voicings sem pestana (dedos livres)
          const fretCounts = new Map<number, number>();
          for (const f of played) fretCounts.set(f, (fretCounts.get(f) || 0) + 1);
          const hasBarre = [...fretCounts.values()].some((c) => c >= 2);
          if (!hasBarre) score += 12;

          // Casas baixas (mais fáceis)
          score -= (fretCounts.size > 0 ? (maxFret + minFret) : 0) * 4;
          score -= played.reduce((a, b) => a + b, 0);

          // Notas duplicadas demais penalizam (prefere voicing "cheio")
          const distinct = new Set(pcs).size;
          score += distinct * 3;

          candidates.push({ frets, score });
        }
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || (a.frets.reduce((x, y) => x + y, 0) - b.frets.reduce((x, y) => x + y, 0)))
    .slice(0, 2);
}

/** Gera fingers + barreFret + baseFret a partir de um vetor de casas. */
function buildFingering(frets: number[]): ChordFingering {
  const fingers = [0, 0, 0, 0];

  // Pestana: a casa mais repetida (com 2+ cordas) e mais baixa
  const counts = new Map<number, number>();
  for (const f of frets) if (f > 0) counts.set(f, (counts.get(f) || 0) + 1);
  let barreFret: number | undefined;
  let bestCount = 0;
  for (const [f, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      barreFret = f;
    }
  }
  if (barreFret !== undefined && bestCount < 2) barreFret = undefined;

  if (barreFret !== undefined) {
    frets.forEach((f, i) => {
      if (f === barreFret) fingers[i] = 1;
    });
  }

  // Dedos 2..4 nas casas restantes, da mais baixa para a mais alta
  let finger = 2;
  const restOrder = frets
    .map((f, i) => [f, i] as const)
    .filter(([f, i]) => f > 0 && !(barreFret !== undefined && f === barreFret))
    .sort((a, b) => a[0] - b[0]);
  for (const [, i] of restOrder) {
    fingers[i] = Math.min(finger, 4);
    finger++;
  }

  // baseFret: como a busca garante spread ≤ 3, a menor casa tocada é a base
  // do diagrama — todas as casas caem na janela de 4 trastes (baseFret..+3).
  const played = frets.filter((f) => f > 0);
  const minFret = played.length ? Math.min(...played) : 0;
  const baseFret = minFret > 1 ? minFret : 1;

  return { frets, fingers, ...(barreFret !== undefined ? { barreFret } : {}), ...(baseFret > 1 ? { baseFret } : {}) };
}

// ── Cache em memória (módulo) ────────────────────────────────────────
const memoryCache = new Map<string, ChordDefinition>();

/** Hidrata o cache do motor (chamado pelo chordCache ao carregar Supabase/localStorage). */
export function seedGeneratedChords(defs: ChordDefinition[]): void {
  for (const d of defs) memoryCache.set(d.id, d);
}

/** Todos os acordes gerados até agora (para o dicionário/busca). */
export function getAllGeneratedChords(): ChordDefinition[] {
  return Array.from(memoryCache.values());
}

/**
 * Gera (ou retorna do cache) a definição do acorde pelo motor de voicings.
 * Retorna null se o nome não for parseável ou nenhuma posição for viável.
 */
export function getOrGenerateChord(name: string): ChordDefinition | undefined {
  if (!name) return undefined;
  const clean = name.trim().replace(/^\[|\]$/g, '');
  if (memoryCache.has(clean)) return memoryCache.get(clean);

  const parsed = parseChordName(clean);
  if (!parsed) return undefined;

  const voicings = searchVoicings(parsed);
  if (voicings.length === 0) return undefined;

  const def: ChordDefinition = {
    id: clean,
    name: parsed.rootSharp + parsed.canonical,
    key: parsed.rootSharp,
    quality: parsed.canonical || 'Maior',
    difficulty: 'médio',
    generated: true,
    aliases: [
      parsed.rootOriginal + parsed.canonical,
      // Mantém o nome original completo como alias (ex.: "D7(9)")
      clean,
    ],
    fingerings: voicings.map((v) => buildFingering(v.frets)),
  };

  memoryCache.set(clean, def);
  return def;
}
