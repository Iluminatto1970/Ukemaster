/**
 * Painel de widgets do lado DIREITO da tela (Cifra do Dia, Dica do Dia,
 * Comunidade WhatsApp e Canal do YouTube): divididos para cá, fora do menu —
 * TODOS visíveis empilhados, com a ORDEM SORTEADA no carregamento e
 * REORDENANDO sozinha a cada 15s. Sem carrossel e sem botão: nenhuma
 * interação do usuário.
 *
 * O widget do YouTube mostra as publicações mais recentes do canal oficial
 * (via /api/youtube-channel-videos → feed RSS + innertube, sem API key):
 * vídeos E shorts — o destaque troca junto com a rotação de 15s, abaixo
 * vêm as 4 últimas publicações (vídeos e shorts) e o rank dos mais vistos;
 * uma publicação nova aparece sozinha em até ~5 min, sem deploy. Shorts
 * têm badge próprio e link /shorts/ (vídeos seguem /watch).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Clock, Lightbulb, MessageCircle, Play, Star, TrendingUp, X, Youtube, ExternalLink } from 'lucide-react';
import { Song } from '../types';
import { useT } from '../lib/i18n';
import { getTipOfTheDay } from '../lib/sidebarTips';
import {
  ChannelVideo,
  FALLBACK_VIDEOS,
  YOUTUBE_CHANNEL_HANDLE,
  YOUTUBE_CHANNEL_URL,
} from '../lib/youtubeChannel';
import { AdSenseSlot } from './AdSenseSlot';

/** Intervalo da reordenação automática (ms). */
const ROTATION_MS = 15000;

/** Considera "novo" o vídeo publicado nos últimos 14 dias (badge NOVO). */
const NEW_VIDEO_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

interface SideWidgetsProps {
  /** Cifra em destaque do dia (preenchida pelo App — abre ao clicar). */
  featuredSong?: Song | null;
  onSelectFeaturedSong?: (song: Song) => void;
}

type WidgetKind = 'featured' | 'tip' | 'whatsapp' | 'youtube';

/** Embaralha a lista (Fisher–Yates) — sorteio uniforme a cada chamada. */
function shuffleArray<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Número compacto ("1,2 mil") no idioma atual — Intl nativo. */
function formatViews(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}

/** Tempo relativo curto ("há 2 dias") no idioma atual — Intl nativo. */
function formatRelativeTime(iso: string, lang: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.round(diffMs / 60_000);
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    if (minutes < 1) return rtf.format(0, 'minute');
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return rtf.format(-days, 'day');
    const months = Math.round(days / 30);
    if (months < 12) return rtf.format(-months, 'month');
    return rtf.format(-Math.round(months / 12), 'year');
  } catch {
    return '';
  }
}

