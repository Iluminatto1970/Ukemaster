/**
 * Seção de PARCEIROS — conteúdo público gerenciado pelo admin (vídeos do
 * YouTube, cursos e links úteis). Aparece no site quando há parceiros ativos.
 */
import React, { useMemo, useState } from 'react';
import { PartnerLink } from '../types';
import { youtubeIdFromUrl } from '../lib/affiliateContent';
import { PlayCircle, GraduationCap, Link2, ExternalLink, Youtube, AlertCircle, MessageCircle } from 'lucide-react';

/** WhatsApp do proprietário — contato para parcerias (cursos/canais). */
const PARTNER_WHATSAPP_URL =
  'https://wa.me/5581986607510?text=' +
  encodeURIComponent('Olá! Quero divulgar meu curso/canal no UkeMaster 🎸');
import { trackEvent } from '../lib/analytics';

interface PartnersSectionProps {
  partners: PartnerLink[];
  /** Máximo de itens por tipo (padrão: 3). */
  maxPerType?: number;
  compact?: boolean;
}

export const PartnersSection: React.FC<PartnersSectionProps> = ({
  partners,
  maxPerType = 3,
  compact = false,
}) => {
  const active = useMemo(
    () =>
      partners
        .filter((p) => p.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, maxPerType * 3),
    [partners, maxPerType]
  );
  const videos = active.filter((p) => p.type === 'youtube');
  const courses = active.filter((p) => p.type === 'course');
  const links = active.filter((p) => p.type === 'link');

  const [playId, setPlayId] = useState<string | null>(null);

  if (active.length === 0) return null;

  const trackClick = (p: PartnerLink) => {
    trackEvent('partner_click', { type: p.type, title: p.title, url: p.url });
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-[#0E7C7B]" /> Parceiros & Cursos
        </h3>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          {compact ? '' : 'Aprenda mais'}
        </span>
      </div>

      {/* Vídeos do YouTube */}
      {videos.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-extrabold text-[#0E7C7B] uppercase tracking-wider flex items-center gap-1.5">
            <Youtube className="w-3.5 h-3.5 text-red-500" /> Vídeos & Aulas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {videos.map((v) => {
              const ytId = youtubeIdFromUrl(v.url);
              const isPlaying = playId === v.id;
              return (
                <div
                  key={v.id}
                  className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50 group"
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
                          trackClick(v);
                        }
                      }}
                      className="w-full aspect-video relative cursor-pointer group/vid"
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
                          <Youtube className="w-8 h-8 text-red-500/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-slate-900/0 group-hover/vid:bg-slate-900/30 transition-colors flex items-center justify-center">
                        <PlayCircle className="w-10 h-10 text-white drop-shadow-lg opacity-80 group-hover/vid:opacity-100 group-hover/vid:scale-110 transition-all" />
                      </div>
                    </button>
                  )}
                  <div className="p-2.5">
                    <p className="text-[11px] font-extrabold text-slate-900 leading-snug line-clamp-2">
                      {v.title}
                    </p>
                    {v.description && (
                      <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{v.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cursos */}
      {courses.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold text-[#0E7C7B] uppercase tracking-wider flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Cursos Recomendados
          </p>
          {courses.map((c) => (
            <a
              key={c.id}
              href={c.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => trackClick(c)}
              className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 hover:border-[#0E7C7B]/40 hover:bg-[#0E7C7B]/[0.04] transition-all group"
            >
              <div className="w-9 h-9 shrink-0 rounded-lg bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center group-hover:scale-105 transition-transform">
                <GraduationCap className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-extrabold text-slate-900 truncate">{c.title}</p>
                {c.description && (
                  <p className="text-[10px] text-slate-500 truncate">{c.description}</p>
                )}
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0E7C7B] shrink-0" />
            </a>
          ))}
        </div>
      )}

      {/* Links úteis */}
      {links.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-extrabold text-[#0E7C7B] uppercase tracking-wider flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" /> Links Úteis
          </p>
          <div className="flex flex-wrap gap-1.5">
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={() => trackClick(l)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#0E7C7B] hover:text-white text-[11px] font-bold text-slate-700 transition-colors border border-slate-200 hover:border-[#0E7C7B]"
              >
                <Link2 className="w-3 h-3" /> {l.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Aviso de parceria — transparência com o visitante */}
      <div className="bg-amber-50/70 border border-amber-200/70 rounded-xl px-3 py-2.5 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
          <p className="text-[10px] text-amber-800 font-semibold leading-relaxed">
            Conteúdo de <strong>parceiros</strong>. Ao acessar, você apoia o UkeMaster
            sem pagar nada a mais (podemos receber comissão). Quer divulgar seu
            curso/canal? Fale conosco no WhatsApp. 💚
          </p>
        </div>
        <a
          href={PARTNER_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-extrabold transition-colors"
        >
          <MessageCircle className="w-3 h-3" /> Parcerias: (81) 98660-7510
        </a>
      </div>
    </div>
  );
};
