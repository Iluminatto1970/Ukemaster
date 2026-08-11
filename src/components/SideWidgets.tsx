/**
 * Painel de widgets do lado DIREITO da tela (Cifra do Dia, Dica do Dia,
 * Comunidade WhatsApp): TODOS eles são divididos para cá, fora do menu, e
 * exibidos em ORDEM SORTEADA a cada carregamento — o botão ⤨ embaralha a
 * ordem. A sidebar fica só com o menu.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Lightbulb, MessageCircle, Play, Shuffle, Star } from 'lucide-react';
import { Song } from '../types';
import { useT } from '../lib/i18n';
import { getTipOfTheDay } from '../lib/sidebarTips';

interface SideWidgetsProps {
  /** Cifra em destaque do dia (preenchida pelo App — abre ao clicar). */
  featuredSong?: Song | null;
  onSelectFeaturedSong?: (song: Song) => void;
}

type WidgetKind = 'featured' | 'tip' | 'whatsapp';

/** Embaralha a lista (Fisher–Yates) — sorteio uniforme a cada chamada. */
function shuffleArray<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const SideWidgets: React.FC<SideWidgetsProps> = ({
  featuredSong,
  onSelectFeaturedSong,
}) => {
  const { t } = useT();
  const tipOfTheDay = useMemo(() => getTipOfTheDay(t), [t]);

  // Widgets disponíveis (a cifra do dia só entra se existir)
  const available = useMemo<WidgetKind[]>(() => {
    const list: WidgetKind[] = ['featured', 'tip', 'whatsapp'];
    return featuredSong ? list : list.filter((k) => k !== 'featured');
  }, [featuredSong]);

  // Ordem de exibição — SORTEADA a cada carregamento da página
  const [order, setOrder] = useState<WidgetKind[]>(() =>
    shuffleArray(available.length ? available : ['tip'])
  );

  // Se um widget deixar de existir (ex.: a cifra em destaque sumiu), remove
  // da lista preservando a ordem dos que sobraram.
  useEffect(() => {
    setOrder((prev) => {
      const filtered = prev.filter((k) => available.includes(k));
      return filtered.length ? filtered : ['tip'];
    });
  }, [available]);

  const reshuffle = () => {
    if (available.length <= 1) return;
    let next = shuffleArray(available);
    // Evita repetir a mesma ordem (se possível)
    if (next.join() === order.join()) next = shuffleArray(available);
    setOrder(next);
  };

  return (
    <aside
      className="w-full lg:w-64 xl:w-72 shrink-0 flex flex-col gap-3"
      aria-label={t('sidebar.widgets')}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <Star className="w-3 h-3 text-[#F6AE2D]" /> {t('sidebar.widgets')}
        </span>
        <button
          onClick={reshuffle}
          title={t('sidebar.shuffle')}
          aria-label={t('sidebar.shuffle')}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#F26419] hover:bg-orange-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
        >
          <Shuffle className="w-3.5 h-3.5" /> {t('sidebar.shuffle')}
        </button>
      </div>

      {order.map((kind) => {
        if (kind === 'featured' && featuredSong) {
          return (
            <button
              key={kind}
              onClick={() => onSelectFeaturedSong?.(featuredSong)}
              title={`Abrir cifra: ${featuredSong.title} — ${featuredSong.artist}`}
              className="w-full text-left rounded-2xl bg-gradient-to-br from-[#F26419] via-[#F26419] to-[#F6AE2D] p-4 shadow-lg shadow-orange-900/20 hover:brightness-110 active:scale-[0.99] transition-all cursor-pointer group"
            >
              <p className="text-[9px] font-black text-white/85 uppercase tracking-widest">
                {t('sidebar.songOfDay')}
              </p>
              <p className="text-base font-black text-white leading-tight mt-1 line-clamp-2">
                {featuredSong.title}
              </p>
              <p className="text-xs font-semibold text-white/85 mt-0.5 truncate">
                {featuredSong.artist}
              </p>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/25 text-white font-bold">
                  {t('sidebar.key')} {featuredSong.key || 'C'}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-black text-white group-hover:gap-1.5 transition-all">
                  <Play className="w-3 h-3 fill-current" /> {t('sidebar.play')}
                </span>
              </div>
            </button>
          );
        }

        if (kind === 'tip') {
          return (
            <div
              key={kind}
              className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black text-[#F26419] uppercase tracking-widest mb-2">
                <Lightbulb className="w-3.5 h-3.5" /> {t('sidebar.tipOfDay')}
              </div>
              <p className="text-sm leading-snug text-slate-700">{tipOfTheDay}</p>
            </div>
          );
        }

        if (kind === 'whatsapp') {
          return (
            <a
              key={kind}
              href="https://chat.whatsapp.com/BrEFW78LBkLKhQUQKaWcuj"
              target="_blank"
              rel="noopener noreferrer"
              className="group block w-full rounded-2xl bg-gradient-to-br from-[#25D366]/95 to-[#128C7E] p-4 shadow-lg shadow-emerald-900/20 hover:brightness-110 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <img
                    src="/logo.png"
                    alt="UkeMaster Pro"
                    className="h-10 w-10 object-contain rounded-xl bg-white/95 p-0.5 shrink-0"
                    draggable={false}
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white shadow-sm">
                    <MessageCircle className="h-3 w-3 text-[#25D366] fill-[#25D366]/20" />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-white uppercase tracking-wide leading-tight">
                    {t('sidebar.waCommunity')}
                  </span>
                  <span className="block text-[11px] font-medium text-white/85 leading-snug mt-0.5 line-clamp-2">
                    {t('sidebar.waCommunityDesc')}
                  </span>
                </span>
              </div>
            </a>
          );
        }

        return null;
      })}
    </aside>
  );
};
