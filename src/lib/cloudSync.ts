/**
 * Sincronização do acervo com a nuvem: push de alterações locais para o Supabase com debounce, filtro anti-corrupção (nunca envia música sem conteúdo) e fallback offline.
 */
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
import {
  fetchRows,
  fetchAllRows,
  upsertRows,
  upsertRowsChunked,
  deleteRows,
  getSupabase,
  isSupabaseConfigured,
} from './supabase';
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
  medium_content?: string | null;
  difficulty?: string | null;
  category?: string | null;
  tags?: string[] | null;
  seo_description?: string | null;
  hashtags?: string[] | null;
  votes?: number | null;
  views?: number | null;
  created_at: string;
  updated_at: string;
}

function songToRow(s: Song): SongRow {
  // IMPORTANTE: NUNCA deixar valores undefined — o JSON.stringify descarta
  // essas chaves e o PostgREST rejeita lotes heterogêneos (PGRST102
  // "All object keys must match"). Sempre use null/[] como default.
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key ?? null,
    tempo: s.tempo ?? null,
    strumming_pattern: s.strummingPattern ?? null,
    youtube_url: s.youtubeUrl ?? null,
    youtube_id: s.youtubeId ?? null,
    content: s.content ?? null,
    simplified_content: s.simplifiedContent ?? null,
    medium_content: s.mediumContent ?? null,
    difficulty: s.difficulty ?? null,
    category: s.category ?? null,
    tags: s.tags ?? [],
    seo_description: s.seoDescription ?? null,
    hashtags: s.hashtags ?? [],
    votes: s.votes ?? 0,
    views: s.views ?? 0,
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
    mediumContent: r.medium_content ?? undefined,
    difficulty: r.difficulty as Song['difficulty'] | undefined,
    category: r.category ?? undefined,
    tags: r.tags ?? undefined,
    seoDescription: r.seo_description ?? undefined,
    hashtags: r.hashtags ?? undefined,
    votes: r.votes ?? 0,
    views: r.views ?? 0,
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
    description: p.description ?? null,
    song_ids: p.songIds ?? [],
    category: p.category ?? null,
    difficulty: p.difficulty ?? null,
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

// ── Coluna votes (rating) — disponível só após a migração do schema ────
// Se o schema ainda não foi executado (songs sem a coluna votes), o push
// do acervo inteiro falharia com PGRST204. Detecta uma vez e usa cache.
let votesColumnAvailable: boolean | null = null;

async function checkVotesColumn(): Promise<boolean> {
  if (votesColumnAvailable !== null) return votesColumnAvailable;
  // silent=true: pré-migração a coluna não existe e o 400 é esperado —
  // não deve poluir o console.
  const rows = await fetchRows<{ votes?: number }>('songs', '&limit=1', 'votes', true);
  // null = requisição falhou (coluna inexistente / tabela ausente)
  votesColumnAvailable = rows !== null;
  return votesColumnAvailable;
}

/** songToRow sem a coluna votes (pré-migração). */
function songToRowWithoutVotes(s: Song): Omit<SongRow, 'votes'> {
  const { votes: _votes, ...row } = songToRow(s);
  return row;
}

// ── Coluna views (Mais Acessadas) — disponível só após a migração ──────
// Mesmo padrão da coluna votes: detecta uma vez, usa cache, e o push
// envia sem a coluna enquanto o schema não for aplicado.
let viewsColumnAvailable: boolean | null = null;

async function checkViewsColumn(): Promise<boolean> {
  if (viewsColumnAvailable !== null) return viewsColumnAvailable;
  const rows = await fetchRows<{ views?: number }>('songs', '&limit=1', 'views', true);
  viewsColumnAvailable = rows !== null;
  return viewsColumnAvailable;
}

/** songToRow sem as colunas votes/views (pré-migração do schema). */
function songToRowLegacy(s: Song): Omit<SongRow, 'votes' | 'views'> {
  const { votes: _v, views: _w, ...row } = songToRow(s);
  return row;
}

// ── Colunas de METADADOS (sem content/simplified_content) ───────────────
// A lista do acervo só precisa dos metadados; a cifra COMPLETA de cada música
// é buscada sob demanda ao ABRIR (fetchSongFromCloud). Buscar tudo (content)
// significa ~15MB para 4.600+ músicas — em conexão lenta o acervo demora
// minutos para aparecer e parece vazio. Só metadados: ~1,5MB, carrega rápido.
const SONG_METADATA_COLUMNS =
  'id,title,artist,key,tempo,strumming_pattern,youtube_url,youtube_id,difficulty,category,tags,seo_description,hashtags,votes,views,created_at,updated_at';
// Pré-migração (sem a coluna views): o fetch do catálogo não pode quebrar
// pedindo uma coluna que o banco ainda não tem — detecta e usa esta lista.
const SONG_METADATA_COLUMNS_LEGACY =
  'id,title,artist,key,tempo,strumming_pattern,youtube_url,youtube_id,difficulty,category,tags,seo_description,hashtags,votes,created_at,updated_at';

// ── Repertoire (uma linha por usuário) ─────────────────────────────────
interface RepertoireRow {
  user_id: string;
  display_name?: string | null;
  song_ids?: string[] | null;
  is_public?: boolean | null;
  updated_at?: string;
}

// ── API pública ────────────────────────────────────────────────────────

/**
 * Busca o acervo de músicas na nuvem (PAGINADO — o PostgREST limita a
 * resposta em 1000 linhas; o acervo real tem 4.600+). Busca SÓ METADADOS
 * (sem a cifra) para a lista carregar em segundos em qualquer conexão.
 * null = indisponível.
 */
export async function fetchSongsFromCloud(): Promise<Song[] | null> {
  if (!isSupabaseConfigured()) return null;
  // Tolera a pré-migração: se a coluna views ainda não existe no banco,
  // busca sem ela (o ranking "Mais Acessadas" volta após aplicar o schema).
  const hasViews = await checkViewsColumn();
  const columns = hasViews ? SONG_METADATA_COLUMNS : SONG_METADATA_COLUMNS_LEGACY;
  const rows = await fetchAllRows<SongRow>('songs', '', columns);
  if (!rows) return null;
  return rows.map(rowToSong);
}

/**
 * Busca UMA música COMPLETA (com a cifra em `content`) por id — usado ao
 * ABRIR uma música, já que a lista só tem os metadados. null = não existe.
 */
export async function fetchSongFromCloud(songId: string): Promise<Song | null> {
  if (!isSupabaseConfigured()) return null;
  const rows = await fetchRows<SongRow>(
    'songs',
    `&id=eq.${encodeURIComponent(songId)}&limit=1`,
    '*'
  );
  if (!rows || !rows.length) return null;
  return rowToSong(rows[0]);
}

/**
 * Exclui UMA música do acervo em nuvem (uso exclusivo do admin — a UI só
 * mostra o botão Excluir para iluminatto@gmail.com). O RLS no banco exige
 * JWT do admin (auth.jwt()->>'email'), então a chamada só funciona logado;
 * visitantes/outros usuários recebem 401/403 e a música permanece.
 */
export async function deleteSongFromCloud(songId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  return deleteRows('songs', `?id=eq.${encodeURIComponent(songId)}`);
}

/**
 * Envia o acervo local para a nuvem (UPSERT only — nunca deleta).
 *
 * IMPORTANTE — 2 regras de segurança (aprendidas com incidente real):
 * 1) NUNCA envia música sem `content`. O cache local (localStorage) guarda
 *    as músicas SEM conteúdo de propósito (cota de ~5MB), e o upsert com
 *    `content: null` SOBRESCREVERIA o acervo inteiro da nuvem com cifras
 *    vazias quando o fetch inicial falha (o app roda com dados locais).
 * 2) UPSERT only — nunca deleta: o acervo é PÚBLICO e alimentado por vários
 *    clientes (app + cron de plataformas); a API limita leituras a 1000
 *    linhas e um cliente com a lista local incompleta apagaria a nuvem.
 */
export async function pushSongsToCloud(songs: Song[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  // Só sobe músicas com conteúdo REAL (criadas/editadas no app ou vindas da
  // nuvem). Músicas sem content = cache local enxuto — ignorar evita apagar
  // o acervo compartilhado quando a nuvem não pôde ser lida.
  const withContent = songs.filter((s) => (s.content || '').trim().length > 0);
  // Se a coluna votes ainda não existe (schema não migrado), envia sem ela
  // para o push não quebrar — o voto volta a funcionar após a migração.
  const hasVotes = await checkVotesColumn();
  const hasViews = await checkViewsColumn();
  const rows = withContent.map((s) => {
    if (hasVotes && hasViews) return songToRow(s);
    if (hasVotes) {
      const { views: _w, ...row } = songToRow(s);
      return row;
    }
    return songToRowLegacy(s);
  });
  // Chunked: com 3.000+ músicas o corpo do POST único passaria do limite
  // aceito pela API — divide em lotes de 400.
  return upsertRowsChunked('songs', rows);
}

/** Busca as playlists da nuvem (PAGINADO). null = indisponível. */
export async function fetchPlaylistsFromCloud(): Promise<Playlist[] | null> {
  if (!isSupabaseConfigured()) return null;
  const rows = await fetchAllRows<PlaylistRow>('playlists');
  if (!rows) return null;
  return rows.map(rowToPlaylist);
}

/** Envia as playlists (UPSERT only — nunca deleta, mesmo critério das songs). */
export async function pushPlaylistsToCloud(playlists: Playlist[]): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  return upsertRowsChunked('playlists', playlists.map(playlistToRow));
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
