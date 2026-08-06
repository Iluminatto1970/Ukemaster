/**
 * Manipulação de cifras/acordes: transposição de tom, extração de acordes, normalização e formatação para exibição.
 */
// Chord utility functions for parsing, transposing, extracting chords, and auto-detecting chords from imported text/documents

const CHROMATIC_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Map flats to sharps for consistent calculation
const FLAT_MAP: Record<string, string> = {
  'Db': 'C#',
  'Eb': 'D#',
  'Gb': 'F#',
  'Ab': 'G#',
  'Bb': 'A#',
};

export interface SongLineToken {
  chord?: string;
  text: string;
}

export interface SongParsedLine {
  isSectionHeader?: boolean;
  sectionTitle?: string;
  isTabLine?: boolean;
  tabContent?: string;
  tokens: SongLineToken[];
  rawLine: string;
}

// Regex matching valid musical chord names
const SINGLE_CHORD_REGEX = /^[A-G][#b]?(m|maj|min|dim|aug|sus|add|7|9|11|13|6|5|4|2|M|\+|-|\/)*$/i;

/**
 * Divide um acorde com baixo invertido (slash chord) em base + baixo.
 * Ex.: "Dm/C" → { base: 'Dm', bass: 'C' }; "G/B" → { base: 'G', bass: 'B' }.
 *
 * Regras da teoria musical: em "X/Y", Y é a nota mais grave (baixo).
 * No ukulele, quando o diagrama do acorde completo não existe, a
 * simplificação padrão é tocar apenas a BASE (X) — o baixo invertido é
 * uma nuance de acompanhamento, não muda a mão do acorde na maioria dos
 * casos práticos.
 */
export function splitSlashChord(chordName: string): {
  base: string;
  bass?: string;
} {
  if (!chordName) return { base: chordName || '' };
  const clean = chordName.trim();
  const idx = clean.lastIndexOf('/');
  if (idx <= 0) return { base: clean };
  const base = clean.slice(0, idx).trim();
  const bass = clean.slice(idx + 1).trim();
  // Só trata como slash chord se a base for um acorde válido (raiz + qualidade)
  // e o baixo for uma nota simples (ex.: C, C#, Db) — evita falsos positivos.
  if (/^[A-G][#b]?/.test(base) && /^[A-G][#b]?$/.test(bass)) {
    return { base, bass };
  }
  return { base: clean };
}

/**
 * Simplifica um acorde com baixo invertido para a base.
 * Ex.: "Dm/C" → "Dm"; "G/C" → "G"; "F/C" → "F"; "G/B" → "G".
 * Se não for slash chord, retorna o próprio nome.
 */
export function simplifySlashChord(chordName: string): string {
  return splitSlashChord(chordName).base;
}

export function isChordToken(token: string): boolean {
  if (!token) return false;
  const cleaned = token.replace(/[\(\)\[\]\{\},]/g, '').trim();
  if (!cleaned) return false;
  // Common Portuguese/English non-chord words that might look like single letters
  if (['e', 'a', 'o', 'em', 'da', 'do', 'no', 'na', 'um', 'de', 'se', 'me', 'te', 'que', 'com', 'por', 'pra', 'pro', 'as', 'os'].includes(cleaned.toLowerCase())) {
    return false;
  }
  return SINGLE_CHORD_REGEX.test(cleaned);
}

export function isChordLine(line: string): boolean {
  if (!line || !line.trim()) return false;
  const trimmed = line.trim();

  // If already contains brackets [C] or section headers [Refrão]
  if (/\[[A-G][^\]]*\]/i.test(trimmed)) return false;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;

  let chordCount = 0;
  for (const token of tokens) {
    if (isChordToken(token)) {
      chordCount++;
    }
  }

  // If over 60% of tokens in the line are valid chords
  return (chordCount / tokens.length) >= 0.6;
}

export function transposeChordName(chordName: string, semitones: number): string {
  if (semitones === 0 || !chordName) return chordName;

  // Regex to separate root note (e.g. C#, Bb, F) from chord quality (e.g. m, maj7, 7, sus4)
  const regex = /^([A-G][#b]?)(.*)$/;
  const match = chordName.match(regex);
  if (!match) return chordName;

  let root = match[1];
  const quality = match[2];

  if (FLAT_MAP[root]) {
    root = FLAT_MAP[root];
  }

  const rootIndex = CHROMATIC_SCALE.indexOf(root);
  if (rootIndex === -1) return chordName;

  let newIndex = (rootIndex + semitones) % 12;
  if (newIndex < 0) newIndex += 12;

  return CHROMATIC_SCALE[newIndex] + quality;
}

export function parseChordPro(content: string, transposeSemitones: number = 0): SongParsedLine[] {
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const parsedLines: SongParsedLine[] = [];
  let insideTabBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Tab block tags {sot} / {eot} or [tab] / [/tab]
    if (/^(\{sot\}|\[tab\])$/i.test(trimmed)) {
      insideTabBlock = true;
      parsedLines.push({
        isTabLine: true,
        tokens: [],
        rawLine: '--- Tablatura ---',
      });
      continue;
    }

    if (/^(\{eot\}|\[\/tab\])$/i.test(trimmed)) {
      insideTabBlock = false;
      continue;
    }

    if (insideTabBlock || isTabLine(line)) {
      parsedLines.push({
        isTabLine: true,
        tabContent: line,
        tokens: [],
        rawLine: line,
      });
      continue;
    }

    // Section header check like [Intro], [Verso 1], [Refrão]
    if (/^\[(Intro|Verso|Refrão|Ponte|Outro|Solo|Final|Chorus|Verse|Bridge)[^\]]*\]$/i.test(trimmed)) {
      parsedLines.push({
        isSectionHeader: true,
        sectionTitle: trimmed.replace(/^\[|\]$/g, ''),
        tokens: [],
        rawLine: line,
      });
      continue;
    }

    // Parse bracketed chords e.g. "Na [G]bruma leve das [Am]paixões"
    const tokens: SongLineToken[] = [];
    const regex = /\[([^\]]+)\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const textBefore = line.substring(lastIndex, match.index);
      const originalChord = match[1];
      const transposedChord = transposeChordName(originalChord, transposeSemitones);

      tokens.push({
        text: textBefore,
        chord: transposedChord,
      });

      lastIndex = regex.lastIndex;
    }

    // Remaining text after last chord
    const remainingText = line.substring(lastIndex);
    if (remainingText || tokens.length > 0) {
      tokens.push({
        text: remainingText,
      });
    } else if (!line.trim()) {
      tokens.push({ text: '' });
    }

    parsedLines.push({
      isSectionHeader: false,
      tokens,
      rawLine: line,
    });
  }

  return parsedLines;
}

