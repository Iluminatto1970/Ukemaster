/**
 * Hub de VÍDEO AULAS: vídeos do YouTube, cursos e links úteis dos parceiros
 * (gerenciados no admin) + formulário "Pedir videoaula" que salva o pedido
 * (Supabase → fallback localStorage) para o proprietário atender.
 */
import React, { useMemo, useState } from 'react';
import type { PartnerLink } from '../types';
import { youtubeIdFromUrl } from '../lib/affiliateContent';
import { sendVideoRequest } from '../lib/community';
import { useT } from '../lib/i18n';
import {
  PlayCircle,
  GraduationCap,
  Link2,
  ExternalLink,
  Youtube,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  HandHeart,
  MessageCircle,
} from 'lucide-react';

/** WhatsApp do proprietário — contato para parcerias (cursos/canais). */
const PARTNER_WHATSAPP_URL =
  'https://wa.me/5581986607510?text=' +
  encodeURIComponent('Olá! Quero divulgar meu curso/canal no UkeMaster 🎸');

interface VideosHubProps {
  partnerLinks: PartnerLink[];
}

export const VideosHub: React.FC<VideosHubProps> = ({ partnerLinks }) => {
  const { t } = useT();
  const active = useMemo(
    () =>
      partnerLinks
        .filter((p) => p.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [partnerLinks]
  );
  const videos = active.filter((p) => p.type === 'youtube');
  const courses = active.filter((p) => p.type === 'course');
  const links = active.filter((p) => p.type === 'link');

  const [playId, setPlayId] = useState<string | null>(null);

  // ── Formulário "Pedir videoaula" ────────────────────────────────────
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [song, setSong] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<boolean | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setSent(false);
      return;
    }
    setSending(true);
    try {
      const res = await sendVideoRequest({ name, email, whatsapp, song, message });
      setSent(true);
      setName('');
      setEmail('');
      setWhatsapp('');
      setSong('');
      setMessage('');
      console.info('[videos] Pedido de aula salvo:', res.stored);
    } catch {
      setSent(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Cabeçalho */}
      <div className="bg-gradient-to-br from-[#1D2D44] to-[#0E7C7B] rounded-2xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xs">
        <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
          <Youtube className="w-40 h-40" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white text-xs font-bold mb-3 border border-white/20">
            <PlayCircle className="w-3.5 h-3.5 text-[#F6AE2D]" /> Aulas & Cursos Recomendados
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Vídeo Aulas de Ukulele
          </h2>
          <p className="text-sm sm:text-base mt-2 text-teal-50/90">
            Aprenda com vídeos selecionados, cursos recomendados e peça a aula
            que você quer — a comunidade cresce junto com você. 💚
          </p>
        </div>
      </div>

      {/* Aviso de parceria (transparência) */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-3 space-y-2.5">
        <div className="flex items-start gap-2.5 text-[11px] text-amber-800 font-semibold leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            {t('videos.partnerNotice')}. Se tiver um curso ou canal para divulgar aqui, fale conosco no WhatsApp!
          </span>
        </div>
        <a
          href={PARTNER_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold transition-colors shadow-sm"
        >
          <MessageCircle className="w-3.5 h-3.5" /> Parcerias: (81) 98660-7510
        </a>
      </div>

      {/* Vídeos */}
      {videos.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-2">
            <Youtube className="w-4 h-4 text-red-500" /> Vídeos & Aulas ({videos.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {videos.map((v) => {
              const ytId = youtubeIdFromUrl(v.url);
              const isPlaying = playId === v.id;
              return (
                <div
                  key={v.id}
                  className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md hover:border-orange-300 transition-all group"
                >
                  {ytId && isPlaying ? (
                    <div className="aspect-video bg-black">
                      <iframe
                        src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        if (ytId) {
                          setPlayId(v.id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                      }}
                      className="w-full aspect-video relative cursor-pointer"
                      title={ytId ? `Assistir: ${v.title}` : v.title}
                    >
                      {ytId ? (
                        <img
                          src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                          alt={v.title}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[#0E7C7B]/15 to-slate-100 flex items-center justify-center">
                          <Youtube className="w-10 h-10 text-red-500/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
                        <PlayCircle className="w-12 h-12 text-white drop-shadow-lg opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                      </div>
                    </button>
                  )}
                  <div className="p-3.5">
                    <p className="text-[13px] font-extrabold text-slate-900 leading-snug line-clamp-2">
                      {v.title}
                    </p>
                    {v.description && (
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{v.description}</p>
                    )}
                    {v.url && !ytId && (
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#0E7C7B] hover:underline"
                      >
                        Abrir no YouTube <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cursos */}
      {courses.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#0E7C7B]" /> Cursos Recomendados
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {courses.map((c) => (
              <a
                key={c.id}
                href={c.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex items-center gap-3 p-4 bg-white border border-slate-200/90 rounded-2xl hover:border-[#0E7C7B]/50 hover:bg-[#0E7C7B]/[0.03] transition-all group shadow-2xs"
              >
                <div className="w-11 h-11 shrink-0 rounded-xl bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-extrabold text-slate-900 truncate">{c.title}</p>
                  {c.description && (
                    <p className="text-[11px] text-slate-500 truncate">{c.description}</p>
                  )}
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-extrabold border border-amber-200 shrink-0">
                  Parceiro
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Links úteis */}
      {links.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#0E7C7B]" /> Links Úteis
          </h3>
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-[#0E7C7B] hover:text-white text-xs font-bold text-slate-700 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" /> {l.title}
              </a>
            ))}
          </div>
        </section>
      )}

      {videos.length === 0 && courses.length === 0 && links.length === 0 && (
        <div className="text-center py-14 bg-white border border-slate-200/90 rounded-2xl p-8">
          <Youtube className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800">{t('videos.comingSoon')}</h3>
          <p className="text-slate-500 text-xs mt-1">
            {t('videos.comingSoon')} Peça a sua aula abaixo! 👇
          </p>
        </div>
      )}

      {/* Pedir videoaula */}
      <section className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <HandHeart className="w-5 h-5 text-[#F26419]" />
          <h3 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            Pedir Videoaula
          </h3>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Quer uma aula de uma música específica? Deixe seu pedido — a gente
          prioriza os mais pedidos pela comunidade. 🎯
        </p>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('videos.name')}
            required
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('videos.email')}
            required
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium"
          />
          <input
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder={t('videos.whatsapp')}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium"
          />
          <input
            value={song}
            onChange={(e) => setSong(e.target.value)}
            placeholder={t('videos.songRequest')}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium sm:col-span-2"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('videos.notes')}
            rows={3}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium sm:col-span-2 resize-y"
          />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={sending}
              className="px-5 py-2.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-[#F26419]/25"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Enviar Pedido
            </button>
            {sent === true && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Pedido enviado! Obrigado 💚
              </span>
            )}
            {sent === false && (
              <span className="text-xs font-bold text-rose-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Preencha nome e e-mail para enviar.
              </span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
};
