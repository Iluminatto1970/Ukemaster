import React, { useEffect, useRef } from 'react';
import { Sparkles, Info } from 'lucide-react';
import { getAdSenseConfig, initAdSenseScript } from '../utils/adsense';

interface AdSenseSlotProps {
  slotId?: string;
  format?: 'horizontal' | 'rectangle' | 'inline' | 'in-article';
  className?: string;
  label?: string;
}

export const AdSenseSlot: React.FC<AdSenseSlotProps> = ({
  slotId,
  format = 'horizontal',
  className = '',
  label = 'Anúncio Publicitário',
}) => {
  const config = getAdSenseConfig();
  const adRef = useRef<HTMLDivElement>(null);
  const pushedRef = useRef<boolean>(false);

  const publisherId = config.publisherId || import.meta.env.VITE_ADSENSE_CLIENT_ID || '';
  const isLive = Boolean(config.enabled && publisherId && publisherId.startsWith('ca-pub-'));

  useEffect(() => {
    if (isLive && publisherId) {
      initAdSenseScript(publisherId);
      try {
        if (!pushedRef.current) {
          // @ts-ignore
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          pushedRef.current = true;
        }
      } catch (err) {
        console.warn('AdSense push error:', err);
      }
    }
  }, [isLive, publisherId]);

  if (!config.enabled) {
    return null;
  }

  // Format styles
  const formatClasses = {
    horizontal: 'w-full min-h-[90px] sm:min-h-[100px]',
    rectangle: 'w-full max-w-[336px] min-h-[280px] mx-auto',
    inline: 'w-full min-h-[60px] sm:min-h-[75px]',
    'in-article': 'w-full min-h-[120px] sm:min-h-[160px]',
  };

  return (
    <div
      ref={adRef}
      className={`relative my-4 rounded-2xl overflow-hidden border transition-all ${
        isLive
          ? 'border-stone-800/80 bg-stone-900/60'
          : 'border-slate-200/80 bg-slate-50/80 shadow-2xs'
      } ${formatClasses[format]} ${className}`}
    >
      {/* Top Label Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-100/90 border-b border-slate-200/80 text-[10px] text-slate-500 font-medium tracking-wide">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500/80 animate-pulse" />
          <span className="uppercase tracking-widest text-slate-600 font-bold">{label}</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-slate-400 flex items-center gap-1">
            <Info className="w-3 h-3 text-slate-400" />
            <span>Publicidade</span>
          </span>
        </div>
      </div>

      {/* Main Ad Area */}
      {isLive ? (
        <div className="p-2 flex items-center justify-center min-h-[80px]">
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: '100%', textAlign: 'center' }}
            data-ad-client={publisherId}
            data-ad-slot={slotId || '1234567890'}
            data-ad-format={format === 'rectangle' ? 'rectangle' : 'auto'}
            data-full-width-responsive="true"
          />
        </div>
      ) : (
        /* Quiet Public Placeholder View */
        <div className="p-4 flex items-center justify-between gap-3 min-h-[80px]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 text-orange-600">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">
                Anúncio Patrocinado
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Apoie o UkeMaster — Plataforma de cifras 100% gratuita para tocadores de ukulele.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

