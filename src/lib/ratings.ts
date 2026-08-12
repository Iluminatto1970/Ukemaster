/**
 * Votação e tendências: vota em músicas (1 por usuário), calcula rankings (Mais Votadas / Em Alta 14 dias) e persiste no Supabase com fallback local.
 */
/**
 * Sistema de votação (rating) do UkeMaster Pro.
 *
 * Design:
 *  - 1 voto por usuário por música: PK composta (song_id, user_id) na tabela
 *    `song_votes`. user_id = id do Clerk quando logado, ou um id de
 *    dispositivo persistido (guest) para visitantes anônimos.
 *  - Contagem agregada em `songs.votes` (cache denormalizada para ordenar a
 *    lista "mais votadas" sem COUNT a cada leitura).
 *  - Fallback localStorage quando o Supabase não está configurado — o app
 *    continua 100% funcional offline.
 *
 * Tabelas (ver supabase/schema.sql): song_votes, songs.votes.
 */

import { Song } from '../types';
import {
  fetchRows,
  upsertRows,
  patchRows,
  deleteRows,
  isSupabaseConfigured,
} from './supabase';

const GUEST_ID_KEY = 'ukemaster_voter_id';
const LOCAL_VOTES_KEY = 'ukemaster_local_votes_v1'; // { [songId]: count }
const LOCAL_MY_VOTES_KEY = 'ukemaster_local_myvotes_v1'; // string[] (song ids)

/**
 * Id do votante: o id REAL do usuário Supabase quando logado (sem prefixo —
 * casa com auth.uid()::text do RLS, que exige login para votar). Visitantes
 * (sem conta) ganham um id de dispositivo APENAS para o fallback local — a
 * nuvem rejeita voto anônimo (migration-contribuidores.sql).
 */
export function getVoterId(userId?: string | null): string {
  if (userId) return userId;
  let guest = '';
  try {
    guest = localStorage.getItem(GUEST_ID_KEY) || '';
    if (!guest) {
      guest = `guest:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(GUEST_ID_KEY, guest);
    }
  } catch {
    guest = `guest:${Date.now().toString(36)}`;
  }
  return guest;
}

// ── Fallback localStorage (sem Supabase) ────────────────────────────────
function readLocalVotes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_VOTES_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalVotes(map: Record<string, number>) {
  try {
    localStorage.setItem(LOCAL_VOTES_KEY, JSON.stringify(map));
  } catch {
    // ignora (quota cheia etc.)
  }
}

/** Remove o fallback local de um voto (usado após sucesso na nuvem). */
function clearLocalVote(songId: string) {
  const map = readLocalVotes();
  if (map[songId] !== undefined) {
    delete map[songId];
    writeLocalVotes(map);
  }
  const my = readLocalMyVotes();
  const i = my.indexOf(songId);
  if (i >= 0) {
    my.splice(i, 1);
    writeLocalMyVotes(my);
  }
}

function readLocalMyVotes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MY_VOTES_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeLocalMyVotes(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_MY_VOTES_KEY, JSON.stringify(ids));
  } catch {
    // ignora
  }
}

/** Aplica os votos locais (fallback) sobre o acervo — usado ao carregar. */
export function mergeLocalVotes(songs: Song[]): Song[] {
  const map = readLocalVotes();
  return songs.map((s) => ({ ...s, votes: (s.votes ?? 0) + (map[s.id] ?? 0) }));
}

/**
 * Busca os ids das músicas que o votante já marcou (dedupe 1 voto).
 * Nuvem primeiro; fallback localStorage.
 */
export async function fetchMyVotes(voterId: string): Promise<Set<string>> {
  if (isSupabaseConfigured()) {
    const rows = await fetchRows<{ song_id: string }>(
      'song_votes',
      `&user_id=eq.${encodeURIComponent(voterId)}`,
      'song_id'
    );
    if (rows) return new Set(rows.map((r) => r.song_id));
  }
  return new Set(readLocalMyVotes());
}

/**
 * Conta os votos RECENTES de cada música (janela de `days` dias) — base do
 * ranking "EM ALTA". Usa song_votes.created_at para capturar o momento do
 * voto (o cache `songs.votes` só tem o total acumulado). Retorna um Map
 * song_id → votos recentes, vazio se não configurado/falhar.
 */
export async function fetchTrendingSongIds(
  days = 14,
  limit = 200
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isSupabaseConfigured()) return map;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await fetchRows<{ song_id: string }>(
    'song_votes',
    `&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${limit}`,
    'song_id'
  );
  if (!rows) return map;
  for (const r of rows) {
    map.set(r.song_id, (map.get(r.song_id) || 0) + 1);
  }
  return map;
}

/**
 * Registra (ou remove) o voto do usuário numa música.
 * - Persiste em `song_votes` (dedupe) e ajusta o cache `songs.votes`.
 * - Retorna o novo total de votos da música (ou null se não conseguiu
 *   sincronizar a nuvem — nesse caso o caller deve reverter a UI).
 */
export async function persistVote(
  song: Song,
  voterId: string,
  vote: boolean
): Promise<number | null> {
  const delta = vote ? 1 : -1;
  const current = song.votes ?? 0;
  const next = Math.max(0, current + delta);

  let cloudOk = false;
  if (isSupabaseConfigured()) {
    if (vote) {
      // Upsert idempotente (PK composta) — mesmo se duplicar, não quebra.
      cloudOk = await upsertRows('song_votes', [
        { song_id: song.id, user_id: voterId },
      ]);
    } else {
      cloudOk = await deleteRows(
        'song_votes',
        `?song_id=eq.${encodeURIComponent(song.id)}&user_id=eq.${encodeURIComponent(voterId)}`
      );
    }

    if (cloudOk) {
      // Ajusta o cache de contagem na tabela songs (denormalizado p/ ordenação).
      // PATCH atualiza SÓ a coluna votes (o upsert POST falharia: as colunas
      // title/artist/content são NOT NULL e ele tentaria gravá-las como null).
      const okCount = await patchRows(
        'songs',
        `?id=eq.${encodeURIComponent(song.id)}`,
        { votes: next, updated_at: new Date().toISOString() }
      );
      if (okCount) {
        // Sucesso na nuvem → limpa o fallback local deste voto, senão o
        // mergeLocalVotes somaria o voto DUAS vezes no próximo carregamento.
        clearLocalVote(song.id);
        return next;
      }
      cloudOk = false;
    }
  }

  // Fallback localStorage: usado quando o Supabase não está configurado OU
  // quando a nuvem falhou (ex.: schema ainda não migrado com song_votes/votes).
  // Assim o voto SEMPRE funciona para o usuário, e o total local é somado
  // ao da nuvem no mergeLocalVotes.
  const map = readLocalVotes();
  map[song.id] = next;
  writeLocalVotes(map);

  const my = readLocalMyVotes();
  if (vote) {
    if (!my.includes(song.id)) my.push(song.id);
  } else {
    const i = my.indexOf(song.id);
    if (i >= 0) my.splice(i, 1);
  }
  writeLocalMyVotes(my);
  return next;
}
