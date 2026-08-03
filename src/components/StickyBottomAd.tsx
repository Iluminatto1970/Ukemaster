import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, Sparkles } from 'lucide-react';
import { getAdSenseConfig, initAdSenseScript } from '../utils/adsense';

export const StickyBottomAd: React.FC = () => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const config = getAdSenseConfig();
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
        console.warn('Sticky AdSense push error:', err);
      }
    }
  }, [isLive, publisherId]);

  if (!config.enabled) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none flex flex-col items-center justify-end">
      <div className="pointer-events-auto w-full max-w-5xl mx-auto px-2 sm:px-4">
        {isMinimized ? (
          /* Minimized pill button */
          <div className="flex justify-center pb-2">
            <button
              onClick={() => setIsMinimized(false)}
              className="bg-stone-900/95 border border-stone-700/80 hover:border-amber-500/50 text-amber-400 hover:text-amber-300 text-[11px] font-bold px-3 py-1 rounded-t-xl shadow-2xl flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition-all"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Anúncios (Apoie o App Grátis)</span>
            </button>
          </div>
        ) : (
          /* Expanded Sticky Ad Banner Container */
          <div className="bg-stone-900/95 border-t border-x border-stone-800 rounded-t-2xl shadow-2xl backdrop-blur-md overflow-hidden transition-all">
            {/* Header control bar */}
            <div className="bg-stone-950/90 px-3 py-1 flex items-center justify-between border-b border-stone-800/80 text-[10px] text-stone-400">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-bold uppercase tracking-wider text-stone-300">
                  Anúncio Rodapé • Apoio ao UkeMaster
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 hover:bg-stone-800 text-stone-400 hover:text-stone-200 rounded-lg transition-colors cursor-pointer"
                  title="Minimizar anúncio"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Ad Content */}
            {isLive ? (
              <div className="p-2 flex items-center justify-center min-h-[60px] sm:min-h-[90px]">
                <ins
                  className="adsbygoogle"
                  style={{ display: 'block', width: '100%', height: '60px', textAlign: 'center' }}
                  data-ad-client={publisherId}
                  data-ad-slot={config.slotAnchorBottom || '9876543210'}
                  data-ad-format="horizontal"
                  data-full-width-responsive="true"
                />
              </div>
            ) : (
              <div className="px-4 py-2.5 flex items-center justify-between gap-3 text-left min-h-[55px]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-stone-200 flex items-center gap-2">
                      <span>Anúncio Patrocinado</span>
                    </div>
                    <p className="text-[10px] text-stone-400 hidden sm:block">
                      O UkeMaster é mantido gratuitamente graças ao apoio de patrocinadores e anunciantes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

