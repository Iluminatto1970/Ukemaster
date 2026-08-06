/**
 * Splash screen de abertura do UkeMaster Pro.
 *
 * Homenagem a Israel Kamakawiwo'ole (1959-1997) — o músico que inspirou o
 * projeto. O splash fica ~30s tocando o trecho em que ele inicia a
 * voz em "Somewhere Over the Rainbow" (vídeo oficial, ~0:04→0:34), com a
 * homenagem assinada pelo fundador.
 */
import React, { useEffect, useRef, useState } from 'react';

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
  const [hidden, setHidden] = useState(false);
  const [userNeedsClick, setUserNeedsClick] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const startClickedRef = useRef(false);

  // ── Áudio: toca o trecho da voz de Israel (4s→14s) ──────────────────────
  useEffect(() => {
    const startPlayback = () => {
      startClickedRef.current = true;
      setUserNeedsClick(false);
      playerRef.current?.playVideo();
    };

    const onReady = (e: { target: YTPlayer }) => {
      playerRef.current = e.target;
      // Autoplay pode ser bloqueado pelo navegador (sem interação prévia).
      // Tenta tocar; se em ~1.5s ainda não estiver tocando, pede 1 clique.
      e.target.playVideo();
      const check = window.setTimeout(() => {
        if (!startClickedRef.current) setUserNeedsClick(true);
      }, 1500);
      window.setTimeout(() => window.clearTimeout(check), duration);
    };

    const createPlayer = () => {
      if (!window.YT?.Player) return;
      new window.YT.Player('splash-youtube-player', {
        videoId: TRIBUTE_VIDEO_ID,
        width: '1',
        height: '1',
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
      playerRef.current?.pauseVideo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center text-white transition-opacity duration-600 ease-out ${
        hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background:
          'linear-gradient(160deg, #0E7C7B 0%, #0A5F5E 55%, #074A49 100%)',
      }}
      aria-hidden={hidden}
    >
      {/* Decorações de fundo (círculos âmbar/laranja translúcidos + anel) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 12% 8%, rgba(246,174,45,0.14), transparent 32%),' +
            'radial-gradient(circle at 88% 92%, rgba(242,100,25,0.16), transparent 36%),' +
            'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.05), transparent 60%)',
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          width: 'min(90vw, 560px)',
          height: 'min(90vw, 560px)',
          border: '3px solid rgba(246,174,45,0.16)',
        }}
      />

      {/* Player invisível do YouTube (apenas áudio do trecho) */}
      <div
        id="splash-youtube-player"
        aria-hidden
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      />

      {/* Conteúdo */}
      <div className="relative z-10 flex flex-col items-center px-8 text-center">
        {/* Emblema oficial com animação de entrada */}
        <img
          src="/logo.png"
          alt="UkeMaster Pro"
          draggable={false}
          className="w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)] animate-splash-pop"
        />

        {/* Wordmark */}
        <h1 className="mt-6 font-black text-4xl sm:text-5xl tracking-tight leading-none flex items-center animate-splash-rise">
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
          ★ Seu Portal do Ukulele
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
            ▶ Ouvir homenagem
          </button>
        )}

        {/* HOMENAGEM a Israel Kamakawiwo'ole */}
        <div className="mt-7 max-w-lg animate-splash-rise">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] text-[#F6AE2D]/90">
            Em homenagem
          </p>
          <p className="mt-2 text-base sm:text-lg font-black text-white leading-snug">
            Israel Kamakawiwo'ole
          </p>
          <p className="mt-1 text-[11px] sm:text-xs text-white/85 font-medium leading-relaxed">
            (1959 — 1997) — "Somewhere Over the Rainbow"
          </p>
          <p className="mt-3 text-[11px] sm:text-xs text-white/75 font-medium leading-relaxed">
            Ele foi o grande <span className="text-[#F6AE2D] font-extrabold">incentivador do meu
            ingresso no ukulele</span> — este projeto nasceu da sua música.
          </p>
          <p className="mt-3 text-xs sm:text-sm font-black tracking-wide text-[#F6AE2D]">
            — Iluminatto Moraes
          </p>
        </div>
      </div>

      {/* Rodapé */}
      <p className="relative z-10 mt-6 text-[10px] font-extrabold tracking-[0.35em] uppercase text-white/60">
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
