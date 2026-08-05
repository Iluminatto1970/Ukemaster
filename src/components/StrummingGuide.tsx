/**
 * Guia de ritmos/levadas (estudo de ritmos): padrões de batida com notação e dicas para o ukulele.
 */
import React, { useState, useEffect, useRef } from 'react';
import { DEFAULT_STRUMMING_PATTERNS } from '../data/defaultSongs';
import { StrummingPattern } from '../types';
import { Play, Pause, Volume2, Music, Flame, Sparkles } from 'lucide-react';
import { playMetronomeClick, playPluckedNote } from '../utils/audio';

export const StrummingGuide: React.FC = () => {
  const [selectedPattern, setSelectedPattern] = useState<StrummingPattern>(
    DEFAULT_STRUMMING_PATTERNS[0]
  );
  const [tempo, setTempo] = useState<number>(100);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(-1);

  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPlaying) {
      const beatDurationMs = (60 / tempo) * 1000 * 0.5; // Eighth note interval
      let currentBeat = 0;

      intervalRef.current = window.setInterval(() => {
        setActiveBeatIndex(currentBeat);

        const beatType = selectedPattern.beats[currentBeat % selectedPattern.beats.length];

        if (beatType === 'down') {
          playPluckedNote(261.63, 0.4, 0.6); // C4 strum sound
        } else if (beatType === 'up') {
          playPluckedNote(440.00, 0.3, 0.5); // A4 strum sound
        } else if (beatType === 'mute') {
          playMetronomeClick(true);
        } else {
          playMetronomeClick(false);
        }

        currentBeat = (currentBeat + 1) % selectedPattern.beats.length;
      }, beatDurationMs);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setActiveBeatIndex(-1);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, tempo, selectedPattern]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Banner */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold mb-3 border border-amber-500/20 w-max">
          <Sparkles className="w-3.5 h-3.5" /> Guia de Batidas & Ritmos de Ukulele
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight">
          Aprenda o Ritmo e a Batida Certa
        </h2>
        <p className="text-stone-400 text-sm mt-1">
          Ouça o metrônomo interativo e veja a direção exata da palhetada (polegar e dedos) para cada estilo musical.
        </p>
      </div>

      {/* Main Pattern Player Card */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-5">
          <div>
            <span className="text-xs px-2.5 py-0.5 rounded bg-stone-950 text-amber-400 font-bold border border-stone-800 font-mono">
              Fórmula de Compasso: {selectedPattern.timeSignature}
            </span>
            <h3 className="text-2xl font-black text-amber-400 tracking-tight mt-2">
              {selectedPattern.name}
            </h3>
            <p className="text-stone-300 text-sm mt-1">{selectedPattern.description}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Play/Pause Practice Metronome */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-6 py-3 rounded-xl font-bold text-sm shadow-xl transition-all flex items-center gap-2 cursor-pointer ${
                isPlaying
                  ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse'
                  : 'bg-amber-500 hover:bg-amber-400 text-stone-950 shadow-amber-500/20 scale-105'
              }`}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isPlaying ? 'Pausar Guia' : 'Ouvir Batida no Metrônomo'}
            </button>
          </div>
        </div>

        {/* Visual Beats Sequence */}
        <div className="py-4">
          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-3">
            Sequência de Movimentos (Setas):
          </span>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-4 bg-stone-950 rounded-2xl border border-stone-800">
            {selectedPattern.beats.map((beat, idx) => {
              const isActive = activeBeatIndex % selectedPattern.beats.length === idx;
              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-center w-16 h-20 rounded-xl border transition-all ${
                    isActive
                      ? 'bg-amber-500 border-amber-400 text-stone-950 scale-110 shadow-lg shadow-amber-500/40 font-black'
                      : 'bg-stone-900 border-stone-800 text-stone-200'
                  }`}
                >
                  <span className="text-2xl font-black font-mono">
                    {beat === 'down' ? '↓' : beat === 'up' ? '↑' : beat === 'mute' ? '✕' : '•'}
                  </span>
                  <span
                    className={`text-[10px] font-bold mt-1 uppercase ${
                      isActive ? 'text-stone-950' : 'text-stone-400'
                    }`}
                  >
                    {beat === 'down' ? 'Baixo' : beat === 'up' ? 'Cima' : beat === 'mute' ? 'Abafa' : 'Pausa'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tempo BPM Slider */}
        <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <span className="text-xs font-bold text-stone-300">Andamento de Treino (BPM)</span>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-xs">
            <input
              type="range"
              min="60"
              max="160"
              step="5"
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <span className="text-sm font-mono font-bold text-amber-400 shrink-0">{tempo} BPM</span>
          </div>
        </div>

        {/* Select Pattern Cards */}
        <div>
          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-3">
            Escolha um Padrão de Batida:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DEFAULT_STRUMMING_PATTERNS.map((p) => {
              const isSelected = p.id === selectedPattern.id;
              return (
                <div
                  key={p.id}
                  onClick={() => {
                    setSelectedPattern(p);
                    setIsPlaying(false);
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500 text-stone-100 shadow-md'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-bold text-sm text-amber-400">{p.name}</h4>
                    <span className="text-[10px] font-mono bg-stone-900 px-2 py-0.5 rounded text-stone-400">
                      {p.genre}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400 line-clamp-2 mt-1">{p.description}</p>
                  <div className="text-amber-400 font-mono font-bold text-sm tracking-widest mt-2">
                    {p.pattern}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
