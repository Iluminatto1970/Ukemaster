import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'light' | 'dark' | 'auto';
  showSubtitle?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  variant = 'auto',
  showSubtitle = true,
}) => {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-3xl',
  };

  const isDarkBg = variant === 'dark';

  return (
    <div className="flex items-center gap-3 select-none">
      {/* Visual Logo Emblem with Ukulele & Shield Motif */}
      <div
        className={`${iconSizes[size]} relative rounded-2xl bg-gradient-to-br from-[#0E7C7B] via-[#095B5A] to-[#1D2D44] p-0.5 shadow-md shadow-[#0E7C7B]/30 flex items-center justify-center overflow-hidden shrink-0 group`}
      >
        {/* Outer Ring Accent */}
        <div className="absolute inset-0 border-2 border-[#F6AE2D]/40 rounded-2xl pointer-events-none" />
        
        {/* Emblem Content */}
        <div className="w-full h-full rounded-[14px] bg-[#1D2D44] flex items-center justify-center relative overflow-hidden">
          {/* Subtle Background Glow */}
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-[#F6AE2D]/20 rounded-full blur-xs" />
          <div className="absolute -bottom-2 -left-2 w-8 h-8 bg-[#F26419]/20 rounded-full blur-xs" />

          {/* Stylized Ukulele & Note SVG */}
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="w-3/4 h-3/4 drop-shadow-sm transition-transform duration-300 group-hover:scale-110"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Shield / Circle Base */}
            <circle cx="16" cy="16" r="13" stroke="#0E7C7B" strokeWidth="1.5" fill="#0E7C7B" fillOpacity="0.2" />
            <circle cx="16" cy="16" r="11" stroke="#F6AE2D" strokeWidth="0.8" strokeDasharray="2 1" />
            
            {/* Ukulele Body */}
            <path
              d="M10 21C8.5 19.5 8.5 17 10 15.5C11 14.5 12 14.5 13 15C13.5 14 14.5 13 16 13C17.5 13 18.5 14 19 15C20 14.5 21 14.5 22 15.5C23.5 17 23.5 19.5 22 21C20.5 22.5 18 22.5 16 22C14 22.5 11.5 22.5 10 21Z"
              fill="url(#ukulele-wood)"
              stroke="#F6AE2D"
              strokeWidth="0.8"
            />
            {/* Sound Hole */}
            <circle cx="16" cy="18" r="2" fill="#1D2D44" stroke="#F6AE2D" strokeWidth="0.6" />
            {/* Neck */}
            <path d="M16 13V6" stroke="#F6AE2D" strokeWidth="1.5" strokeLinecap="round" />
            {/* Headstock */}
            <rect x="14.5" y="3" width="3" height="3.5" rx="0.8" fill="#F26419" stroke="#F6AE2D" strokeWidth="0.6" />
            {/* Tuning Pegs */}
            <circle cx="13.5" cy="4" r="0.8" fill="#F6AE2D" />
            <circle cx="18.5" cy="4" r="0.8" fill="#F6AE2D" />
            <circle cx="13.5" cy="5.8" r="0.8" fill="#F6AE2D" />
            <circle cx="18.5" cy="5.8" r="0.8" fill="#F6AE2D" />
            {/* Bridge */}
            <line x1="14" y1="20.5" x2="18" y2="20.5" stroke="#1D2D44" strokeWidth="1" strokeLinecap="round" />

            {/* Little Music Note */}
            <path
              d="M23 8V11.5C22.6 11.2 22.1 11 21.5 11C20.7 11 20 11.7 20 12.5C20 13.3 20.7 14 21.5 14C22.3 14 23 13.3 23 12.5V9.5L25.5 8.5V7L23 8Z"
              fill="#F6AE2D"
            />

            {/* Gradients */}
            <defs>
              <linearGradient id="ukulele-wood" x1="10" y1="13" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F26419" />
                <stop offset="0.5" stopColor="#F6AE2D" />
                <stop offset="1" stopColor="#0E7C7B" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      {/* Brand Name Typography */}
      <div>
        <div className={`font-black ${textSizes[size]} tracking-tight flex items-center leading-none`}>
          <span className="text-[#F26419]">UKE</span>
          <span className={isDarkBg ? 'text-white' : 'text-[#1D2D44]'}>MASTER</span>
        </div>
        {showSubtitle && (
          <div className="text-[10px] font-extrabold tracking-widest uppercase mt-0.5 flex items-center gap-1">
            <span className="text-[#F6AE2D]">★</span>
            <span className={isDarkBg ? 'text-teal-100/80' : 'text-[#0E7C7B]'}>
              Portal do Ukulele
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
