/**
 * Rastreamento de músicas abertas recentemente (localStorage).
 * Cada vez que o usuário abre uma cifra, o id + metadados são salvos.
 * O Dashboard mostra as últimas 8 para acesso rápido.
 */

const STORAGE_KEY = 'ukemaster_recent_songs';
const MAX_RECENT = 8;

export interface RecentSong {
  id: string;
  title: string;
  artist: string;
  key?: string;
  category?: string;
  viewedAt: number; // timestamp
}

/** Lê as músicas recentes do localStorage. */
export function getRecentSongs(): RecentSong[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSong[];
  } catch {
    return [];
  }
}

/** Registra uma música como aberta recentemente (no topo da lista). */
export function addRecentSong(song: {
  id: string;
  title: string;
  artist: string;
  key?: string;
  category?: string;
}): void {
  try {
    const recent = getRecentSongs().filter((r) => r.id !== song.id);
    recent.unshift({
      id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key,
      category: song.category,
      viewedAt: Date.now(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch {
    // cota estourada — ignora silenciosamente
  }
}
