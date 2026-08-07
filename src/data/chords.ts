/**
 * Dicionário de acordes de ukulele: digitações (posições) para o diagrama SVG, organizadas por nota e tipo.
 */
import type { ChordDefinition } from '../types.js';
import { getOrGenerateChord } from '../utils/chordGenerator.js';

export const ALL_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const ALL_QUALITIES = [
  { id: 'Maior', label: 'Maior (M)' },
  { id: 'Menor', label: 'Menor (m)' },
  { id: '7', label: 'Sétima (7)' },
  { id: 'm7', label: 'Menor com 7ª (m7)' },
  { id: 'maj7', label: '7ª Maior (maj7 / 7M)' },
  { id: '6', label: 'Sexta (6)' },
  { id: 'm6', label: 'Menor com 6ª (m6)' },
  { id: 'sus4', label: 'Suspensa 4 (sus4)' },
  { id: 'sus2', label: 'Suspensa 2 (sus2)' },
  { id: 'add9', label: 'Nona / Adicionada 9ª (add9 / 9)' },
  { id: 'dim', label: 'Diminuta (dim / °)' },
  { id: 'm7b5', label: 'Meio-Diminuta (m7b5 / Ø)' },
];

export const CHORD_DATABASE: ChordDefinition[] = [
  // ================= C CHORDS =================
  {
    id: 'C',
    name: 'C',
    key: 'C',
    quality: 'Maior',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] },
      { frets: [5, 4, 3, 3], fingers: [3, 2, 1, 1], barreFret: 3 },
    ],
  },
  {
    id: 'Cm',
    name: 'Cm',
    key: 'C',
    quality: 'Menor',
    difficulty: 'médio',
    fingerings: [
      { frets: [0, 3, 3, 3], fingers: [0, 1, 2, 3] },
      { frets: [5, 3, 3, 3], fingers: [3, 1, 1, 1], barreFret: 3 },
    ],
  },
  {
    id: 'C7',
    name: 'C7',
    key: 'C',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 0, 1], fingers: [0, 0, 0, 1] },
      { frets: [3, 4, 3, 3], fingers: [1, 2, 1, 1], barreFret: 3 },
    ],
  },
  {
    id: 'Cmaj7',
    name: 'Cmaj7',
    key: 'C',
    quality: 'maj7',
    difficulty: 'fácil',
    aliases: ['C7M', 'C7m', 'CM7', 'C7+'],
    fingerings: [
      { frets: [0, 0, 0, 2], fingers: [0, 0, 0, 2] },
      { frets: [5, 4, 3, 2], fingers: [4, 3, 2, 1] },
    ],
  },
  {
    id: 'Cm7',
    name: 'Cm7',
    key: 'C',
    quality: 'm7',
    difficulty: 'médio',
    fingerings: [
      { frets: [3, 3, 3, 3], fingers: [1, 1, 1, 1], barreFret: 3 },
    ],
  },
  {
    id: 'C6',
    name: 'C6',
    key: 'C',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0] },
    ],
  },
  {
    id: 'Cm6',
    name: 'Cm6',
    key: 'C',
    quality: 'm6',
    difficulty: 'médio',
    fingerings: [
      { frets: [0, 3, 3, 0], fingers: [0, 1, 2, 0] },
    ],
  },
  {
    id: 'Csus4',
    name: 'Csus4',
    key: 'C',
    quality: 'sus4',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 1, 3], fingers: [0, 0, 1, 3] },
    ],
  },
  {
    id: 'Csus2',
    name: 'Csus2',
    key: 'C',
    quality: 'sus2',
    difficulty: 'médio',
    fingerings: [
      { frets: [0, 2, 3, 3], fingers: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'Cadd9',
    name: 'Cadd9',
    key: 'C',
    quality: 'add9',
    difficulty: 'fácil',
    aliases: ['C9'],
    fingerings: [
      { frets: [0, 2, 0, 3], fingers: [0, 1, 0, 3] },
    ],
  },
  {
    id: 'Cdim',
    name: 'Cdim',
    key: 'C',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['C°', 'Cdim7'],
    fingerings: [
      { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Cm7b5',
    name: 'Cm7b5',
    key: 'C',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['CØ'],
    fingerings: [
      { frets: [3, 3, 2, 3], fingers: [2, 3, 1, 4] },
    ],
  },

  // ================= C# / Db CHORDS =================
  {
    id: 'C#',
    name: 'C#',
    key: 'C#',
    quality: 'Maior',
    difficulty: 'médio',
    aliases: ['Db'],
    fingerings: [
      { frets: [1, 1, 1, 4], fingers: [1, 1, 1, 4], barreFret: 1 },
      { frets: [6, 5, 4, 4], fingers: [3, 2, 1, 1], barreFret: 4 },
    ],
  },
  {
    id: 'C#m',
    name: 'C#m',
    key: 'C#',
    quality: 'Menor',
    difficulty: 'médio',
    aliases: ['Dbm'],
    fingerings: [
      { frets: [1, 4, 4, 4], fingers: [1, 2, 3, 4] },
      { frets: [6, 4, 4, 4], fingers: [3, 1, 1, 1], barreFret: 4 },
    ],
  },
  {
    id: 'C#7',
    name: 'C#7',
    key: 'C#',
    quality: '7',
    difficulty: 'médio',
    aliases: ['Db7'],
    fingerings: [
      { frets: [1, 1, 1, 2], fingers: [1, 1, 1, 2], barreFret: 1 },
    ],
  },
  {
    id: 'C#maj7',
    name: 'C#maj7',
    key: 'C#',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['C#7M', 'C#7m', 'Db7M', 'Dbmaj7'],
    fingerings: [
      { frets: [1, 1, 1, 3], fingers: [1, 1, 1, 3], barreFret: 1 },
    ],
  },
  {
    id: 'C#m7',
    name: 'C#m7',
    key: 'C#',
    quality: 'm7',
    difficulty: 'médio',
    aliases: ['Dbm7'],
    fingerings: [
      { frets: [4, 4, 4, 4], fingers: [1, 1, 1, 1], barreFret: 4 },
    ],
  },

  // ================= D CHORDS =================
  {
    id: 'D',
    name: 'D',
    key: 'D',
    quality: 'Maior',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 2, 0], fingers: [1, 2, 3, 0] },
      { frets: [2, 2, 2, 5], fingers: [1, 1, 1, 4], barreFret: 2 },
    ],
  },
  {
    id: 'Dm',
    name: 'Dm',
    key: 'D',
    quality: 'Menor',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0] },
    ],
  },
  {
    id: 'D7',
    name: 'D7',
    key: 'D',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 2, 3], fingers: [1, 1, 1, 2], barreFret: 2 },
      { frets: [2, 0, 2, 0], fingers: [1, 0, 2, 0] },
    ],
  },
  {
    id: 'Dmaj7',
    name: 'Dmaj7',
    key: 'D',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['D7M', 'D7m', 'DM7', 'D7+'],
    fingerings: [
      { frets: [2, 2, 2, 4], fingers: [1, 1, 1, 3], barreFret: 2 },
    ],
  },
  {
    id: 'Dm7',
    name: 'Dm7',
    key: 'D',
    quality: 'm7',
    difficulty: 'médio',
    fingerings: [
      { frets: [2, 2, 1, 3], fingers: [2, 3, 1, 4] },
      { frets: [2, 2, 1, 1], fingers: [2, 3, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'D6',
    name: 'D6',
    key: 'D',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 2, 2], fingers: [1, 1, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Dm6',
    name: 'Dm6',
    key: 'D',
    quality: 'm6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4] },
    ],
  },
  {
    id: 'Dsus4',
    name: 'Dsus4',
    key: 'D',
    quality: 'sus4',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 3, 0], fingers: [1, 2, 3, 0] },
    ],
  },
  {
    id: 'Dsus2',
    name: 'Dsus2',
    key: 'D',
    quality: 'sus2',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0] },
    ],
  },
  {
    id: 'Dadd9',
    name: 'Dadd9',
    key: 'D',
    quality: 'add9',
    difficulty: 'médio',
    aliases: ['D9'],
    fingerings: [
      { frets: [2, 4, 2, 0], fingers: [1, 3, 2, 0] },
    ],
  },
  {
    id: 'Ddim',
    name: 'Ddim',
    key: 'D',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['D°', 'Ddim7'],
    fingerings: [
      { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Dm7b5',
    name: 'Dm7b5',
    key: 'D',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['DØ'],
    fingerings: [
      { frets: [1, 2, 1, 3], fingers: [1, 3, 2, 4] },
    ],
  },

  // ================= D# / Eb CHORDS =================
  {
    id: 'D#',
    name: 'D#',
    key: 'D#',
    quality: 'Maior',
    difficulty: 'médio',
    aliases: ['Eb'],
    fingerings: [
      { frets: [3, 3, 3, 1], fingers: [2, 3, 4, 1] },
      { frets: [0, 3, 3, 1], fingers: [0, 2, 3, 1] },
    ],
  },
  {
    id: 'D#m',
    name: 'D#m',
    key: 'D#',
    quality: 'Menor',
    difficulty: 'médio',
    aliases: ['Ebm'],
    fingerings: [
      { frets: [3, 3, 2, 1], fingers: [3, 4, 2, 1] },
    ],
  },
  {
    id: 'D#7',
    name: 'D#7',
    key: 'D#',
    quality: '7',
    difficulty: 'médio',
    aliases: ['Eb7'],
    fingerings: [
      { frets: [3, 3, 3, 4], fingers: [1, 1, 1, 2], barreFret: 3 },
      { frets: [0, 1, 3, 1], fingers: [0, 1, 3, 2] },
    ],
  },
  {
    id: 'D#maj7',
    name: 'D#maj7',
    key: 'D#',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['D#7M', 'D#7m', 'Eb7M', 'Ebmaj7'],
    fingerings: [
      { frets: [3, 3, 3, 5], fingers: [1, 1, 1, 3], barreFret: 3 },
    ],
  },
  {
    id: 'D#m7',
    name: 'D#m7',
    key: 'D#',
    quality: 'm7',
    difficulty: 'médio',
    aliases: ['Ebm7'],
    fingerings: [
      { frets: [3, 3, 2, 4], fingers: [2, 3, 1, 4] },
    ],
  },

  // ================= E CHORDS =================
  {
    id: 'E',
    name: 'E',
    key: 'E',
    quality: 'Maior',
    difficulty: 'médio',
    fingerings: [
      { frets: [4, 4, 4, 2], fingers: [2, 3, 4, 1] },
      { frets: [1, 4, 0, 2], fingers: [1, 4, 0, 2] },
    ],
  },
  {
    id: 'Em',
    name: 'Em',
    key: 'E',
    quality: 'Menor',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 4, 3, 2], fingers: [0, 3, 2, 1] },
    ],
  },
  {
    id: 'E7',
    name: 'E7',
    key: 'E',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [1, 2, 0, 2], fingers: [1, 2, 0, 3] },
    ],
  },
  {
    id: 'Emaj7',
    name: 'Emaj7',
    key: 'E',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['E7M', 'E7m', 'EM7', 'E7+'],
    fingerings: [
      { frets: [1, 3, 0, 2], fingers: [1, 4, 0, 2] },
    ],
  },
  {
    id: 'Em7',
    name: 'Em7',
    key: 'E',
    quality: 'm7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2] },
    ],
  },
  {
    id: 'E6',
    name: 'E6',
    key: 'E',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [1, 1, 0, 2], fingers: [1, 2, 0, 3] },
    ],
  },
  {
    id: 'Em6',
    name: 'Em6',
    key: 'E',
    quality: 'm6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 1, 0, 2], fingers: [0, 1, 0, 2] },
    ],
  },
  {
    id: 'Esus4',
    name: 'Esus4',
    key: 'E',
    quality: 'sus4',
    difficulty: 'médio',
    fingerings: [
      { frets: [2, 4, 0, 2], fingers: [2, 4, 0, 3] },
    ],
  },
  {
    id: 'Eadd9',
    name: 'Eadd9',
    key: 'E',
    quality: 'add9',
    difficulty: 'médio',
    aliases: ['E9'],
    fingerings: [
      { frets: [4, 4, 2, 2], fingers: [3, 4, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Edim',
    name: 'Edim',
    key: 'E',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['E°', 'Edim7'],
    fingerings: [
      { frets: [3, 4, 3, 4], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Em7b5',
    name: 'Em7b5',
    key: 'E',
    quality: 'm7b5',
    difficulty: 'fácil',
    aliases: ['EØ'],
    fingerings: [
      { frets: [0, 2, 0, 1], fingers: [0, 2, 0, 1] },
    ],
  },

  // ================= F CHORDS =================
  {
    id: 'F',
    name: 'F',
    key: 'F',
    quality: 'Maior',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0] },
      { frets: [5, 5, 5, 3], fingers: [2, 3, 4, 1] },
    ],
  },
  {
    id: 'Fm',
    name: 'Fm',
    key: 'F',
    quality: 'Menor',
    difficulty: 'médio',
    fingerings: [
      { frets: [1, 0, 1, 3], fingers: [1, 0, 2, 4] },
    ],
  },
  {
    id: 'F7',
    name: 'F7',
    key: 'F',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 3, 1, 0], fingers: [2, 3, 1, 0] },
      { frets: [2, 3, 1, 3], fingers: [2, 3, 1, 4] },
    ],
  },
  {
    id: 'Fmaj7',
    name: 'Fmaj7',
    key: 'F',
    quality: 'maj7',
    difficulty: 'fácil',
    aliases: ['F7M', 'F7m', 'FM7', 'F7+'],
    fingerings: [
      { frets: [2, 4, 1, 0], fingers: [2, 4, 1, 0] },
      { frets: [5, 5, 0, 0], fingers: [1, 2, 0, 0] },
    ],
  },
  {
    id: 'Fm7',
    name: 'Fm7',
    key: 'F',
    quality: 'm7',
    difficulty: 'médio',
    fingerings: [
      { frets: [1, 3, 1, 3], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'F6',
    name: 'F6',
    key: 'F',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 1, 0], fingers: [2, 3, 1, 0] },
    ],
  },
  {
    id: 'Fm6',
    name: 'Fm6',
    key: 'F',
    quality: 'm6',
    difficulty: 'médio',
    fingerings: [
      { frets: [1, 2, 1, 3], fingers: [1, 2, 1, 4] },
    ],
  },
  {
    id: 'Fsus4',
    name: 'Fsus4',
    key: 'F',
    quality: 'sus4',
    difficulty: 'médio',
    fingerings: [
      { frets: [3, 0, 1, 1], fingers: [3, 0, 1, 1] },
    ],
  },
  {
    id: 'Fsus2',
    name: 'Fsus2',
    key: 'F',
    quality: 'sus2',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 1, 3], fingers: [0, 0, 1, 3] },
    ],
  },
  {
    id: 'Fadd9',
    name: 'Fadd9',
    key: 'F',
    quality: 'add9',
    difficulty: 'fácil',
    aliases: ['F9'],
    fingerings: [
      { frets: [0, 0, 1, 0], fingers: [0, 0, 1, 0] },
    ],
  },
  {
    id: 'Fdim',
    name: 'Fdim',
    key: 'F',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['F°', 'Fdim7'],
    fingerings: [
      { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Fm7b5',
    name: 'Fm7b5',
    key: 'F',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['FØ'],
    fingerings: [
      { frets: [1, 3, 1, 2], fingers: [1, 3, 1, 2] },
    ],
  },

  // ================= F# / Gb CHORDS =================
  {
    id: 'F#',
    name: 'F#',
    key: 'F#',
    quality: 'Maior',
    difficulty: 'médio',
    aliases: ['Gb'],
    fingerings: [
      { frets: [3, 2, 2, 1], fingers: [4, 2, 3, 1] },
    ],
  },
  {
    id: 'F#m',
    name: 'F#m',
    key: 'F#',
    quality: 'Menor',
    difficulty: 'fácil',
    aliases: ['Gbm'],
    fingerings: [
      { frets: [2, 1, 2, 0], fingers: [2, 1, 3, 0] },
    ],
  },
  {
    id: 'F#7',
    name: 'F#7',
    key: 'F#',
    quality: '7',
    difficulty: 'fácil',
    aliases: ['Gb7'],
    fingerings: [
      { frets: [3, 4, 2, 1], fingers: [3, 4, 2, 1] },
    ],
  },
  {
    id: 'F#maj7',
    name: 'F#maj7',
    key: 'F#',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['F#7M', 'F#7m', 'Gb7M', 'Gbmaj7'],
    fingerings: [
      { frets: [3, 5, 2, 1], fingers: [3, 4, 2, 1] },
    ],
  },
  {
    id: 'F#m7',
    name: 'F#m7',
    key: 'F#',
    quality: 'm7',
    difficulty: 'fácil',
    aliases: ['Gbm7'],
    fingerings: [
      { frets: [2, 4, 2, 0], fingers: [1, 3, 2, 0] },
    ],
  },
  {
    id: 'F#dim',
    name: 'F#dim',
    key: 'F#',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['F#°', 'F#dim7', 'Gbdim'],
    fingerings: [
      { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4] },
    ],
  },

  // ================= G CHORDS =================
  {
    id: 'G',
    name: 'G',
    key: 'G',
    quality: 'Maior',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2] },
      { frets: [4, 2, 3, 2], fingers: [3, 1, 2, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Gm',
    name: 'Gm',
    key: 'G',
    quality: 'Menor',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 3, 1], fingers: [0, 2, 3, 1] },
    ],
  },
  {
    id: 'G7',
    name: 'G7',
    key: 'G',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 1, 2], fingers: [0, 2, 1, 3] },
    ],
  },
  {
    id: 'Gmaj7',
    name: 'Gmaj7',
    key: 'G',
    quality: 'maj7',
    difficulty: 'fácil',
    aliases: ['G7M', 'G7m', 'GM7', 'G7+'],
    fingerings: [
      { frets: [0, 2, 2, 2], fingers: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'Gm7',
    name: 'Gm7',
    key: 'G',
    quality: 'm7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 1, 1], fingers: [0, 2, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'G6',
    name: 'G6',
    key: 'G',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 0, 2], fingers: [0, 1, 0, 2] },
    ],
  },
  {
    id: 'Gm6',
    name: 'Gm6',
    key: 'G',
    quality: 'm6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 0, 1], fingers: [0, 2, 0, 1] },
    ],
  },
  {
    id: 'Gsus4',
    name: 'Gsus4',
    key: 'G',
    quality: 'sus4',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 3, 3], fingers: [0, 1, 2, 3] },
    ],
  },
  {
    id: 'Gsus2',
    name: 'Gsus2',
    key: 'G',
    quality: 'sus2',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 2, 3, 0], fingers: [0, 1, 2, 0] },
    ],
  },
  {
    id: 'Gadd9',
    name: 'Gadd9',
    key: 'G',
    quality: 'add9',
    difficulty: 'fácil',
    aliases: ['G9'],
    fingerings: [
      { frets: [0, 2, 3, 0], fingers: [0, 1, 2, 0] },
      { frets: [2, 2, 3, 2], fingers: [1, 2, 3, 1] },
    ],
  },
  {
    id: 'Gdim',
    name: 'Gdim',
    key: 'G',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['G°', 'Gdim7'],
    fingerings: [
      { frets: [0, 1, 0, 1], fingers: [0, 1, 0, 2] },
      { frets: [3, 4, 3, 4], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Gm7b5',
    name: 'Gm7b5',
    key: 'G',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['GØ'],
    fingerings: [
      { frets: [0, 1, 1, 1], fingers: [0, 1, 1, 1], barreFret: 1 },
    ],
  },

  // ================= G# / Ab CHORDS =================
  {
    id: 'G#',
    name: 'G#',
    key: 'G#',
    quality: 'Maior',
    difficulty: 'médio',
    aliases: ['Ab'],
    fingerings: [
      { frets: [5, 3, 4, 3], fingers: [3, 1, 2, 1], barreFret: 3 },
      { frets: [1, 3, 4, 3], fingers: [1, 2, 4, 3] },
    ],
  },
  {
    id: 'G#m',
    name: 'G#m',
    key: 'G#',
    quality: 'Menor',
    difficulty: 'médio',
    aliases: ['Abm'],
    fingerings: [
      { frets: [1, 3, 4, 2], fingers: [1, 3, 4, 2] },
    ],
  },
  {
    id: 'G#7',
    name: 'G#7',
    key: 'G#',
    quality: '7',
    difficulty: 'médio',
    aliases: ['Ab7'],
    fingerings: [
      { frets: [1, 3, 2, 3], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'G#maj7',
    name: 'G#maj7',
    key: 'G#',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['G#7M', 'G#7m', 'Ab7M', 'Abmaj7'],
    fingerings: [
      { frets: [1, 3, 3, 3], fingers: [1, 2, 3, 4] },
    ],
  },

  // ================= A CHORDS =================
  {
    id: 'A',
    name: 'A',
    key: 'A',
    quality: 'Maior',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 1, 0, 0], fingers: [2, 1, 0, 0] },
      { frets: [6, 4, 5, 4], fingers: [3, 1, 2, 1], barreFret: 4 },
    ],
  },
  {
    id: 'Am',
    name: 'Am',
    key: 'A',
    quality: 'Menor',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] },
    ],
  },
  {
    id: 'A7',
    name: 'A7',
    key: 'A',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 1, 0, 0], fingers: [0, 1, 0, 0] },
    ],
  },
  {
    id: 'Amaj7',
    name: 'Amaj7',
    key: 'A',
    quality: 'maj7',
    difficulty: 'fácil',
    aliases: ['A7M', 'A7m', 'AM7', 'A7+'],
    fingerings: [
      { frets: [1, 1, 0, 0], fingers: [1, 2, 0, 0] },
    ],
  },
  {
    id: 'Am7',
    name: 'Am7',
    key: 'A',
    quality: 'm7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [0, 0, 0, 0], fingers: [0, 0, 0, 0] },
      { frets: [2, 0, 3, 0], fingers: [1, 0, 2, 0] },
    ],
  },
  {
    id: 'A6',
    name: 'A6',
    key: 'A',
    quality: '6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 1, 2, 0], fingers: [2, 1, 3, 0] },
    ],
  },
  {
    id: 'Am6',
    name: 'Am6',
    key: 'A',
    quality: 'm6',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 0, 2, 0], fingers: [1, 0, 2, 0] },
    ],
  },
  {
    id: 'Asus4',
    name: 'Asus4',
    key: 'A',
    quality: 'sus4',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 0, 0], fingers: [1, 2, 0, 0] },
    ],
  },
  {
    id: 'Asus2',
    name: 'Asus2',
    key: 'A',
    quality: 'sus2',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 4, 0, 0], fingers: [1, 3, 0, 0] },
    ],
  },
  {
    id: 'Aadd9',
    name: 'Aadd9',
    key: 'A',
    quality: 'add9',
    difficulty: 'fácil',
    aliases: ['A9'],
    fingerings: [
      { frets: [2, 1, 0, 2], fingers: [2, 1, 0, 3] },
    ],
  },
  {
    id: 'Adim',
    name: 'Adim',
    key: 'A',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['A°', 'Adim7'],
    fingerings: [
      { frets: [2, 3, 2, 3], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Am7b5',
    name: 'Am7b5',
    key: 'A',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['AØ'],
    fingerings: [
      { frets: [2, 3, 3, 3], fingers: [1, 2, 3, 4] },
    ],
  },

  // ================= A# / Bb CHORDS =================
  {
    id: 'A#',
    name: 'A#',
    key: 'A#',
    quality: 'Maior',
    difficulty: 'médio',
    aliases: ['Bb'],
    fingerings: [
      { frets: [3, 2, 1, 1], fingers: [3, 2, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'A#m',
    name: 'A#m',
    key: 'A#',
    quality: 'Menor',
    difficulty: 'médio',
    aliases: ['Bbm'],
    fingerings: [
      { frets: [3, 1, 1, 1], fingers: [3, 1, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'A#7',
    name: 'A#7',
    key: 'A#',
    quality: '7',
    difficulty: 'médio',
    aliases: ['Bb7'],
    fingerings: [
      { frets: [1, 2, 1, 1], fingers: [1, 2, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'A#maj7',
    name: 'A#maj7',
    key: 'A#',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['A#7M', 'A#7m', 'Bb7M', 'Bbmaj7'],
    fingerings: [
      { frets: [3, 2, 1, 0], fingers: [3, 2, 1, 0] },
    ],
  },
  {
    id: 'A#m7',
    name: 'A#m7',
    key: 'A#',
    quality: 'm7',
    difficulty: 'fácil',
    aliases: ['Bbm7'],
    fingerings: [
      { frets: [1, 1, 1, 1], fingers: [1, 1, 1, 1], barreFret: 1 },
    ],
  },
  {
    id: 'A#6',
    name: 'A#6',
    key: 'A#',
    quality: '6',
    difficulty: 'fácil',
    aliases: ['Bb6'],
    fingerings: [
      { frets: [0, 2, 1, 1], fingers: [0, 2, 1, 1], barreFret: 1 },
    ],
  },

  // ================= B CHORDS =================
  {
    id: 'B',
    name: 'B',
    key: 'B',
    quality: 'Maior',
    difficulty: 'médio',
    fingerings: [
      { frets: [4, 3, 2, 2], fingers: [3, 2, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Bm',
    name: 'Bm',
    key: 'B',
    quality: 'Menor',
    difficulty: 'médio',
    fingerings: [
      { frets: [4, 2, 2, 2], fingers: [3, 1, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'B7',
    name: 'B7',
    key: 'B',
    quality: '7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 3, 2, 2], fingers: [1, 2, 1, 1], barreFret: 2 },
      { frets: [4, 3, 2, 0], fingers: [3, 2, 1, 0] },
    ],
  },
  {
    id: 'Bmaj7',
    name: 'Bmaj7',
    key: 'B',
    quality: 'maj7',
    difficulty: 'médio',
    aliases: ['B7M', 'B7m', 'BM7', 'B7+'],
    fingerings: [
      { frets: [3, 3, 2, 2], fingers: [2, 3, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Bm7',
    name: 'Bm7',
    key: 'B',
    quality: 'm7',
    difficulty: 'fácil',
    fingerings: [
      { frets: [2, 2, 2, 2], fingers: [1, 1, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'B6',
    name: 'B6',
    key: 'B',
    quality: '6',
    difficulty: 'médio',
    fingerings: [
      { frets: [1, 3, 2, 2], fingers: [1, 3, 2, 2] },
    ],
  },
  {
    id: 'Bm6',
    name: 'Bm6',
    key: 'B',
    quality: 'm6',
    difficulty: 'médio',
    fingerings: [
      { frets: [1, 2, 2, 2], fingers: [1, 2, 2, 2] },
    ],
  },
  {
    id: 'Bsus4',
    name: 'Bsus4',
    key: 'B',
    quality: 'sus4',
    difficulty: 'médio',
    fingerings: [
      { frets: [4, 4, 2, 2], fingers: [3, 4, 1, 1], barreFret: 2 },
    ],
  },
  {
    id: 'Bdim',
    name: 'Bdim',
    key: 'B',
    quality: 'dim',
    difficulty: 'médio',
    aliases: ['B°', 'Bdim7'],
    fingerings: [
      { frets: [1, 2, 1, 2], fingers: [1, 3, 2, 4] },
    ],
  },
  {
    id: 'Bm7b5',
    name: 'Bm7b5',
    key: 'B',
    quality: 'm7b5',
    difficulty: 'médio',
    aliases: ['BØ'],
    fingerings: [
      { frets: [2, 2, 1, 2], fingers: [2, 3, 1, 4] },
    ],
  },
];

/**
 * Intelligent Chord Lookup
 * Handles Portuguese notation (e.g. G7M, G7m, G7+, GM7) and flat/sharp equivalents
 */
export function findChord(chordName: string): ChordDefinition | undefined {
  if (!chordName) return undefined;
  const clean = chordName.trim().replace(/^\[|\]$/g, '');

  // 1. Direct match by ID, name, or aliases
  let found = CHORD_DATABASE.find(
    (c) =>
      c.name.toLowerCase() === clean.toLowerCase() ||
      c.id.toLowerCase() === clean.toLowerCase() ||
      (c.aliases && c.aliases.some((a) => a.toLowerCase() === clean.toLowerCase()))
  );
  if (found) return found;

  // 2. Normalization for Portuguese 7M / 7m / 7+ / M7 / maj7
  let normalized = clean;

  // Check 7M / 7m / 7+ / M7
  if (
    /^[A-G][#b]?(7M|7\+|M7|7m)$/i.test(normalized) &&
    !normalized.toLowerCase().includes('maj')
  ) {
    const majVariant = normalized.replace(/(7M|7\+|M7|7m)$/i, 'maj7');
    found = CHORD_DATABASE.find(
      (c) =>
        c.name.toLowerCase() === majVariant.toLowerCase() ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === majVariant.toLowerCase()))
    );
    if (found) return found;
  }

  // 3. Normalization for flat notes: Bb -> A#, Db -> C#, Eb -> D#, Gb -> F#, Ab -> G#
  const rootMatch = clean.match(/^([A-G][#b]?)(.*)$/i);
  if (rootMatch) {
    let root = rootMatch[1];
    let quality = rootMatch[2];

    const flatToSharp: Record<string, string> = {
      Bb: 'A#', bb: 'A#',
      Db: 'C#', db: 'C#',
      Eb: 'D#', eb: 'D#',
      Gb: 'F#', gb: 'F#',
      Ab: 'G#', ab: 'G#',
    };

    if (flatToSharp[root]) {
      root = flatToSharp[root];
    }

    if (/^(7M|7\+|M7|7m)$/i.test(quality)) {
      quality = 'maj7';
    }

    const testName = root + quality;
    found = CHORD_DATABASE.find(
      (c) =>
        c.name.toLowerCase() === testName.toLowerCase() ||
        c.id.toLowerCase() === testName.toLowerCase() ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === testName.toLowerCase()))
    );
    if (found) return found;
  }

  // 4. Último recurso: motor de voicings — gera a posição real pela teoria
  //    musical para acordes que NÃO existem no dicionário (ex.: "D7(9)",
  //    "Am7M", "F#9-/7", "A6(9)"). Assim nunca apresentamos um acorde sem
  //    diagrama — o acorde que faltava ganha uma posição tocável no ukulele.
  const generated = getOrGenerateChord(clean);
  if (generated) return generated;

  return undefined;
}
