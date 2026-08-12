/**
 * Comunidade por música: comentários públicos (fórum leve) + correção de
 * cifra/letra (colaboração). Dados no Supabase com fallback localStorage.
 *
 * REGRA: comentar e corrigir cifra são CONTRIBUIÇÕES → exige login
 * (nunca contribuir sem logar). Visitantes veem os comentários e um
 * convite para entrar; a autoria (user_id) é verificada pelo RLS.
 */
import React, { useEffect, useState } from 'react';
import { SongComment } from '../types';
import { fetchComments, addComment, sendSongFeedback } from '../lib/community';
import { useT } from '../lib/i18n';
import { MessageCircle, Send, Loader2, AlertCircle, CheckCircle2, Flag, User, LogIn } from 'lucide-react';

interface SongCommentsProps {
  songId: string;
  songTitle: string;
  /** Comentar/corrigir exige login. */
  isLoggedIn?: boolean;
  userId?: string;
  userName?: string;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
}

export const SongComments: React.FC<SongCommentsProps> = ({
  songId,
  songTitle,
  isLoggedIn = false,
  userId,
  userName,
  onOpenAuth,
}) => {
  const { t } = useT();
  const [comments, setComments] = useState<SongComment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sentOk, setSentOk] = useState(false);

  // ── Correção de cifra ────────────────────────────────────────────────
  const [showFix, setShowFix] = useState(false);
  const [fixMsg, setFixMsg] = useState('');
  const [fixState, setFixState] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');

  useEffect(() => {
    let cancelled = false;
    fetchComments(songId).then((list) => {
      if (!cancelled) {
        setComments(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !userId || !text.trim()) return;
    setSending(true);
    try {
      const { comment } = await addComment(songId, userId, userName || 'Músico', text);
      setComments((prev) => [...prev, comment]);
      setText('');
      setSentOk(true);
      setTimeout(() => setSentOk(false), 4000);
    } finally {
      setSending(false);
    }
  };

  const handleFix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn || !userId || !fixMsg.trim()) return;
    setFixState('sending');
    try {
      await sendSongFeedback({
        songId,
        songTitle,
        userId,
        userName,
        message: fixMsg,
      });
      setFixState('ok');
      setFixMsg('');
      setTimeout(() => {
        setFixState('idle');
        setShowFix(false);
      }, 3500);
    } catch {
      setFixState('err');
    }
  };

  // Convite padronizado para quem ainda não entrou (nunca contribuir sem logar)
  const loginCta = (message: string, btnLabel: string) => (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-[11px] text-slate-500 font-semibold leading-relaxed text-center sm:text-left">
        {message}
      </p>
      {onOpenAuth && (
        <button
          onClick={() => onOpenAuth('login')}
          className="shrink-0 px-4 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-extrabold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5" /> {btnLabel}
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#0E7C7B]" /> {t('viewer.community')} ({comments.length})
        </h3>
        <button
          onClick={() => setShowFix((v) => !v)}
          className="text-[10px] font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
        >
          <Flag className="w-3 h-3" /> {t('viewer.reportError')}
        </button>
      </div>

      {/* Correção de cifra */}
      {showFix &&
        (isLoggedIn ? (
          <form onSubmit={handleFix} className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2">
            <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
              {t('comments.fixTitle')}
            </p>
            <textarea
              value={fixMsg}
              onChange={(e) => setFixMsg(e.target.value)}
              placeholder={t('comments.fixPlaceholder')}
              required
              rows={2}
              className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-amber-500 font-medium resize-y"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={fixState === 'sending'}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-extrabold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {fixState === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {t('comments.sendFix')}
              </button>
              {fixState === 'ok' && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('comments.fixSent')}
                </span>
              )}
              {fixState === 'err' && (
                <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {t('comments.fixError')}
                </span>
              )}
            </div>
          </form>
        ) : (
          loginCta(
            t('comments.fixCta'),
            t('comments.loginToFix')
          )
        ))}

      {/* Lista de comentários */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 font-bold py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('comments.loading')}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
          {t('viewer.firstComment')}
        </p>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="w-7 h-7 shrink-0 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-slate-900 truncate">{c.authorName}</span>
                  <span className="text-[9px] text-slate-400 font-bold shrink-0">
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed mt-0.5 whitespace-pre-wrap break-words">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Novo comentário — exige login (contribuir nunca é anônimo) */}
      {isLoggedIn ? (
        <form onSubmit={handleComment} className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-[#0E7C7B]/10 text-[#0E7C7B] px-2.5 py-1.5 rounded-lg shrink-0">
              <User className="w-3.5 h-3.5" />
              <span className="text-[11px] font-extrabold max-w-[160px] truncate">
                {userName || 'Músico'}
              </span>
            </div>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('comments.commentPlaceholder')}
              required
              maxLength={1000}
              className="flex-1 min-w-[180px] bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="px-4 py-2 rounded-lg bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-50 text-white font-extrabold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {t('comments.comment')}
            </button>
          </div>
          {sentOk && (
            <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('comments.commentPosted')}
            </p>
          )}
        </form>
      ) : (
        loginCta(
          t('viewer.commentCta'),
          t('viewer.loginToComment')
        )
      )}
    </div>
  );
};
