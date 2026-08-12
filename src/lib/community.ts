/**
 * Comunidade do UkeMaster: comentários por música, correções de cifra
 * (colaboração) e pedidos de videoaula. Tudo com Supabase + fallback
 * localStorage (funciona antes do schema ser aplicado no banco).
 */
import { supabaseRequest, isSupabaseConfigured } from './supabase';
import { logContribution } from './contributions';
import type { SongComment } from '../types';

const LS_COMMENTS_KEY = 'ukemaster_comments_v1';
const LS_FEEDBACK_KEY = 'ukemaster_feedback_v1';
const LS_VIDEO_REQUESTS_KEY = 'ukemaster_video_requests_v1';

function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

// ── Comentários por música ─────────────────────────────────────────────
export async function fetchComments(songId: string): Promise<SongComment[]> {
  if (isSupabaseConfigured()) {
    const { ok, data } = await supabaseRequest<SongComment[]>(
      'song_comments',
      {
        query: `?select=id,song_id,author_name,text,created_at&song_id=eq.${encodeURIComponent(
          songId
        )}&order=created_at.asc`,
        silent: true,
      }
    );
    if (ok && data) {
      return data.map((c: any) => ({
        id: c.id,
        songId: c.song_id,
        authorName: c.author_name,
        text: c.text,
        createdAt: c.created_at,
      }));
    }
  }
  // Fallback: local (o schema ainda não foi aplicado)
  return readLocal<SongComment>(LS_COMMENTS_KEY).filter((c) => c.songId === songId);
}

// ── Comentários por música (contribuição: exige login — user_id é
//    verificado pelo RLS contra auth.uid(), impossível forjar) ────────
export async function addComment(
  songId: string,
  userId: string,
  userName: string,
  text: string
): Promise<{ stored: 'supabase' | 'local'; comment: SongComment }> {
  const comment: SongComment = {
    id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    songId,
    authorName: userName.trim().slice(0, 60) || 'Músico',
    text: text.trim().slice(0, 1000),
    createdAt: new Date().toISOString(),
  };

  // Cache local sempre (também serve de backup/offline)
  try {
    const all = readLocal<SongComment>(LS_COMMENTS_KEY);
    all.push(comment);
    localStorage.setItem(LS_COMMENTS_KEY, JSON.stringify(all));
  } catch {
    // cota/privado — segue sem cache
  }

  // Sem usuário autenticado, não há comentário (contribuir exige login)
  if (!userId || !isSupabaseConfigured()) {
    return { stored: 'local', comment };
  }

  const { ok } = await supabaseRequest('song_comments', {
    method: 'POST',
    body: {
      id: comment.id,
      song_id: songId,
      user_id: userId,
      author_name: comment.authorName,
      text: comment.text,
    },
    prefer: 'return=minimal',
    silent: true,
  });
  if (ok) {
    // Comentar é CONTRIBUIR → registra no ranking (autoria verificada no RLS)
    logContribution({
      userId,
      userName: comment.authorName,
      action: 'comment',
      targetType: 'song',
      targetId: songId,
    });
    return { stored: 'supabase', comment };
  }
  return { stored: 'local', comment };
}

// ── Correção de cifra/letra (colaboração) ──────────────────────────────
// ── Correção de cifra/letra (colaboração) — exige login (user_id real) ──
export async function sendSongFeedback(input: {
  songId?: string;
  songTitle?: string;
  userId?: string;
  userName?: string;
  message: string;
}): Promise<{ stored: 'supabase' | 'local' }> {
  if (isSupabaseConfigured() && input.userId) {
    const { ok } = await supabaseRequest('song_feedback', {
      method: 'POST',
      body: {
        song_id: input.songId ?? null,
        song_title: input.songTitle ?? null,
        user_id: input.userId,
        name: input.userName?.trim() || null,
        message: input.message.trim(),
      },
      prefer: 'return=minimal',
      silent: true,
    });
    if (ok) {
      // Corrigir cifra é CONTRIBUIR → registra no ranking
      logContribution({
        userId: input.userId,
        userName: input.userName || 'Músico',
        action: 'feedback',
        targetType: 'song',
        targetId: input.songId,
      });
      return { stored: 'supabase' };
    }
  }
  try {
    const all = readLocal<{ message: string; createdAt: string }>(LS_FEEDBACK_KEY);
    all.push({ message: `${input.songTitle ?? ''} :: ${input.message}`, createdAt: new Date().toISOString() });
    localStorage.setItem(LS_FEEDBACK_KEY, JSON.stringify(all));
  } catch {
    // segue
  }
  return { stored: 'local' };
}

// ── Pedir videoaula ─────────────────────────────────────────────────────
export async function sendVideoRequest(input: {
  name: string;
  email: string;
  whatsapp?: string;
  song?: string;
  message?: string;
}): Promise<{ stored: 'supabase' | 'local' }> {
  if (isSupabaseConfigured()) {
    const { ok } = await supabaseRequest('video_requests', {
      method: 'POST',
      body: {
        name: input.name.trim(),
        email: input.email.trim(),
        whatsapp: input.whatsapp?.trim() || null,
        song: input.song?.trim() || null,
        message: input.message?.trim() || null,
      },
      prefer: 'return=minimal',
      silent: true,
    });
    if (ok) return { stored: 'supabase' };
  }
  try {
    const all = readLocal<{ email: string; createdAt: string }>(LS_VIDEO_REQUESTS_KEY);
    all.push({ email: input.email, createdAt: new Date().toISOString() });
    localStorage.setItem(LS_VIDEO_REQUESTS_KEY, JSON.stringify(all));
  } catch {
    // segue
  }
  return { stored: 'local' };
}
