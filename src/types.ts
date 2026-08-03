export interface ChordFingering {
  frets: number[]; // 4 numbers for strings [G, C, E, A], -1 for muted (X), 0 for open
  fingers?: number[]; // 1=index, 2=middle, 3=ring, 4=pinky, 0=none
  barreFret?: number; // fret number if barre chord
  baseFret?: number; // starting fret (default 1)
}

export interface ChordDefinition {
  id: string;
  name: string; // e.g., "C", "Am", "F#m7"
  key: string; // "C", "C#", "D", etc.
  quality: string; // "Maior", "Menor", "7", "m7", "maj7", "dim", "aug", "sus4", "add9", "6"
  fingerings: ChordFingering[]; // multiple variations
  difficulty?: 'fácil' | 'médio' | 'difícil';
  aliases?: string[]; // e.g. ["G7M", "G7m", "GM7", "G7+"]
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  key: string;
  tempo?: number; // BPM
  strummingPattern?: string; // e.g. "↓  ↓ ↑  ↑ ↓ ↑"
  youtubeUrl?: string;
  youtubeId?: string;
  content: string; // ChordPro format: "Eu quero [C]saber [G]onde..." or custom lines
  simplifiedContent?: string; // Optional simplified chord layout
  difficulty?: 'Simplificado' | 'Médio' | 'Avançado';
  category?: string; // e.g. "MPB", "Pop", "Rock", "Gospel", "Reggae", "Sertanejo", "Infantil", "Internacional", "Outros"
  tags?: string[];
  seoDescription?: string;
  hashtags?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  songIds: string[];
  category?: string; // e.g. "MPB", "Pop", "Rock", "Gospel", "Reggae", "Sertanejo", "Infantil", "Internacional", "Estudo", "Outros"
  difficulty?: 'Simplificado' | 'Médio' | 'Avançado' | 'Misto';
  createdAt: string;
}

export const SONG_CATEGORIES = [
  'MPB',
  'Pop',
  'Rock',
  'Reggae',
  'Gospel',
  'Sertanejo',
  'Infantil',
  'Internacional',
  'Forró',
  'Outros',
] as const;

export const SONG_DIFFICULTIES = [
  'Simplificado',
  'Médio',
  'Avançado',
] as const;

export const PLAYLIST_DIFFICULTIES = [
  'Simplificado',
  'Médio',
  'Avançado',
  'Misto',
] as const;

export interface StrummingPattern {
  id: string;
  name: string;
  timeSignature: string; // e.g., "4/4", "3/4", "6/8"
  pattern: string; // e.g., "↓  ↓ ↑  ↑ ↓ ↑"
  description: string;
  genre: string;
  beats: ('down' | 'up' | 'mute' | 'rest')[];
}

export type ActiveTab = 'dashboard' | 'musicas' | 'dicionario' | 'afinador' | 'ritmos';

export interface AdSenseConfig {
  publisherId: string; // e.g., 'ca-pub-1234567890123456'
  enabled: boolean;
  showTestPlaceholders: boolean;
  slotTopHeader?: string;
  slotInSong?: string;
  slotInFeed?: string;
  slotAnchorBottom?: string;
}
