/**
 * Logo do UkeMaster Pro (SVG/texto) nas variações usadas no header e footer.
 */
import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const iconSizes = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
};

const textSizes = {
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-3xl',
};

/**
 * Logomarca oficial do UkeMaster Pro.
 * O emblema (public/logo.png) foi recortado da logomarca fornecida; ao lado
 * fica o wordmark "UKEMASTER PRO" nas cores da marca (teal + âmbar) para
 * garantir a leitura do nome em qualquer tamanho.
 */
export const Logo: React.FC<LogoProps> = ({ size = 'md' }) => {
  return (
    <div className="flex items-center gap-3 select-none" title="UkeMaster Pro">
      {/* Emblema oficial da logomarca */}
      <img
        src="/logo.png"
        alt="UkeMaster Pro"
        className={`${iconSizes[size]} object-contain shrink-0 rounded-xl`}
        draggable={false}
      />

      {/* Wordmark UkeMaster Pro — texto oculto em telas < 420px (mobile) para
          dar espaço à busca; emblema permanece sempre visível */}
      <div className="hidden min-[420px]:block">
        <div className={`font-black ${textSizes[size]} tracking-tight flex items-center leading-none`}>
          <span className="text-[#0E7C7B]">UKE</span>
          <span className="text-[#0E7C7B]">MASTER</span>
          <span className="text-[#F6AE2D] ml-1">PRO</span>
        </div>
        <div className="text-[10px] font-extrabold tracking-widest uppercase mt-0.5 flex items-center gap-1">
          <span className="text-[#F6AE2D]">★</span>
          <span className="text-[#0E7C7B]">Seu Portal do Ukulele</span>
        </div>
      </div>
    </div>
  );
};