export const SideWidgets: React.FC<SideWidgetsProps> = ({
  featuredSong,
  onSelectFeaturedSong,
}) => {
  const { t, lang } = useT();
  const tipOfTheDay = useMemo(() => getTipOfTheDay(t), [t]);

  // ── Vídeos do canal do YouTube ────────────────────────────────────────
  // Começa com o vídeo de segurança (render imediato) e substitui pela
  // lista real assim que /api/youtube-channel-videos responder. Se falhar,
  // mantém o fallback — o card nunca fica vazio.
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>(FALLBACK_VIDEOS);
  const [videoIndex, setVideoIndex] = useState<number>(0);
  // Publicação em reprodução no embed (modal) — null = fechado.
  const [playingVideo, setPlayingVideo] = useState<ChannelVideo | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/youtube-channel-videos')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && Array.isArray(d.videos) && d.videos.length > 0) {
          setChannelVideos(d.videos);
        }
      })
      .catch(() => {
        // offline/erro — segue com o fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fecha o embed com ESC.
  useEffect(() => {
    if (!playingVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlayingVideo(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playingVideo]);

  // Widgets disponíveis (a cifra do dia só entra se existir; o YouTube
  // sempre entra — tem fallback)
  const available = useMemo<WidgetKind[]>(() => {
    const list: WidgetKind[] = ['featured', 'tip', 'whatsapp', 'youtube'];
    return featuredSong ? list : list.filter((k) => k !== 'featured');
  }, [featuredSong]);

  // Ordem de exibição — sorteada no carregamento
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

  // REORDENAÇÃO AUTOMÁTICA: a cada 15s a ordem muda sozinha (sem carrossel)
  // e, se houver mais de um vídeo do canal, o vídeo em destaque também
  // troca. Só roda com a aba VISÍVEL — em segundo plano pausa (economia +
  // o leitor não vê os cards pularem ao voltar).
  useEffect(() => {
    if (available.length <= 1) return;
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setOrder((prev) => {
        let next = shuffleArray(prev);
        // Evita repetir a mesma ordem consecutivamente (se houver mais de 1)
        if (next.join() === prev.join()) next = shuffleArray(prev);
        return next;
      });
      setVideoIndex((prev) =>
        channelVideos.length > 1 ? (prev + 1) % channelVideos.length : 0
      );
    }, ROTATION_MS);
    return () => clearInterval(timer);
  }, [available.length, channelVideos.length]);

  const renderCard = (kind: WidgetKind) => {
    if (kind === 'featured' && featuredSong) {
      return (
        <button
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
        <div className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-sm">
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

    if (kind === 'youtube') {
      const video =
        channelVideos[videoIndex % channelVideos.length] ??
        channelVideos[0] ??
        FALLBACK_VIDEOS[0];
      const isNewest = channelVideos[0]?.id === video.id;
      const isNew =
        isNewest && Date.now() - new Date(video.publishedAt).getTime() < NEW_VIDEO_WINDOW_MS;

      // 4 publicações mais recentes (vídeos + shorts — o feed já vem
      // ordenado por data de publicação).
      const latest = channelVideos.slice(0, 4);
      // Rank dos mais vistos: top 4 por visualizações (só entra quem tem
      // views — quando o innertube não respondeu, a seção some).
      const rank = [...channelVideos]
        .filter((v) => v.views != null)
        .sort((a, b) => (b.views as number) - (a.views as number))
        .slice(0, 4);

      const thumbBadge = (v: ChannelVideo) =>
        v.kind === 'short' ? (
          <span className="absolute bottom-0 right-0 rounded-sm bg-red-600 px-1 py-px text-[7px] font-black uppercase tracking-wide text-white">
            {t('sidebar.ytShort')}
          </span>
        ) : null;

      // Abre o player embutido na própria página (modal) em vez de nova aba.
      const openVideo = (e: React.MouseEvent, v: ChannelVideo) => {
        e.preventDefault();
        setPlayingVideo(v);
      };

      return (
        <div className="rounded-2xl bg-[#1D2D44] border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Destaque → abre o player embutido na própria página */}
          <a
            href={video.url}
            onClick={(e) => openVideo(e, video)}
            title={video.title}
            className="relative block aspect-video w-full group"
          >
            <img
              src={video.thumbnail}
              alt={video.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/25 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600/90 shadow-lg transition-transform group-hover:scale-110">
                <Play className="h-5 w-5 fill-white text-white" />
              </span>
            </span>
            {isNew && (
              <span className="absolute left-2 top-2 rounded-full bg-[#F26419] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
                {t('sidebar.ytNew')}
              </span>
            )}
            {video.kind === 'short' && (
              <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
                {t('sidebar.ytShort')}
              </span>
            )}
          </a>

          <div className="p-3">
            <p className="text-[12px] font-extrabold leading-snug text-white line-clamp-2">
              {video.title}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400 truncate">
              <Youtube className="w-3 h-3 text-red-500 shrink-0" />
              <span className="truncate">
                {YOUTUBE_CHANNEL_HANDLE}
                {video.publishedAt ? ` · ${formatRelativeTime(video.publishedAt, lang)}` : ''}
                {video.views != null
                  ? ` · ${formatViews(video.views, lang)} ${t('sidebar.ytViews')}`
                  : ''}
              </span>
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <a
                href={video.url}
                onClick={(e) => openVideo(e, video)}
                className="inline-flex flex-1 items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-[10px] font-extrabold text-white transition-colors"
              >
                <Play className="w-3 h-3 fill-white" /> {t('sidebar.ytWatch')}
              </a>
              <a
                href={YOUTUBE_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-extrabold text-white transition-colors"
              >
                <Youtube className="w-3 h-3 text-red-500" /> {t('sidebar.ytChannel')}
              </a>
            </div>
          </div>

          {/* 4 últimas publicações (vídeos + shorts) */}
          {latest.length > 0 && (
            <div className="border-t border-white/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <Clock className="w-3 h-3" /> {t('sidebar.ytLatest')}
              </p>
              <div className="mt-1 flex flex-col">
                {latest.map((v) => (
                  <a
                    key={v.id}
                    href={v.url}
                    onClick={(e) => openVideo(e, v)}
                    title={v.title}
                    className="group/row flex items-center gap-2 rounded-lg -mx-1 px-1 py-1.5 hover:bg-white/5"
                  >
                    <span className="relative shrink-0">
                      <img
                        src={v.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-11 w-16 rounded-md bg-white/10 object-cover"
                      />
                      {thumbBadge(v)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold leading-tight text-white line-clamp-1">
                        {v.title}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-medium text-slate-400 truncate">
                        {v.kind === 'short' ? t('sidebar.ytShort') : t('sidebar.ytVideo')}
                        {v.publishedAt ? ` · ${formatRelativeTime(v.publishedAt, lang)}` : ''}
                        {v.views != null
                          ? ` · ${formatViews(v.views, lang)} ${t('sidebar.ytViews')}`
                          : ''}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Rank: mais vistos no YouTube */}
          {rank.length > 0 && (
            <div className="border-t border-white/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <TrendingUp className="w-3 h-3 text-[#F6AE2D]" /> {t('sidebar.ytTop')}
              </p>
              <div className="mt-1 flex flex-col">
                {rank.map((v, i) => (
                  <a
                    key={v.id}
                    href={v.url}
                    onClick={(e) => openVideo(e, v)}
                    title={v.title}
                    className="group/row flex items-center gap-2 rounded-lg -mx-1 px-1 py-1.5 hover:bg-white/5"
                  >
                    <span className="w-4 shrink-0 text-center text-[11px] font-black text-[#F6AE2D]">
                      {i + 1}
                    </span>
                    <span className="relative shrink-0">
                      <img
                        src={v.thumbnail}
                        alt=""
                        loading="lazy"
                        className="h-10 w-14 rounded-md bg-white/10 object-cover"
                      />
                      {thumbBadge(v)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] font-bold leading-tight text-white line-clamp-1">
                        {v.title}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-medium text-slate-400 truncate">
                        {v.views != null
                          ? `${formatViews(v.views, lang)} ${t('sidebar.ytViews')}`
                          : ''}
                        {v.publishedAt
                          ? ` · ${formatRelativeTime(v.publishedAt, lang)}`
                          : ''}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <>
    <aside
      className="w-full lg:w-64 xl:w-72 shrink-0 flex flex-col gap-3"
      aria-label={t('sidebar.widgets')}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <Star className="w-3 h-3 text-[#F6AE2D]" /> {t('sidebar.widgets')}
      </div>

      {/* TODOS os widgets, na ordem sorteada/rotativa. Responsivo: quando o
          painel ocupa a largura toda (< lg), os cards ficam em 2 colunas em
          telas médias; ao lado do conteúdo (lg+) voltam a 1 coluna. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        {order.map((kind) => (
          <div key={kind} className="min-w-0">
            {renderCard(kind)}
          </div>
        ))}
      </div>

      {/* Anúncio do AdSense — retângulo de sidebar, logo abaixo dos widgets.
          Mesmo padrão do StickyBottomAd: o slot é renderizado sempre e o
          Google só serve o anúncio quando a conta for aprovada (aí basta
          ligar ADSENSE_APPROVED no config.ts para a Monetag desligar). O
          min-h evita o layout "pular" quando o anúncio carregar. */}
      <div className="min-h-[100px]">
        <AdSenseSlot format="rectangle" label="" className="min-h-[100px]" />
      </div>
    </aside>

    {/* Player embutido: assiste na própria página (modal), sem sair do site.
        Fecha com o X, clicando fora ou com ESC. O iframe usa /embed do
        YouTube (funciona para vídeos e shorts) — liberado no CSP. */}
    {playingVideo && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={playingVideo.title}
        onClick={() => setPlayingVideo(null)}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-3xl overflow-hidden rounded-2xl bg-[#0F172A] shadow-2xl"
        >
          <div className="relative aspect-video w-full bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${playingVideo.id}?autoplay=1&rel=0`}
              title={playingVideo.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
            <button
              onClick={() => setPlayingVideo(null)}
              aria-label={t('sidebar.ytClose')}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 p-3">
            <p className="min-w-0 truncate text-xs font-bold text-white">
              {playingVideo.title}
            </p>
            <a
              href={playingVideo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[10px] font-extrabold text-white transition-colors hover:bg-white/20"
            >
              {t('sidebar.ytOpen')} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    )}
  </>
);
};
