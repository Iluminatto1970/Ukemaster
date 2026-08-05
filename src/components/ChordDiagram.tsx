/**
 * Diagrama SVG de acorde de ukulele (tamanhos xs→lg) com posição dos dedos e som de referência.
 */
import React from 'react';
import { ChordFingering } from '../types';
import { playUkuleleChord } from '../utils/audio';
import { Volume2 } from 'lucide-react';

interface ChordDiagramProps {
  chordName: string;
  fingering: ChordFingering;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showPlayButton?: boolean;
  className?: string;
}

export const ChordDiagram: React.FC<ChordDiagramProps> = ({
  chordName,
  fingering,
  size = 'md',
  showPlayButton = true,
  className = '',
}) => {
  const { frets, fingers = [0, 0, 0, 0], barreFret, baseFret = 1 } = fingering;

  // Dimensions based on size
  const dimensions = {
    xs: { width: 76, height: 96, padding: 12, fontSize: 9 },
    sm: { width: 100, height: 130, padding: 16, fontSize: 11 },
    md: { width: 140, height: 180, padding: 20, fontSize: 13 },
    lg: { width: 190, height: 240, padding: 26, fontSize: 16 },
  }[size];

  const { width, height, padding } = dimensions;

  const numFrets = 4;
  const boardWidth = width - padding * 2;
  const boardHeight = height - padding * 2.2;

  const stringSpacing = boardWidth / 3; // 4 strings = 3 spaces
  const fretSpacing = boardHeight / numFrets;

  const strings = ['G', 'C', 'E', 'A'];

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    playUkuleleChord(frets);
  };

  return (
    <div
      className={`inline-flex flex-col items-center bg-white border border-slate-200/90 rounded-2xl p-3 select-none transition-all shadow-sm hover:shadow-md hover:border-orange-400 group ${className}`}
    >
      {/* Chord Name Header */}
      <div className="flex items-center justify-between w-full mb-1">
        <span className="text-[#1D2D44] font-black tracking-tight text-lg font-sans">
          {chordName}
        </span>
        {showPlayButton && (
          <button
            onClick={handlePlay}
            title="Ouvir som do acorde"
            className="p-1 rounded-full bg-[#FEF0E8] text-[#F26419] hover:bg-[#F26419] hover:text-white transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* SVG Fretboard */}
      <svg width={width} height={height} className="overflow-visible">
        {/* Base fret label if starting higher than fret 1 */}
        {baseFret > 1 && (
          <text
            x={padding - 10}
            y={padding + fretSpacing / 2 + 4}
            fill="#6C7E93"
            fontSize="10"
            fontWeight="bold"
            textAnchor="end"
          >
            {baseFret}ª
          </text>
        )}

        {/* Nut (Thick line if fret 1, thin if higher fret) */}
        <line
          x1={padding}
          y1={padding}
          x2={padding + boardWidth}
          y2={padding}
          stroke={baseFret === 1 ? '#0E7C7B' : '#8C9BAE'}
          strokeWidth={baseFret === 1 ? 4 : 2}
        />

        {/* Horizontal Fret Lines (4 frets) */}
        {Array.from({ length: numFrets + 1 }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={padding}
            y1={padding + i * fretSpacing}
            x2={padding + boardWidth}
            y2={padding + i * fretSpacing}
            stroke="#D4DCE4"
            strokeWidth={1.5}
          />
        ))}

        {/* Vertical String Lines (4 strings: G, C, E, A) */}
        {strings.map((_, i) => {
          const x = padding + i * stringSpacing;
          return (
            <line
              key={`string-${i}`}
              x1={x}
              y1={padding}
              x2={x}
              y2={padding + boardHeight}
              stroke="#6C7E93"
              strokeWidth={i === 0 ? 2.5 : i === 1 ? 2 : i === 2 ? 1.5 : 1.2}
            />
          );
        })}

        {/* Open (O) / Muted (X) string markers above nut */}
        {frets.map((fret, i) => {
          const x = padding + i * stringSpacing;
          const y = padding - 8;
          if (fret === 0) {
            return (
              <circle
                key={`open-${i}`}
                cx={x}
                cy={y}
                r={3.5}
                fill="none"
                stroke="#0E7C7B"
                strokeWidth={1.5}
              />
            );
          } else if (fret < 0) {
            return (
              <text
                key={`mute-${i}`}
                x={x}
                y={y + 3}
                fill="#F26419"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                ✕
              </text>
            );
          }
          return null;
        })}

        {/* Barre Chord Bar if specified */}
        {barreFret && (
          <rect
            x={padding - 2}
            y={padding + (barreFret - baseFret) * fretSpacing + fretSpacing * 0.25}
            width={boardWidth + 4}
            height={fretSpacing * 0.5}
            rx={4}
            fill="#0E7C7B"
            opacity={0.9}
          />
        )}

        {/* Finger Dots */}
        {frets.map((fret, stringIdx) => {
          if (fret <= 0) return null;

          const relativeFret = fret - baseFret + 1;
          if (relativeFret < 1 || relativeFret > numFrets) return null;

          const x = padding + stringIdx * stringSpacing;
          const y = padding + (relativeFret - 0.5) * fretSpacing;
          const fingerNum = fingers[stringIdx];

          return (
            <g key={`dot-${stringIdx}`}>
              <circle
                cx={x}
                cy={y}
                r={size === 'xs' ? 6 : size === 'sm' ? 8 : size === 'md' ? 10 : 12}
                fill="#1D2D44"
                stroke="#F26419"
                strokeWidth={1.5}
                className="drop-shadow-xs"
              />
              {fingerNum > 0 && (
                <text
                  x={x}
                  y={y + (size === 'xs' ? 2.5 : size === 'sm' ? 3 : 4)}
                  fill="#ffffff"
                  fontSize={size === 'xs' ? 7 : size === 'sm' ? 9 : 11}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {fingerNum}
                </text>
              )}
            </g>
          );
        })}

        {/* String Names at bottom */}
        {strings.map((strName, i) => (
          <text
            key={`str-name-${i}`}
            x={padding + i * stringSpacing}
            y={height - 4}
            fill="#6C7E93"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
          >
            {strName}
          </text>
        ))}
      </svg>
    </div>
  );
};
