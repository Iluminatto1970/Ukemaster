/**
 * Splash screen de abertura do UkeMaster Pro.
 *
 * Homenagem a Israel Kamakawiwo'ole (1959-1997) — o músico que inspirou o
 * projeto. O splash fica ~30s com o VÍDEO oficial em tela cheia ao fundo
 * (trecho em que ele inicia a voz em "Somewhere Over the Rainbow",
 * ~0:04→0:34), com overlay translúcido e os textos por cima — tudo tocando
 * automaticamente, sem precisar clicar (fallback de 1 clique só se o
 * navegador bloquear autoplay). Homenagem assinada pelo fundador.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useT, LANGS } from '../lib/i18n';

interface SplashScreenProps {
  /** Tempo (ms) que o splash fica visível antes do fade-out. */
  duration?: number;
  /** Chamado quando o fade-out termina (remove o splash do DOM). */
  onFinish?: () => void;
}

/** Vídeo oficial de Israel Kamakawiwo'ole — "Somewhere Over the Rainbow". */
const TRIBUTE_VIDEO_ID = 'Z26BvHOD_sg';
/** Trecho em que ele INICIA a voz (a cappella) — antes do ukulele entrar. */
const TRIBUTE_START_SECONDS = 4;
const TRIBUTE_END_SECONDS = 34; // ~30s de música

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  duration = 30000,
  onFinish,
}) => {
  const { t, lang, setLang } = useT();
  const [hidden, setHidden] = useState(false);
  const [userNeedsClick, setUserNeedsClick] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const checkTimerRef = useRef<number | null>(null);

  // ── Vídeo de fundo: trecho da voz de Israel (4s→34s), autoplay ──────────
  useEffect(() => {
    const onReady = (e: { target: YTPlayer }) => {
      playerRef.current = e.target;
      // Autoplay pode ser bloqueado pelo navegador (sem interação prévia).
      // Tenta tocar; se em ~1.5s ainda não estiver tocando, pede 1 clique.
      e.target.playVideo();
      checkTimerRef.current = window.setTimeout(() => {
        setUserNeedsClick(true);
      }, 1500);
    };

    const createPlayer = () => {
      if (!window.YT?.Player) return;
      new window.YT.Player('splash-youtube-player', {
        videoId: TRIBUTE_VIDEO_ID,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          start: TRIBUTE_START_SECONDS,
          end: TRIBUTE_END_SECONDS,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          modestbranding: 1,
          loop: 1,
          playlist: TRIBUTE_VIDEO_ID,
        },
        events: { onReady },
      });
    };

    if (window.YT?.Player) {
      createPlayer();
    } else {
      // Carrega a IFrame Player API do YouTube sob demanda
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      window.onYouTubeIframeAPIReady = createPlayer;
      document.head.appendChild(tag);
    }

    // Fase 1: após `duration`, inicia o fade-out (opacidade → 0)
    const fadeTimer = window.setTimeout(() => {
      setHidden(true);
      playerRef.current?.pauseVideo();
    }, duration);
    // Fase 2: após o fade (600ms), avisa o App para desmontar o splash
    const finishTimer = window.setTimeout(() => onFinish?.(), duration + 600);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
      if (checkTimerRef.current) window.clearTimeout(checkTimerRef.current);
      playerRef.current?.pauseVideo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden text-white transition-opacity duration-600 ease-out flex flex-col items-center justify-center ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background:
          'linear-gradient(160deg, #0E7C7B 0%, #0A5F5E 55%, #074A49 100%)',
      }}
      aria-hidden={hidden}
    >
      {/* Seletor de idioma: o visitante troca a língua da homenagem antes
          de entrar (usa o mesmo LANGS/setLang do header — persiste). */}
      <div
        className="absolute top-4 right-4 z-20 flex items-center gap-1 rounded-full bg-black/25 backdrop-blur-sm px-2 py-1.5 shadow-lg animate-splash-rise"
        role="group"
        aria-label={t('header.language')}
      >
        {LANGS.map((l) => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            title={l.label}
            aria-label={l.label}
            aria-pressed={lang === l.id}
            className={`text-base sm:text-lg leading-none rounded-full transition-all duration-150 cursor-pointer select-none ${
              lang === l.id
                ? 'scale-125 drop-shadow-[0_2px_6px_rgba(246,174,45,0.8)] ring-2 ring-[#F6AE2D]/80 bg-white/15'
                : 'opacity-55 hover:opacity-100 hover:scale-110 grayscale-[35%] hover:grayscale-0'
            }`}
          >
            {l.flag}
          </button>
        ))}
      </div>

      {/* Player do YouTube em TELA CHEIA (vídeo de fundo) */}
      <div
        id="splash-youtube-player"
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Overlay translúcido: mantém o vídeo visível mas garante leitura do texto */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background:
            'linear-gradient(180deg, rgba(7,50,49,0.55) 0%, rgba(7,74,73,0.35) 45%, rgba(4,40,39,0.72) 100%)',
        }}
      />

      {/* Conteúdo por cima do vídeo */}
      <div className="relative z-10 flex flex-col items-center px-8 text-center">
        {/* Emblema oficial com animação de entrada */}
        <img
          src="/logo.png"
          alt="UkeMaster Pro"
          draggable={false}
          className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.45)] animate-splash-pop"
        />

        {/* Wordmark */}
        <h1 className="mt-6 font-black text-4xl sm:text-5xl tracking-tight leading-none flex items-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.55)] animate-splash-rise">
          <span className="text-white">UKE</span>
          <span className="text-white">MASTER</span>
          <span className="text-[#F6AE2D] ml-2">PRO</span>
        </h1>

        {/* Divisor com ukulele */}
        <div className="mt-5 flex items-center gap-4 animate-splash-rise">
          <span className="h-1 w-16 sm:w-24 rounded-full bg-gradient-to-r from-transparent to-[#F6AE2D]" />
          <span className="text-3xl">🪕</span>
          <span className="h-1 w-16 sm:w-24 rounded-full bg-gradient-to-l from-transparent to-[#F6AE2D]" />
        </div>

        {/* Subtítulo */}
        <p className="mt-5 text-sm sm:text-base font-bold tracking-widest uppercase text-[#F6AE2D] animate-splash-rise">
          {t('splash.tagline')}
        </p>

        {/* Indicador de áudio (ondas animadas) */}
        <div className="mt-6 flex items-end gap-1 h-6 animate-splash-rise" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1.5 rounded-full bg-[#F6AE2D]/80"
              style={{
                height: `${10 + (i % 3) * 7}px`,
                animation: `splash-wave 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* Botão de tocar (fallback se o navegador bloquear autoplay) */}
        {userNeedsClick && (
          <button
            onClick={() => {
              playerRef.current?.playVideo();
              setUserNeedsClick(false);
            }}
            className="mt-3 px-5 py-2 rounded-full bg-[#F26419] hover:bg-[#D9530D] text-white text-xs font-extrabold tracking-wider uppercase shadow-lg transition-colors cursor-pointer animate-splash-rise"
          >
            {t('splash.playCta')}
          </button>
        )}

        {/* HOMENAGEM a Israel Kamakawiwo'ole */}
        <div className="mt-7 max-w-lg animate-splash-rise">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] text-[#F6AE2D]/90">
            {t('splash.tribute')}
          </p>
          <p className="mt-2 text-base sm:text-lg font-black text-white leading-snug drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {t('splash.tributeName')}
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-white/90 font-medium leading-relaxed">
            {t('splash.tributeYears')}
          </p>
          <p className="mt-3 text-[11px] sm:text-xs text-white/85 font-medium leading-relaxed drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            {t('splash.tributeBodyA')}<span className="text-[#F6AE2D] font-extrabold">{t('splash.tributeBodyHighlight')}</span>{t('splash.tributeBodyB')}
          </p>
          <p className="mt-3 text-xs sm:text-sm font-black tracking-wide text-[#F6AE2D] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            {t('splash.signed')}
          </p>
        </div>
      </div>

      {/* Rodapé */}
      <p className="relative z-10 mt-6 mb-5 text-[10px] font-extrabold tracking-[0.35em] uppercase text-white/80 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
        ukemaster<span className="text-[#F6AE2D]">pro</span>.com
      </p>

      <style>{`
        @keyframes splash-wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.2); }
        }
      `}</style>
    </div>
  );
};
