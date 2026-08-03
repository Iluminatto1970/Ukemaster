import React, { useState } from 'react';
import { extractYouTubeId } from '../utils/chordUtils';
import { Youtube, Minimize2, Maximize2, ExternalLink, X } from 'lucide-react';

interface YouTubePlayerProps {
  youtubeUrlOrId?: string;
  songTitle?: string;
  isFloating?: boolean;
  onCloseFloating?: () => void;
}

export const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  youtubeUrlOrId,
  songTitle = 'Vídeo da Música',
  isFloating = false,
  onCloseFloating,
}) => {
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const videoId = extractYouTubeId(youtubeUrlOrId || '');

  if (!videoId) {
    return null;
  }

  const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0`;

  if (isFloating) {
    return (
      <div
        className={`fixed bottom-4 right-4 z-50 bg-stone-900 border border-amber-500/40 rounded-2xl shadow-2xl transition-all overflow-hidden ${
          isMinimized ? 'w-64' : 'w-80 sm:w-96'
        }`}
      >
        {/* Floating Header */}
        <div className="bg-stone-950 px-3 py-2 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 truncate">
            <Youtube className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-xs font-bold text-stone-200 truncate">{songTitle}</span>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-stone-400 hover:text-amber-400 rounded cursor-pointer"
              title="Abrir no YouTube"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 text-stone-400 hover:text-stone-100 rounded cursor-pointer"
              title={isMinimized ? 'Expandir' : 'Minimizar'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            {onCloseFloating && (
              <button
                onClick={onCloseFloating}
                className="p-1 text-stone-400 hover:text-rose-400 rounded cursor-pointer"
                title="Fechar Player"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Video Frame */}
        {!isMinimized && (
          <div className="aspect-video w-full bg-black relative">
            <iframe
              src={embedUrl}
              title={songTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="bg-stone-950 px-4 py-3 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-500" />
          <span className="text-sm font-bold text-stone-200">Vídeo / Tutorial no YouTube</span>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-bold"
        >
          Abrir no YouTube <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="aspect-video w-full bg-black relative">
        <iframe
          src={embedUrl}
          title={songTitle}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
};
