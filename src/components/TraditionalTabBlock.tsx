/**
 * Renderização de tablatura tradicional (linhas de corda com números) dentro da cifra.
 */
import React, { useState } from 'react';
import { Play, Copy, Check, Music, Sliders, Volume2 } from 'lucide-react';
import { playPluckedNote } from '../utils/audio';

interface TraditionalTabBlockProps {
  rawContent: string;
}

// String base pitch frequencies for GCEA Ukulele (High G)
const STRING_BASE_FREQS: Record<string, number> = {
  G: 392.00, // G4
  C: 261.63, // C4
  E: 329.63, // E4
  A: 440.00, // A4
};

function getFretFrequency(stringName: string, fretNumber: number): number {
  const base = STRING_BASE_FREQS[stringName.toUpperCase()] || 440;
  return base * Math.pow(2, fretNumber / 12);
}

export const TraditionalTabBlock: React.FC<TraditionalTabBlockProps> = ({ rawContent }) => {
  const [viewMode, setViewMode] = useState<'traditional' | 'interactive'>('traditional');
  const [copied, setCopied] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const lines = rawContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  // Parse strings lines (A, E, C, G)
  const parsedStrings: { name: string; label: string; line: string; frets: { pos: number; val: string }[] }[] = [];

  const stringOrder = [
    { key: 'A', label: 'A (1ª)' },
    { key: 'E', label: 'E (2ª)' },
    { key: 'C', label: 'C (3ª)' },
    { key: 'G', label: 'G (4ª)' },
  ];

  stringOrder.forEach(({ key, label }) => {
    const foundLine = lines.find((l) => new RegExp(`^${key}[|:]`, 'i').test(l.trim()));
    if (foundLine) {
      const content = foundLine.trim();
      const frets: { pos: number; val: string }[] = [];
      let currentNum = '';
      
      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (/\d/.test(char)) {
          currentNum += char;
        } else {
          if (currentNum) {
            frets.push({ pos: i - currentNum.length, val: currentNum });
            currentNum = '';
          }
          if (/[xphv\/\\sbt~]/i.test(char)) {
            frets.push({ pos: i, val: char });
          }
        }
      }
      if (currentNum) {
        frets.push({ pos: content.length - currentNum.length, val: currentNum });
      }

      parsedStrings.push({
        name: key,
        label,
        line: content,
        frets,
      });
    }
  });

  const hasStandard4Strings = parsedStrings.length >= 2;

  const handleCopy = () => {
    navigator.clipboard.writeText(rawContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePlayTabSeq = () => {
    if (isPlaying) return;
    setIsPlaying(true);

    // Collect all fret events chronologically
    const timeSteps: { stringKey: string; fret: number; timeIdx: number }[] = [];

    parsedStrings.forEach((s) => {
      s.frets.forEach((f) => {
        const fretNum = parseInt(f.val, 10);
        if (!isNaN(fretNum)) {
          timeSteps.push({
            stringKey: s.name,
            fret: fretNum,
            timeIdx: f.pos,
          });
        }
      });
    });

    timeSteps.sort((a, b) => a.timeIdx - b.timeIdx);

    if (timeSteps.length === 0) {
      setIsPlaying(false);
      return;
    }

    let delay = 0;
    timeSteps.forEach((step, idx) => {
      setTimeout(() => {
        const freq = getFretFrequency(step.stringKey, step.fret);
        playPluckedNote(freq, 0.8, 0.6);
        if (idx === timeSteps.length - 1) {
          setTimeout(() => setIsPlaying(false), 500);
        }
      }, delay);
      delay += 280;
    });
  };

  return (
    <div className="bg-stone-950 border border-amber-500/30 rounded-2xl p-4 my-3 space-y-3 shadow-xl">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-mono font-black text-xs border border-amber-500/40 uppercase tracking-wide flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5" />
            {viewMode === 'traditional' ? 'Tablatura Tradicional' : 'Nosso Método Interativo (GCEA)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasStandard4Strings && (
            <button
              type="button"
              onClick={handlePlayTabSeq}
              disabled={isPlaying}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isPlaying
                  ? 'bg-amber-500 text-stone-950 animate-pulse'
                  : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-stone-950 border border-amber-500/30'
              }`}
              title="Tocar notas da tablatura em sequência de áudio"
            >
              <Volume2 className="w-3.5 h-3.5" />
              {isPlaying ? 'Tocando Tab...' : 'Ouvir Tablatura'}
            </button>
          )}

          {hasStandard4Strings && (
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'traditional' ? 'interactive' : 'traditional')}
              className="px-2.5 py-1.5 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500/40 text-stone-300 hover:text-amber-400 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              {viewMode === 'traditional' ? 'Ver Nosso Método Interativo' : 'Ver Tablatura Tradicional'}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1.5 rounded-xl bg-stone-900 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-stone-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            title="Copiar texto da tablatura"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Content Rendering */}
      {viewMode === 'interactive' && hasStandard4Strings ? (
        <div className="bg-stone-900 border border-stone-800/90 rounded-xl p-4 overflow-x-auto space-y-2 select-text font-mono">
          <div className="min-w-max space-y-2">
            {parsedStrings.map((s) => (
              <div key={s.name} className="flex items-center gap-3 group">
                {/* String Label */}
                <div className="w-14 shrink-0 text-amber-400 font-bold text-xs bg-stone-950 border border-stone-800 px-2 py-1 rounded text-center shadow-inner">
                  {s.label}
                </div>

                {/* String Line representation */}
                <div className="flex-1 font-mono text-xs sm:text-sm text-stone-200 tracking-widest bg-stone-950/80 px-3 py-1.5 rounded border border-stone-800/80 overflow-x-auto text-amber-300 font-extrabold">
                  {s.line}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-3.5 font-mono text-xs sm:text-sm text-amber-200 overflow-x-auto leading-relaxed shadow-inner select-text">
          <pre className="whitespace-pre font-mono font-semibold tracking-wide text-amber-200">{rawContent}</pre>
        </div>
      )}
    </div>
  );
};
