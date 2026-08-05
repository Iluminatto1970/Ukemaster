/**
 * Splash screen de abertura do UkeMaster Pro.
 *
 * Reproduz a identidade visual das capas de destaque (preview social):
 * gradiente teal profundo, decorações circulares âmbar, o emblema oficial
 * (public/logo.png), o wordmark UKEMASTER PRO (teal + âmbar) e o subtítulo
 * "Seu Portal do Ukulele". Aparece no boot do app e some com fade suave.
 */
import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  /** Tempo (ms) que o splash fica visível antes do fade-out. */
  duration?: number;
  /** Chamado quando o fade-out termina (remove o splash do DOM). */
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  duration = 2000,
  onFinish,
}) => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Fase 1: após `duration`, inicia o fade-out (opacidade → 0)
    const fadeTimer = window.setTimeout(() => setHidden(true), duration);
    // Fase 2: após o fade (600ms), avisa o App para desmontar o splash
    const finishTimer = window.setTimeout(() => onFinish?.(), duration + 600);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(finishTimer);
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

        {/* Rodapé */}
        <p className="mt-10 text-xs font-extrabold tracking-[0.35em] uppercase text-white/85">
          ukemaster<span className="text-[#F6AE2D]">pro</span>.com
        </p>
      </div>
    </div>
  );
};
