/**
 * Sincronização em nuvem (Supabase) com fallback localStorage.
 *
 * Estratégia: "último que salvou vence". O localStorage continua sendo o
 * armazenamento local instantâneo (offline-first); o Supabase é o espelho
 * em nuvem que permite compartilhar o acervo entre usuários/dispositivos.
 *
 * - No carregamento do app: tenta buscar do Supabase. Se houver dados na
 *   nuvem (lista não vazia), eles substituem o localStorage (acervo público
 *   compartilhado). Se a nuvem estiver vazia ou indisponível, mantém o local.
 * - A cada alteração: upsert (replace total) para o Supabase, com debounce
 *   no App.tsx.
 *
 * Tabelas (ver supabase/schema.sql):
 *   songs, playlists, repertoires (uma linha por usuário).
 */

import { Song, Playlist } from '../types';
import { fetchRows, upsertRows, deleteRows, getSupabase, isSupabaseConfigured } from './supabase';
import { PublicRepertoire, getPublicRepertoires as getLocalPublicRepertoires } from './repertoires';

// ── Mapeamento Song ⇄ linha da tabela songs ────────────────────────────
interface SongRow {
  id: string;
  title: string;
  artist: string;
  key?: string | null;
  tempo?: number | null;
  strumming_pattern?: string | null;
  youtube_url?: string | null;
  youtube_id?: string | null;
  content?: string | null;
  simplified_content?: string | null;
  difficulty?: string | null;
  category?: string | null;
  tags?: string[] | null;
  seo_description?: string | null;
  hashtags?: string[] | null;
  created_at: string;
  updated_at: string;
}

function songToRow(s: Song): SongRow {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key,
    tempo: s.tempo,
    strumming_pattern: s.strummingPattern,
    youtube_url: s.youtubeUrl,
    youtube_id: s.youtubeId,
    content: s.content,
    simplified_content: s.simplifiedContent,
    difficulty: s.difficulty,
    category: s.category,
    tags: s.tags,
    seo_description: s.seoDescription,
    hashtags: s.hashtags,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

function rowToSong(r: SongRow): Song {
  return {
    id: r.id,
    title: r.title,
    artist: r.artist,
    key: r.key || '',
    tempo: r.tempo ?? undefined,
    strummingPattern: r.strumming_pattern ?? undefined,
    youtubeUrl: r.youtube_url ?? undefined,
    youtubeId: r.youtube_id ?? undefined,
    content: r.content || '',
    simplifiedContent: r.simplified_content ?? undefined,
    difficulty: r.difficulty as Song['difficulty'] | undefined,
    category: r.category ?? undefined,
    tags: r.tags ?? undefined,
    seoDescription: r.seo_description ?? undefined,
    hashtags: r.hashtags ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── Mapeamento Playlist ⇄ linha da tabela playlists ────────────────────
interface PlaylistRow {
  id: string;
  title: string;
  description?: string | null;
  song_ids?: string[] | null;
  category?: string | null;
  difficulty?: string | null;
  created_at: string;
}

function playlistToRow(p: Playlist): PlaylistRow {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    song_ids: p.songIds,
    category: p.category,
    difficulty: p.difficulty,
    created_at: p.createdAt,
  };
}

function rowToPlaylist(r: PlaylistRow): Playlist {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? undefined,
    songIds: r.song_ids ?? [],
    category: r.category ?? undefined,
    difficulty: r.difficulty as Playlist['difficulty'] | undefined,
    createdAt: r.created_at,
  };
}

// ── Repertoire (uma linha por usuário) ─────────────────────────────────
interface RepertoireRow {
  user_id: string;
  display_name?: string | null;
  song_ids?: string[] | null;
  is_public?: boolean | null;
  updated_at?: string;
}

// ── API pública ────────────────────────────────────────────────────────

/** Busca o acervo de músicas na nuvem. null = indisponível/vazio. */
export async function fetchSongsFromCloud(): Promise<Song[] | null> {
  if (!isSupabaseConfigured()) return null;
  const rows = await fetchRows<SongRow>('songs');
  if (!rows) return null;
  return rows.map(rowToSong);
}

/** Envia o acervo inteiro (replace total, apaga os que sumiram). */
export async function pushSongsToCloud(songs: Song[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const existing = await fetchRows<{ id: string }>('songs', '', 'id');
  if (existing) {
    const keepIds = new Set(songs.map((s) => s.id));
    const toDelete = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
    if (toDelete.length) {
      const inList = toDelete.map((id) => `"${id.replace(/"/g, '""')}"`).join(',');
      await deleteRows('songs', `?id=in.(${inList})`);
    }
  }
  return upsertRows('songs', songs.map(songToRow));
}

/** Busca as playlists da nuvem. null = indisponível. */
export async function fetchPlaylistsFromCloud(): Promise<Playlist[] | null> {
  if (!isSupabaseConfigured()) return null;
  const rows = await fetchRows<PlaylistRow>('playlists');
  if (!rows) return null;
  return rows.map(rowToPlaylist);
}

/** Envia as playlists inteiras (replace total). */
export async function pushPlaylistsToCloud(playlists: Playlist[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const existing = await fetchRows<{ id: string }>('playlists', '', 'id');
  if (existing) {
    const keepIds = new Set(playlists.map((p) => p.id));
    const toDelete = existing.filter((r) => !keepIds.has(r.id)).map((r) => r.id);
    if (toDelete.length) {
      const inList = toDelete.map((id) => `"${id.replace(/"/g, '""')}"`).join(',');
      await deleteRows('playlists', `?id=in.(${inList})`);
    }
  }
  return upsertRows('playlists', playlists.map(playlistToRow));
}

/** Busca o repertório de um usuário na nuvem. null = sem registro/indisponível. */
export async function fetchRepertoireFromCloud(userId: string): Promise<string[] | null> {
  if (!isSupabaseConfigured()) return null;
  const rows = await fetchRows<RepertoireRow>('repertoires', `&user_id=eq.${userId}`);
  if (!rows || !rows.length) return null;
  return rows[0].song_ids ?? [];
}

/** Salva o repertório de um usuário na nuvem (uma linha por usuário). */
export async function pushRepertoireToCloud(
  userId: string,
  displayName: string,
  songIds: string[],
  isPublic: boolean
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const row: RepertoireRow = {
    user_id: userId,
    display_name: displayName,
    song_ids: songIds,
    is_public: isPublic,
    updated_at: new Date().toISOString(),
  };
  return upsertRows('repertoires', [row]);
}

/**
 * Lista os repertórios públicos da comunidade: nuvem primeiro, local como
 * fallback (funciona sem Supabase configurado).
 */
export async function getPublicRepertoiresWithCloud(): Promise<PublicRepertoire[]> {
  if (isSupabaseConfigured()) {
    const rows = await fetchRows<RepertoireRow>('repertoires', '&is_public=eq.true');
    if (rows) {
      return rows
        .filter((r) => (r.song_ids?.length ?? 0) > 0)
        .map((r) => ({
          userId: r.user_id,
          name: r.display_name || 'Músico',
          songIds: r.song_ids ?? [],
          updatedAt: r.updated_at || '',
        }));
    }
  }
  return getLocalPublicRepertoires();
}

export { getSupabase, isSupabaseConfigured };
