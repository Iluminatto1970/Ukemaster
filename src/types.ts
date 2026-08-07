/**
 * Tipos compartilhados do domínio: Song, Playlist, Repertoire, User, ActiveTab, AdSenseConfig e estruturas usadas pelo app, cron e APIs.
 */
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
  /** Verdadeiro quando o diagrama foi GERADO pelo motor de teoria musical
   *  (chordGenerator) — acorde que não existia no dicionário estático. */
  generated?: boolean;
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
  simplifiedContent?: string; // Versão SIMPLES gerada pela teoria musical
  mediumContent?: string; // Versão MÉDIA gerada pela teoria musical
  difficulty?: 'Simplificado' | 'Médio' | 'Avançado';
  category?: string; // e.g. "MPB", "Pop", "Rock", "Gospel", "Reggae", "Sertanejo", "Infantil", "Internacional", "Outros"
  tags?: string[];
  /** Idioma da plataforma de origem (pt/en/es/fr/de/ja/zh/ar ou 'multi'). */
  lang?: string;
  seoDescription?: string;
  hashtags?: string[];
  votes?: number; // total de votos da comunidade
  views?: number; // total de visualizações (ranking "Mais Acessadas")
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

export type ActiveTab =
  | 'dashboard'
  | 'musicas'
  | 'dicionario'
  | 'afinador'
  | 'ritmos'
  | 'metronomo'
  | 'videos'
  | 'blog'
  | 'admin';

/** Link de afiliado (Mercado Livre, Shopee, Amazon...) — importado por TXT pelo admin. */
export interface AffiliateLink {
  id: string;
  /** Nome do produto/loja exibido no card. */
  title: string;
  url: string;
  /** Loja de origem derivada da URL (ex.: "Mercado Livre"). */
  store?: string;
  /** Card ativo (aparece no site) ou pausado. */
  enabled: boolean;
  /** Posição relativa de exibição (menor primeiro). */
  sortOrder: number;
  createdAt: string;
}

/** Tipo de parceiro exibido no site (área de parceiros). */
export type PartnerType = 'youtube' | 'course' | 'link';

/** Parceiro: vídeo do YouTube, curso ou link — gerenciado pelo admin. */
export interface PartnerLink {
  id: string;
  type: PartnerType;
  title: string;
  url: string;
  description?: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

/** Post de BLOG/artigo — gerenciado pelo admin (SEO + links de afiliado). */
export interface BlogPost {
  id: string;
  title: string;
  /** Texto curto exibido no card da listagem. */
  excerpt: string;
  /** Corpo do artigo — markdown-lite (## títulos, - listas, **negrito**, links). */
  content: string;
  /** Categoria/tema (ex.: "Iniciante", "Afinação", "Técnica"). */
  category?: string;
  /** Tags para agrupamento/busca. */
  tags?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Comentário da comunidade em uma música (fórum leve por cifra). */
export interface SongComment {
  id: string;
  songId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface AdSenseConfig {
  publisherId: string; // e.g., 'ca-pub-1234567890123456'
  enabled: boolean;
  showTestPlaceholders: boolean;
  slotTopHeader?: string;
  slotInSong?: string;
  slotInFeed?: string;
  slotAnchorBottom?: string;
}
