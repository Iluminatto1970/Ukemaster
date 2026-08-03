import React, { useState } from 'react';
import { CHORD_DATABASE, ALL_KEYS, ALL_QUALITIES } from '../data/chords';
import { ChordDiagram } from './ChordDiagram';
import { Search, Volume2, Sparkles, Filter, Music2 } from 'lucide-react';
import { playUkuleleChord } from '../utils/audio';
import { AdSenseSlot } from './AdSenseSlot';

export const ChordDictionary: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState<string>('C');
  const [selectedQuality, setSelectedQuality] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter chords based on selection and search
  const filteredChords = CHORD_DATABASE.filter((chord) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return (
        chord.name.toLowerCase().includes(q) ||
        chord.key.toLowerCase().includes(q) ||
        chord.id.toLowerCase().includes(q) ||
        (chord.aliases && chord.aliases.some((alias) => alias.toLowerCase().includes(q)))
      );
    }
    const matchKey = chord.key === selectedKey;
    const matchQuality = selectedQuality === 'all' || chord.quality === selectedQuality;
    return matchKey && matchQuality;
  });

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Banner / Title */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 relative overflow-hidden shadow-2xs">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Music2 className="w-48 h-48 text-orange-500" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold mb-3 border border-orange-200">
            <Sparkles className="w-3.5 h-3.5" /> Dicionário de Acordes para Ukulele
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Explore e Aprenda Acordes
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            Visualização precisa das posições dos dedos nas 4 cordas (G C E A) com áudio real e variações de dedilhado.
          </p>
        </div>
      </div>

      <AdSenseSlot format="horizontal" label="Anúncio Google • Dicionário de Acordes" />

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome do acorde (ex: Am, F#m, Cmaj7, G7)..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors text-sm font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 font-bold"
            >
              Limpar
            </button>
          )}
        </div>

        {!searchQuery && (
          <>
            {/* Key Selector Buttons */}
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                Tom / Tônica:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setSelectedKey(k)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                      selectedKey === k
                        ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 scale-105'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 hover:border-orange-400'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Filter Chips */}
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                Tipo de Acorde:
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedQuality('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    selectedQuality === 'all'
                      ? 'bg-orange-50 text-orange-600 border border-orange-200'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
                {ALL_QUALITIES.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuality(q.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      selectedQuality === q.id
                        ? 'bg-orange-50 text-orange-600 border border-orange-200'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chords Grid */}
      {filteredChords.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChords.map((chord) => (
            <div
              key={chord.id}
              className="bg-white border border-slate-200/90 hover:border-orange-300 rounded-2xl p-5 shadow-2xs transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-2xl font-black text-orange-600 font-mono tracking-tight flex items-center gap-2">
                      {chord.name}
                      {chord.aliases && chord.aliases.length > 0 && (
                        <span className="text-xs font-sans font-normal text-slate-500">
                          ({chord.aliases[0]})
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      Tônica: {chord.key} • {chord.quality}
                    </span>
                    {chord.aliases && chord.aliases.length > 1 && (
                      <div className="text-[10px] text-orange-600/80 mt-0.5 font-medium">
                        Outras grafias: {chord.aliases.join(', ')}
                      </div>
                    )}
                  </div>
                  {chord.difficulty && (
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                        chord.difficulty === 'fácil'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : chord.difficulty === 'médio'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {chord.difficulty}
                    </span>
                  )}
                </div>

                {/* Fingerings variations */}
                <div className="flex flex-wrap gap-4 justify-center py-2">
                  {chord.fingerings.map((fingering, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <ChordDiagram
                        chordName={chord.fingerings.length > 1 ? `${chord.name} (v${idx + 1})` : chord.name}
                        fingering={fingering}
                        size="md"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Strum button */}
              <button
                onClick={() => playUkuleleChord(chord.fingerings[0].frets)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-orange-500 hover:text-white text-orange-600 text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
              >
                <Volume2 className="w-4 h-4" /> Tocar Som do Acorde
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-slate-200/90 rounded-2xl p-8">
          <Filter className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">Nenhum acorde encontrado</h3>
          <p className="text-slate-500 text-sm mt-1">
            Tente buscar por outro termo ou selecione um tom diferente.
          </p>
        </div>
      )}
    </div>
  );
};