export function extractUniqueChords(content: string, transposeSemitones: number = 0): string[] {
  if (!content) return [];
  const regex = /\[([^\]]+)\]/g;
  const chordsSet = new Set<string>();

  let match;
  while ((match = regex.exec(content)) !== null) {
    const chord = match[1].trim();
    // Ignore section headers
    if (!/^(Intro|Verso|Refrão|Ponte|Outro|Solo|Final|Chorus|Verse|Bridge)/i.test(chord)) {
      const transposed = transposeChordName(chord, transposeSemitones);
      chordsSet.add(transposed);
    }
  }

  return Array.from(chordsSet);
}

/**
 * Intelligent Auto-Convertor from plain text / Cifra / Sheet Music to ChordPro [C] format
 * Automatically detects chords placed on lines above lyrics or embedded in text.
 */
export function autoConvertTextToChordPro(rawText: string): {
  content: string;
  detectedChords: string[];
  suggestedKey: string;
} {
  if (!rawText) {
    return { content: '', detectedChords: [], suggestedKey: 'C' };
  }

  // Pre-clean and format tabs
  const textWithTabsCleaned = formatAndCleanTabs(rawText);

  const lines = textWithTabsCleaned.split(/\r?\n/);
  const resultLines: string[] = [];
  const chordCounts: Record<string, number> = {};

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Preserve tab tags and tab lines directly
    if (/^(\{sot\}|\{eot\}|\[tab\]|\[\/tab\])$/i.test(trimmed) || isTabLine(line)) {
      resultLines.push(line);
      i++;
      continue;
    }

    // Section headers like Refrão:, [Verso 1], Intro:
    const sectionMatch = trimmed.match(/^(Refrão|Verse|Chorus|Intro|Ponte|Bridge|Solo|Outro|Verso\s*\d*)[:\s]*$/i);
    if (sectionMatch) {
      const secName = sectionMatch[1].charAt(0).toUpperCase() + sectionMatch[1].slice(1);
      resultLines.push(`[${secName}]`);
      i++;
      continue;
    }

    // Check if current line already has [C] bracketed chords
    if (/\[[A-G][^\]]*\]/i.test(trimmed)) {
      resultLines.push(line);
      // Count detected chords
      const matches = line.match(/\[([A-G][^\]]*)\]/g) || [];
      for (const m of matches) {
        const c = m.replace(/^\[|\]$/g, '').trim();
        if (isChordToken(c)) {
          chordCounts[c] = (chordCounts[c] || 0) + 1;
        }
      }
      i++;
      continue;
    }

    // Check if line i is a Chord Line (e.g. "G            Am          C")
    if (isChordLine(line)) {
      const chordPositions: { chord: string; index: number }[] = [];
      const regex = /([A-G][#b]?(?:m|maj|min|dim|aug|sus|add|7|9|11|13|6|5|4|2|M|\+|-|\/)*)/gi;
      let match;

      while ((match = regex.exec(line)) !== null) {
        const chordStr = match[1];
        if (isChordToken(chordStr)) {
          chordPositions.push({ chord: chordStr, index: match.index });
          chordCounts[chordStr] = (chordCounts[chordStr] || 0) + 1;
        }
      }

      // Check if line i+1 exists and is a Lyric Line
      const nextLine = lines[i + 1];
      if (nextLine !== undefined && nextLine.trim() !== '' && !isChordLine(nextLine) && !/^(Refrão|Intro|Verso|Solo|Ponte)/i.test(nextLine.trim())) {
        // Merge chords into next line (lyric line)
        let mergedLine = '';
        let lastCharIdx = 0;

        // Sort chord positions from right to left or left to right
        chordPositions.sort((a, b) => a.index - b.index);

        for (let cp = 0; cp < chordPositions.length; cp++) {
          const { chord, index } = chordPositions[cp];
          // Slice lyrics before chord
          const part = nextLine.substring(lastCharIdx, Math.min(index, nextLine.length));
          mergedLine += part + `[${chord}]`;
          lastCharIdx = Math.min(index, nextLine.length);
        }

        // Add remaining lyrics
        mergedLine += nextLine.substring(lastCharIdx);
        resultLines.push(mergedLine);

        // Skip both lines since we merged
        i += 2;
        continue;
      } else {
        // Standalone chord line (e.g. Intro with chords only)
        const standaloneFormatted = chordPositions.map(cp => `[${cp.chord}]`).join(' ');
        resultLines.push(standaloneFormatted || line);
        i++;
        continue;
      }
    }

    // Otherwise standard lyric or text line
    resultLines.push(line);
    i++;
  }

  const finalContent = resultLines.join('\n');
  const detectedChords = Object.keys(chordCounts);

  // Determine suggested key: most frequent chord or first chord
  let suggestedKey = 'C';
  let maxCount = 0;
  for (const [c, count] of Object.entries(chordCounts)) {
    // extract root note e.g. "Am" -> "A", "G7" -> "G", "C#m" -> "C#"
    const rootMatch = c.match(/^([A-G][#b]?)/);
    const root = rootMatch ? rootMatch[1] : c;
    if (count > maxCount) {
      maxCount = count;
      suggestedKey = root;
    }
  }

  return {
    content: finalContent,
    detectedChords,
    suggestedKey,
  };
}

export function extractYouTubeId(urlOrId: string): string | undefined {
  if (!urlOrId) return undefined;
  const clean = urlOrId.trim();

  // If already an 11 character ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }

  // Handle YouTube Shorts (e.g., youtube.com/shorts/VIDEO_ID)
  const shortsMatch = clean.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (shortsMatch && shortsMatch[1]) {
    return shortsMatch[1];
  }

  // Regex for standard YouTube links, watch?v=, short links (youtu.be), embed links, m.youtube.com
  const match = clean.match(/(?:youtu\.be\/|(?:www\.|m\.)?youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/i);
  if (match && match[1]) {
    return match[1];
  }

  return undefined;
}

export interface ExtractedSongMetadata {
  title: string;
  artist: string;
  suggestedKey?: string;
  difficulty?: 'Iniciante' | 'Intermediário' | 'Avançado';
}

/**
 * Intelligent Song Metadata & Title/Artist Extraction
 * Parses text headers, filename hints, and webpage titles to infer song title and artist
 */
export function extractSongMetadata(
  rawText: string,
  fallbackName: string = ''
): ExtractedSongMetadata {
  let title = '';
  let artist = '';
  let suggestedKey: string | undefined = undefined;
  let difficulty: 'Iniciante' | 'Intermediário' | 'Avançado' | undefined = undefined;

  // Clean fallbackName (e.g. filename or webpage title)
  let cleanFallback = fallbackName
    .replace(/\.(txt|docx?|pdf|cifra|chordpro|json|html?)$/i, '')
    .replace(/[-|_|–|—]\s*(cifra\s*club|cifras|ultimateguitar|ukulele\s*chords|cifra\s*de\s*ukulele|ukulele|letra|chords)\b/gi, '')
    .replace(/\(cifra.*?\)/gi, '')
    .replace(/\(ukulele.*?\)/gi, '')
    .replace(/_/g, ' ')
    .trim();

  // Try extracting headers from top lines of rawText
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  for (const line of lines.slice(0, 20)) {
    // Check Title headers
    const titleMatch = line.match(/^(música|musica|titulo|título|title|song|faixa)[:\s]+(.+)/i);
    if (titleMatch && !title) {
      title = titleMatch[2].replace(/^["']|["']$/g, '').trim();
    }

    // Check Artist headers
    const artistMatch = line.match(/^(artista|banda|autor|cantor|artist|band|by)[:\s]+(.+)/i);
    if (artistMatch && !artist) {
      artist = artistMatch[2].replace(/^["']|["']$/g, '').trim();
    }

    // Check Key / Tom headers
    const keyMatch = line.match(/^(tom|key|tom\s*base)[:\s]+([A-G][#b]?m?)/i);
    if (keyMatch && !suggestedKey) {
      suggestedKey = keyMatch[2].toUpperCase().replace('M', 'm').trim();
    }

    // Check Difficulty
    const diffMatch = line.match(/^(dificuldade|nivel|nível|difficulty)[:\s]+(iniciante|fácil|facil|intermediário|intermediario|médio|medio|avançado|avancado|difícil|dificil)/i);
    if (diffMatch && !difficulty) {
      const val = diffMatch[2].toLowerCase();
      if (val.includes('iniciante') || val.includes('fácil') || val.includes('facil')) {
        difficulty = 'Iniciante';
      } else if (val.includes('intermediár') || val.includes('intermediar') || val.includes('médio') || val.includes('medio')) {
        difficulty = 'Intermediário';
      } else {
        difficulty = 'Avançado';
      }
    }
  }

  // If title and artist not directly found by explicit header labels:
  if ((!title || !artist) && cleanFallback && /[-–—]/.test(cleanFallback)) {
    const parts = cleanFallback.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const p1 = parts[0];
      const p2 = parts.slice(1).join(' - ');

      const textSample = lines.slice(0, 5).join(' ').toLowerCase();
      if (textSample.includes(p1.toLowerCase()) && textSample.includes(p2.toLowerCase())) {
        if (!title) title = p2;
        if (!artist) artist = p1;
      } else {
        if (!artist) artist = p1;
        if (!title) title = p2;
      }
    }
  }

  // Option B: Inspect first non-empty line of text if still missing
  if (!title && lines.length > 0) {
    const firstLine = lines[0];
    // Rejeita linhas com acordes embutidos ([G], "C Am F") ou lixo de cifra
    // (ex.: ")] [G#7] [C#m7]") — não são títulos de música.
    const hasBracketChord = /\[[A-G][#b]?[^\]]*\]/.test(firstLine);
    const isChordSoup = /^[)\]}\s]+\s*\[[A-G]/.test(firstLine);
    if (hasBracketChord || isChordSoup || isChordLine(firstLine)) {
      // pula — linha de acordes solta, tenta a próxima linha significativa
      // (ignora também headers de seção como [Intro], [Primeira Parte])
      const nextLine = lines.find(
        (l) =>
          !isChordLine(l) &&
          !/\[[A-G][#b]?[^\]]*\]/.test(l) &&
          !/^\[[^\]]*\]$/.test(l.trim()) &&
          l.length > 2
      );
      if (nextLine) {
        title = nextLine.replace(/^["']|["']$/g, '').trim();
      }
    } else if (/[-–—]/.test(firstLine)) {
      const parts = firstLine.split(/[-–—]/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        artist = parts[0];
        title = parts.slice(1).join(' - ');
      } else {
        title = firstLine;
      }
    } else if (!isChordLine(firstLine) && !/^\[/.test(firstLine)) {
      title = firstLine;
      if (!artist && lines.length > 1 && !isChordLine(lines[1]) && !/^\[/.test(lines[1]) && !/^(tom|capo|afinação|bpm|intro)/i.test(lines[1])) {
        if (lines[1].length < 60) {
          artist = lines[1];
        }
      }
    }
  }

  if (!title && cleanFallback) {
    title = cleanFallback;
  }
  if (!title) {
    title = 'Nova Música';
  }
  if (!artist) {
    artist = 'Artista Desconhecido';
  }

  return {
    title,
    artist,
    suggestedKey,
    difficulty,
  };
}

import { generateSongSeo } from './seoUtils.js';
import { findChord } from '../data/chords';
import type { ChordDefinition } from '../types';

export interface SongSeoOutput {
  seoDescription: string;
  hashtags: string[];
  tags: string[];
}

export function generateSongSeoAndHashtags(
  title: string,
  artist: string,
  songKey: string = 'C',
  difficulty: string = 'Iniciante',
  detectedChords: string[] = [],
  strummingPattern?: string,
  category?: string
): SongSeoOutput {
  const result = generateSongSeo({
    title,
    artist,
    key: songKey,
    difficulty,
    chords: detectedChords,
    strummingPattern,
    category,
  });

  return {
    seoDescription: result.seoDescription,
    hashtags: result.hashtags,
    tags: result.tags,
  };
}

/* ════════════════════════════════════════════════════════════════════
 * RESOLUÇÃO DE ACORDES PELA TEORIA MUSICAL
 *
 * Quando um acorde importado não existe no dicionário (ex.: "D7(9)",
 * "Bb7M(9)", "Am7M", "F#9-/7"), procuramos a representação mais fiel
 * que EXISTE no dicionário, reduzindo as extensões/tensões pela teoria
 * musical. Assim nunca apresentamos notas inexistentes ao usuário.
 * ════════════════════════════════════════════════════════════════════ */

/** Resultado da resolução de um acorde contra o dicionário. */
export interface ChordResolution {
  /** Nome original (como veio da cifra). */
  original: string;
  /** Nome que existe no dicionário (o que deve ser exibido/tocado). */
  resolved: string;
  /** Definição completa (diagrama) do acorde resolvido. */
  def: ChordDefinition;
  /** Se houve simplificação pela teoria musical (não é o nome exato). */
  simplified: boolean;
  /** Se o diagrama foi GERADO pelo motor de voicings (acorde que não existia). */
  generated?: boolean;
  /** Explicação musical em português (quando simplified/generated). */
  reason?: string;
}

// Tabela de simplificação de QUALIDADES por teoria musical, da mais
// específica para a mais simples. Cada linha: regex da qualidade e a
// ordem de candidatos (o primeiro que existir no dicionário vence).
const QUALITY_LADDER: Array<{ test: RegExp; candidates: string[] }> = [
  // Menor com 7ª maior (m7M / mMaj7): rara no ukulele → tríade menor
  { test: /^m(aj)?7m$/i, candidates: ['m', 'maj7', ''] },
  { test: /^maj7m$/i, candidates: ['m', 'maj7', ''] },
  // Nona maior (maj9) → 7ª maior ou nona adicionada
  { test: /^maj9$/i, candidates: ['maj7', 'add9', ''] },
  // Nonas/menores extensões de acordes menores
  { test: /^m9$/i, candidates: ['m7', 'm'] },
  { test: /^m11$/i, candidates: ['m7', 'm'] },
  { test: /^m13$/i, candidates: ['m7', 'm6', 'm'] },
  // Nona adicionada (9 → add9; se não existir, 7ª dominante ou tríade)
  { test: /^9$/i, candidates: ['add9', '7', ''] },
  // Nona menor (9- / b9): dominante com nona bemol → 7ª dominante
  { test: /^(9-|b9)$/i, candidates: ['7', ''] },
  // 11ª → 4ª suspensa (mesma nota) ou dominante
  { test: /^11$/i, candidates: ['sus4', '7', ''] },
  // 13ª → 6ª (mesma nota, oitava abaixo) ou dominante
  { test: /^13$/i, candidates: ['6', '7', ''] },
  // Dominante com tensões alteradas → 7ª simples
  {
    test: /^7(b9|#9|b5|#5|b13|#11|sus4|sus)$/i,
    candidates: ['7', 'sus4', ''],
  },
  // 6/9 → sexta
  { test: /^6\/9$/i, candidates: ['6', ''] },
  // 11ª adicionada → suspensa (a 11ª substitui a 3ª)
  { test: /^add11$/i, candidates: ['sus4', ''] },
  // Aumentado (+ / aug / #5): não existe → tríade maior (1-3-5, a mais próxima)
  { test: /^(aug|aug5|\+|\+5|#5)$/i, candidates: ['', 'maj7', '7'] },
  // Power chord (5): sem 3ª → tríade maior
  { test: /^5$/i, candidates: ['', '7'] },
  // Suspensas
  { test: /^sus2$/i, candidates: ['sus2', ''] },
  { test: /^sus4$/i, candidates: ['sus4', ''] },
  { test: /^add9$/i, candidates: ['add9', ''] },
  // Meio-diminuta
  { test: /^m7b5$/i, candidates: ['m7b5', 'm7', 'm'] },
  // Diminuta
  { test: /^dim$/i, candidates: ['dim', 'm7b5', ''] },
  // Menor com sexta
  { test: /^m6$/i, candidates: ['m6', 'm'] },
  // Sexta
  { test: /^6$/i, candidates: ['6', ''] },
  // 7ª maior
  { test: /^maj7$/i, candidates: ['maj7', ''] },
  // Menor com sétima
  { test: /^m7$/i, candidates: ['m7', 'm'] },
  // Sétima dominante
  { test: /^7$/i, candidates: ['7', ''] },
  // Menor
  { test: /^m$/i, candidates: ['m'] },
  // Tríade maior (fallback universal — todas as 12 raízes existem)
  { test: /^$/i, candidates: [''] },
];

/**
 * Gera a ordem de candidatos de QUALIDADE (ex.: 'maj7', 'add9', '') a partir
 * de uma qualidade crua (ex.: 'maj9', '7(9)', 'm7M'), pela teoria musical.
 */
function qualityCandidates(rawQuality: string): string[] {
  // Remove extensões entre parênteses: "7(9)" → "7", "maj7(9)" → "maj7"
  let q = (rawQuality || '').replace(/\([^)]*\)/g, '').trim();

  // Notação brasileira comum: 7M/7+/M7 → maj7; dim7/° → dim; Ø → m7b5
  q = q
    .replace(/^(7M|7\+|M7|7m)$/i, 'maj7')
    .replace(/^(dim7|°|°7)$/i, 'dim')
    .replace(/^Ø$/i, 'm7b5');

  // Barra com baixo não-nota (ex.: "F#9-/7" = F#7(b9)): usa a parte antes da /
  if (q.includes('/')) q = q.split('/')[0].trim();
  if (q.includes('(')) q = q.split('(')[0].trim();

  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (...names: string[]) => {
    for (const n of names) {
      if (!seen.has(n)) {
        seen.add(n);
        candidates.push(n);
      }
    }
  };

  // Tenta a própria qualidade limpa primeiro (ex.: "maj7", "7")
  push(q);

  for (const { test, candidates: cands } of QUALITY_LADDER) {
    if (test.test(q)) {
      push(...cands);
      break;
    }
  }

  // Fallback absoluto: tríade maior
  push('');
  return candidates;
}

/**
 * Resolve um nome de acorde para a representação MAIS FIEL que existe no
 * dicionário, usando teoria musical para simplificar extensões inexistentes.
 *
 * Ordem:
 *  1. Nome exato (findChord já normaliza sustenidos/bemóis e 7M→maj7)
 *  2. Baixo invertido (G/B → G)
 *  3. Ladder de teoria musical (C13 → C6 → C7 → C; D7(9) → D7; Am7M → Am)
 *
 * NUNCA retorna um acorde que não exista no dicionário: no pior caso cai na
 * tríade da raiz (todas as 12 raízes maiores/menores existem).
 */
export function resolveChordWithTheory(chordName: string): ChordResolution | undefined {
  if (!chordName) return undefined;
  const clean = chordName.trim();

  // 1. Tenta o nome exato (findChord também resolve Bb→A#, 7M→maj7, e agora
  //    GERA acordes inexistentes pelo motor de voicings — D7(9), Am7M, etc.)
  const direct = findChord(clean);
  if (direct) {
    if (direct.generated) {
      return {
        original: clean,
        resolved: direct.name,
        def: direct,
        simplified: false,
        generated: true,
        reason: `acorde gerado pelo UkeMaster — toque ${direct.name}`,
      };
    }
    return { original: clean, resolved: direct.name, def: direct, simplified: false };
  }

  // 2. Baixo invertido (slash chord): G/B → G
  const { base, bass } = splitSlashChord(clean);
  if (bass && base !== clean) {
    const baseRes = resolveChordWithTheory(base);
    if (baseRes) {
      return {
        ...baseRes,
        original: clean,
        simplified: true,
        reason: `baixo invertido (${bass}) — toque ${baseRes.resolved}`,
      };
    }
  }

  // 3. Ladder de teoria musical
  const rootMatch = clean.match(/^([A-G][#b]?)(.*)$/);
  if (!rootMatch) return undefined;
  const root = rootMatch[1];
  const rawQuality = rootMatch[2];

  for (const quality of qualityCandidates(rawQuality)) {
    const name = root + quality;
    const def = findChord(name);
    if (def) {
      const simplified = name !== clean && name.toLowerCase() !== (root + rawQuality).toLowerCase();
      let reason: string | undefined;
      if (simplified) {
        const hadExtension = /\([^)]*\)/.test(rawQuality) || /\d+/.test(rawQuality.replace(/^(7|maj7|m7|m|6|m6|sus2|sus4|add9|dim|m7b5)$/, ''));
        reason = hadExtension
          ? `extensão simplificada — toque ${name}`
          : `versão mais simples no dicionário — toque ${name}`;
      }
      return { original: clean, resolved: def.name, def, simplified, reason };
    }
  }

  return undefined;
}

/**
 * Sanitiza o conteúdo ChordPro de uma cifra: substitui todo acorde que não
 * exista no dicionário pela versão resolvida pela teoria musical, para nunca
 * apresentar notas inexistentes. Retorna o conteúdo limpo + a lista de
 * substituições feitas (para exibir um aviso ao usuário).
 */
export function sanitizeChordProContent(content: string): {
  content: string;
  substitutions: { from: string; to: string; reason?: string }[];
} {
  if (!content) return { content: '', substitutions: [] };
  const substitutions: { from: string; to: string; reason?: string }[] = [];
  const seen = new Set<string>();

  const newContent = content.replace(/\[([^\]]+)\]/g, (match, raw) => {
    const chord = String(raw).trim();
    // Ignora cabeçalhos de seção ([Intro], [Refrão]...) — não são acordes
    if (/^(Intro|Verso|Refrão|Ponte|Outro|Solo|Final|Chorus|Verse|Bridge)/i.test(chord)) {
      return match;
    }
    const res = resolveChordWithTheory(chord);
    if (!res) return match;
    if (res.simplified && res.resolved !== chord) {
      const key = `${chord}→${res.resolved}`;
      if (!seen.has(key)) {
        seen.add(key);
        substitutions.push({ from: chord, to: res.resolved, reason: res.reason });
      }
      return `[${res.resolved}]`;
    }
    return match;
  });

  return { content: newContent, substitutions };
}

/* ════════════════════════════════════════════════════════════════════
 * VERSÕES SIMPLIFICADAS DE CIFRAS (Simples / Média / Profissional)
 *
 * Toda música difícil (acordes com extensões 9/11/13, 7M, m7b5, baixos
 * invertidos...) recebe automaticamente versões SIMPLES e MÉDIA pela
 * teoria musical. A versão PROFISSIONAL é a original. Assim qualquer
 * iniciante consegue tocar, e o app deixa explícito quando a cifra foi
 * adaptada.
 * ════════════════════════════════════════════════════════════════════ */

export type SimplificationLevel = 'simple' | 'medium';

// Qualidades que a versão MÉDIA mantém (fáceis e comuns no ukulele)
const MEDIUM_KEEP = [
  '', // tríade maior
  'm',
  '7',
  'm7',
  'maj7',
  '6',
  'm6',
  'sus2',
  'sus4',
  'add9',
  'dim',
];

/**
 * Simplifica UM acorde para o nível pedido, pela teoria musical.
 *  - simple: tríade pura (maior/menor) — sempre existe no dicionário e é
 *    o conjunto mais fácil do ukulele (0–3 dedos, sem pestana na maioria).
 *  - medium: mantém a família de sétima/suspensa (7, m7, maj7, sus...),
 *    removendo apenas extensões exóticas (9/11/13/b9/#9) e baixos
 *    invertidos.
 * A versão PROFISSIONAL é o próprio acorde original.
 */
export function simplifyChordName(
  chordName: string,
  level: SimplificationLevel
): string {
  if (!chordName) return chordName;
  const clean = chordName.trim();

  // Baixo invertido (G/B, Dm/C): a simplificação toca a base
  const { base } = splitSlashChord(clean);
  const rootMatch = base.match(/^([A-G][#b]?)(.*)$/);
  if (!rootMatch) return clean;
  const root = rootMatch[1];
  // Remove extensões entre parênteses para analisar a qualidade base
  let q = rootMatch[2].replace(/\([^)]*\)/g, '').trim();
  // Notação brasileira: 7M/7m(maior)/7+ → maj7; M7 → maj7 (CASE-SENSITIVE,
  // pois com flag /i "M7" casaria "m7" — menor com 7ª, que é outro acorde);
  // dim7/° → dim; Ø → m7b5.
  q = q
    .replace(/^(7M|7m|7\+)$/i, 'maj7')
    .replace(/^M7$/, 'maj7')
    .replace(/^(dim7|°)$/i, 'dim')
    .replace(/^Ø$/i, 'm7b5');
  // Artefato de slash residual (F#9-/7 → F#9-)
  q = q.replace(/\/[A-G][#b]?$/, '');

  const isMinor = /^m/i.test(q); // m, m7, m6, m9, mMaj7, m7b5...

  if (level === 'simple') {
    // Tríade pura — a versão mais fácil possível
    return root + (isMinor ? 'm' : '');
  }

  // ── Média: mantém a família de sétima, simplifica extensões ────────
  // Já é uma qualidade mantida?
  if (MEDIUM_KEEP.includes(q)) return root + q;
  if (/^(m7b5|7sus4|7sus)$/.test(q)) return root + (q === 'm7b5' ? 'm7' : '7');
  // Extensões de sétima dominante → 7
  if (/^(9|11|13|7b9|7#9|7b5|7#5)$/.test(q)) return root + '7';
  // Extensões maiores → maj7
  if (/^(maj9|maj11|maj13)$/.test(q)) return root + 'maj7';
  // Extensões menores → m7
  if (/^(m9|m11|m13)$/.test(q)) return root + 'm7';
  // Menor com 7ª maior → m7 (a 7M é exótica no ukulele)
  if (/^m(aj)?7m$|^mM7$/i.test(q)) return root + 'm7';
  // 6/9 → 6
  if (/^6\/9$/.test(q)) return root + '6';
  // 5 (power chord) → tríade maior
  if (/^5$/.test(q)) return root;
  // Aumentado → tríade maior (1-3-#5 → 1-3-5)
  if (/^(aug|\+|aug5|\+5|#5)$/i.test(q)) return root;
  // Diminuta → tríade menor (1-b3-b5 → 1-b3-5)
  if (/^dim$/.test(q)) return root + 'm';
  // Qualquer coisa não reconhecida → tríade da família
  return root + (isMinor ? 'm' : '');
}

/**
 * Gera a cifra inteira no nível pedido (simple/medium), substituindo cada
 * acorde pelo simplificado. Cabeçalhos de seção ([Intro], [Refrão]...) e
 * tablaturas são preservados. Se nada mudar, retorna o conteúdo original.
 */
export function generateSimplifiedContent(
  content: string,
  level: SimplificationLevel
): string {
  if (!content) return content;
  let changed = false;
  const next = content.replace(/\[([^\]]+)\]/g, (match, raw) => {
    const chord = String(raw).trim();
    if (/^(Intro|Verso|Refrão|Ponte|Outro|Solo|Final|Chorus|Verse|Bridge)/i.test(chord)) {
      return match;
    }
    const simple = simplifyChordName(chord, level);
    if (simple === chord) return match;
    changed = true;
    return `[${simple}]`;
  });
  return changed ? next : content;
}

/**
 * Detecta se uma cifra é "difícil" (precisa de versões simplificadas):
 * existe acorde que muda ao simplificar para o nível médio (extensões
 * 9/11/13, 7M, m7b5, baixos invertidos, aumentado...) OU algum acorde
 * precisou ser GERADO pelo motor (não estava no dicionário estático).
 */
export function isHardSong(content: string): boolean {
  if (!content) return false;
  const chords = extractUniqueChords(content);
  if (chords.length === 0) return false;
  for (const chord of chords) {
    const medium = simplifyChordName(chord, 'medium');
    if (medium !== chord) return true;
    const res = resolveChordWithTheory(chord);
    if (res?.generated) return true;
  }
  return false;
}

/**
 * Tests if a string line is part of a tablature block (e.g. A|--0--2--| or {sot})
 */
export function isTabLine(line: string): boolean {
  if (!line) return false;
  const trimmed = line.trim();
  if (/^(\{sot\}|\{eot\}|\[tab\]|\[\/tab\])$/i.test(trimmed)) return true;
  if (/^[a-g1-6][|:][\d\-xphv\/\\sbt~| ]{3,}$/i.test(trimmed)) return true;
  if (/^\|[\d\-xphv\/\\sbt~| ]{4,}\|$/i.test(trimmed)) return true;
  return false;
}

/**
 * Standardizes and formats tablature blocks in raw text, wrapping them in {sot} and {eot}
 */
export function formatAndCleanTabs(rawText: string): string {
  if (!rawText) return '';
  const lines = rawText.split(/\r?\n/);
  const result: string[] = [];
  let inTabBlock = false;
  let currentTabGroup: string[] = [];

  const flushTabGroup = () => {
    if (currentTabGroup.length > 0) {
      if (!inTabBlock) {
        result.push('{sot}');
        result.push(...currentTabGroup);
        result.push('{eot}');
      } else {
        result.push(...currentTabGroup);
      }
      currentTabGroup = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^(\{sot\}|\[tab\])$/i.test(trimmed)) {
      flushTabGroup();
      inTabBlock = true;
      result.push('{sot}');
      continue;
    }

    if (/^(\{eot\}|\[\/tab\])$/i.test(trimmed)) {
      flushTabGroup();
      inTabBlock = false;
      result.push('{eot}');
      continue;
    }

    if (isTabLine(line)) {
      currentTabGroup.push(line);
    } else {
      flushTabGroup();
      result.push(line);
    }
  }

  flushTabGroup();
  return result.join('\n');
}

export interface UkuleleTabStep {
  A?: string;
  E?: string;
  C?: string;
  G?: string;
}

/**
 * Generates a clean 4-string Ukulele ChordPro Tablature block from a series of steps
 */
export function generateUkuleleTabBlock(steps: UkuleleTabStep[], title: string = 'Tablatura'): string {
  if (!steps || steps.length === 0) {
    steps = [
      { A: '0', E: '0', C: '0', G: '0' },
      { A: '2', E: '1', C: '0', G: '0' },
      { A: '3', E: '0', C: '0', G: '2' },
    ];
  }

  let lineA = 'A|';
  let lineE = 'E|';
  let lineC = 'C|';
  let lineG = 'G|';

  for (const step of steps) {
    const aVal = step.A !== undefined && step.A !== '' ? step.A : '-';
    const eVal = step.E !== undefined && step.E !== '' ? step.E : '-';
    const cVal = step.C !== undefined && step.C !== '' ? step.C : '-';
    const gVal = step.G !== undefined && step.G !== '' ? step.G : '-';

    // Format with equal padding
    const maxLen = Math.max(aVal.length, eVal.length, cVal.length, gVal.length, 1);

    lineA += `--${aVal.padEnd(maxLen, '-')}`;
    lineE += `--${eVal.padEnd(maxLen, '-')}`;
    lineC += `--${cVal.padEnd(maxLen, '-')}`;
    lineG += `--${gVal.padEnd(maxLen, '-')}`;
  }

  lineA += '--|';
  lineE += '--|';
  lineC += '--|';
  lineG += '--|';

  return `{sot}\n# ${title}\n${lineA}\n${lineE}\n${lineC}\n${lineG}\n{eot}`;
}
export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Checks if a song with the given title and artist already exists in a list of songs
 */
export function findDuplicateSong<T extends { title: string; artist: string }>(
  songTitle: string,
  songArtist: string,
  songsList: T[] = []
): T | undefined {
  if (!songTitle.trim() || !songsList || songsList.length === 0) return undefined;

  const targetTitle = normalizeString(songTitle);
  const targetArtist = normalizeString(songArtist);

  return songsList.find((s) => {
    const sTitle = normalizeString(s.title);
    const sArtist = normalizeString(s.artist);

    // Exact title + artist match
    if (sTitle === targetTitle && sArtist === targetArtist) return true;

    // Title match and one artist is default/desconhecido or empty
    if (
      sTitle === targetTitle &&
      (targetArtist.includes('artistadesconhecido') ||
        sArtist.includes('artistadesconhecido') ||
        !targetArtist ||
        !sArtist)
    ) {
      return true;
    }

    return false;
  });
}


