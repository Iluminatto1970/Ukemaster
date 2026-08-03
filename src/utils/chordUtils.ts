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
    if (/[-–—]/.test(firstLine)) {
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

import { generateSongSeo } from './seoUtils';

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
  strummingPattern?: string
): SongSeoOutput {
  const result = generateSongSeo({
    title,
    artist,
    key: songKey,
    difficulty,
    chords: detectedChords,
    strummingPattern,
  });

  return {
    seoDescription: result.seoDescription,
    hashtags: result.hashtags,
    tags: result.tags,
  };
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


