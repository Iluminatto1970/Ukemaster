/**
 * Dicionário de acordes: grade navegável com diagramas, busca e filtros por tom/tipo.
 */
import React, { useState } from 'react';
import { CHORD_DATABASE, ALL_KEYS, ALL_QUALITIES } from '../data/chords';
import { getAllGeneratedChords, getOrGenerateChord } from '../utils/chordGenerator';
import { CHORDS_HYDRATED_EVENT } from '../lib/chordCache';
import { useT } from '../lib/i18n';
import { useToolSeo } from '../hooks/useToolSeo';
import { ChordDiagram } from './ChordDiagram';
import { Search, Volume2, Sparkles, Filter, Music2, Zap } from 'lucide-react';
import { playUkuleleChord } from '../utils/audio';
import { AdSenseSlot } from './AdSenseSlot';
import { ADSENSE_SLOTS } from '../config';

export const ChordDictionary: React.FC = () => {
  const { t } = useT();

  // SEO: JSON-LD WebApplication para dicionário de acordes
  useToolSeo({
    slug: 'dicionario',
    title: 'Dicionário de Acordes de Ukulele',
    description: 'Dicionário completo de acordes de ukulele com diagramas, campo harmônico e busca por tom. Aprenda acordes maiores, menores, com sétima e mais.',
    url: `${window.location.origin}/dicionario`,
    applicationCategory: 'EducationalApplication',
  });

  const [selectedKey, setSelectedKey] = useState<string>('C');
  const [selectedQuality, setSelectedQuality] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSection, setActiveSection] = useState<'acordes' | 'campo'>('acordes');
  const [campoMode, setCampoMode] = useState<'maior' | 'menor'>('maior');
  // Re-renderiza quando a hidratação do cache (localStorage + Supabase)
  // termina — assim os acordes gerados compartilhados aparecem na busca.
  const [, setHydratedTick] = useState(0);
  React.useEffect(() => {
    const bump = () => setHydratedTick((t) => t + 1);
    window.addEventListener(CHORDS_HYDRATED_EVENT, bump);
    return () => window.removeEventListener(CHORDS_HYDRATED_EVENT, bump);
  }, []);

  // ── Campo Harmônico: gera os acordes diatônicos de um tom ─────────────
  const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const campoChords = React.useMemo(() => {
    const rootIdx = CHROMATIC.indexOf(selectedKey);
    if (rootIdx === -1) return [];
    // Maior: I ii iii IV V vi vii°   |  Menor: i ii° III iv v VI VII
    const intervals = campoMode === 'maior' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const qualities = campoMode === 'maior' ? ['', 'm', 'm', '', '', 'm', '°'] : ['m', '°', '', 'm', 'm', '', ''];
    const roman = campoMode === 'maior' ? ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] : ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
    return intervals.map((iv, i) => {
      const note = CHROMATIC[(rootIdx + iv) % 12];
      const name = note + qualities[i];
      const def = CHORD_DATABASE.find((c) => c.name === name || (c.aliases && c.aliases.includes(name)));
      return { roman: roman[i], name, def };
    });
  }, [selectedKey, campoMode]);

  // Filter chords based on selection and search. Inclui também os acordes
  // GERADOS pelo motor de voicings (não existiam no dicionário estático) —
  // assim "D7(9)", "Am7M", "F#9-/7" aparecem com diagrama real na busca.
  const allChords = React.useMemo(() => {
    // Inclui os acordes gerados pelo motor (a cada render a lista é barata;
    // o memo só evita reconstruir o Map a cada keystroke da busca).
    const generated = getAllGeneratedChords();
    if (generated.length === 0) return CHORD_DATABASE;
    const byId = new Map(CHORD_DATABASE.map((c) => [c.id, c]));
    for (const g of generated) byId.set(g.id, g);
    return Array.from(byId.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, getAllGeneratedChords().length]);

  const diffLabel = (d?: string) =>
    d === 'fácil' ? t('dictionary.difficultyEasy') : d === 'médio' ? t('dictionary.difficultyMedium') : d ? t('dictionary.difficultyHard') : '';

  // Labels dos chips de tipo de acorde: o ALL_QUALITIES (data/chords.ts) tem
  // texto hardcoded em PT — aqui mapeamos para as chaves i18n de cada idioma.
  const qualityLabel = (id: string) =>
    ({
      Maior: t('dictionary.qMaior'),
      Menor: t('dictionary.qMenor'),
      '7': t('dictionary.q7'),
      m7: t('dictionary.qm7'),
      maj7: t('dictionary.qmaj7'),
      '6': t('dictionary.q6'),
      m6: t('dictionary.qm6'),
      sus4: t('dictionary.qsus4'),
      sus2: t('dictionary.qsus2'),
      add9: t('dictionary.qadd9'),
      dim: t('dictionary.qdim'),
      m7b5: t('dictionary.qm7b5'),
    }[id] ?? id);

  const filteredChords = allChords.filter((chord) => {
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

  // Geração on-the-fly: quando o usuário digita um acorde que não existe no
  // dicionário (ex.: "D7(9)", "Am7M"), o motor de voicings gera o diagrama
  // real na hora — o dicionário passa a conhecer TODO acorde tocável.
  const liveSearchChord = React.useMemo(() => {
    const q = searchQuery.trim();
    if (!q || filteredChords.length > 0) return null;
    // Evita disparar para textos longos (o motor busca no braço inteiro)
    if (q.length > 12) return null;
    const def = getOrGenerateChord(q);
    return def && def.fingerings.length > 0 ? def : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Banner / Title */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 relative overflow-hidden shadow-2xs">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Music2 className="w-48 h-48 text-orange-500" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold mb-3 border border-orange-200">
            <Sparkles className="w-3.5 h-3.5" /> {t('dictionary.badge')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t('dictionary.title')}
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            {t('dictionary.subtitle')}
          </p>
        </div>
      </div>

      {/* AdSense: só quando o dicionário tem acordes filtrados visíveis */}
      <AdSenseSlot format="fluid" layout="in-article" label="Publicidade" adSlot={ADSENSE_SLOTS.dictionary} />

      {/* Sub-tabs: Dicionário | Campo Harmônico */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        {[
          { id: 'acordes' as const, label: t('dictionary.tabChords') },
          { id: 'campo' as const, label: t('dictionary.tabHarmonic') },
        ].map((tb) => (
          <button
            key={tb.id}
            onClick={() => setActiveSection(tb.id)}
            className={`text-xs font-extrabold uppercase tracking-wider pb-2.5 px-1 transition-all cursor-pointer ${
              activeSection === tb.id
                ? 'text-slate-900 border-b-2 border-orange-500'
                : 'text-slate-400 font-bold hover:text-slate-700'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {activeSection === 'campo' ? (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                {t('dictionary.key')}
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
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                {t('dictionary.mode')}
              </label>
              <div className="flex gap-1.5">
                {[
                  { id: 'maior' as const, label: t('dictionary.major') },
                  { id: 'menor' as const, label: t('dictionary.minor') },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCampoMode(m.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                      campoMode === m.id
                        ? 'bg-[#0E7C7B] text-white'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 hover:border-[#0E7C7B]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            {t('dictionary.harmonicField')}{' '}
            <strong className="text-[#F26419] font-black">{selectedKey} {campoMode === 'maior' ? t('dictionary.major') : t('dictionary.minor')}</strong>
            {' '}{t('dictionary.playSequence')}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {campoChords.map((c) => (
              <div key={c.roman} className="bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-center hover:border-[#0E7C7B]/40 hover:shadow-md transition-all">
                <span className="text-[10px] font-black text-[#0E7C7B] uppercase tracking-wider block mb-1">
                  {c.roman}
                </span>
                {c.def ? (
                  <ChordDiagram chordName={c.name} fingering={c.def.fingerings[0]} size="sm" showPlayButton={false} />
                ) : (
                  <div className="h-16 flex items-center justify-center">
                    <span className="text-sm font-black text-slate-400 font-mono">{c.name}</span>
                  </div>
                )}
                <p className="text-[11px] font-black text-slate-800 font-mono mt-1">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <>
      {/* Search & Filters */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('dictionary.searchPlaceholder')}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-orange-500 transition-colors text-sm font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-900 font-bold"
            >
              {t('dictionary.clear')}
            </button>
          )}
        </div>

        {!searchQuery && (
          <>
            {/* Key Selector Buttons */}
            <div>
              <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
                {t('dictionary.rootKey')}
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
                {t('dictionary.chordType')}
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
                  {t('dictionary.all')}
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
                    {qualityLabel(q.id)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Chords Grid */}
      {liveSearchChord ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            key={liveSearchChord.id}
            className="bg-white border-2 border-amber-300 rounded-2xl p-5 shadow-2xs transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-2xl font-black text-orange-600 font-mono tracking-tight flex items-center gap-2">
                    {liveSearchChord.name}
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-[#F26419] text-[10px] font-extrabold uppercase tracking-wide border border-amber-300"
                      title={t('dictionary.generatedTitle')}
                    >
                      <Zap className="w-3 h-3" /> {t('dictionary.generatedNow')}
                    </span>
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {t('dictionary.tonic')} {liveSearchChord.key} • {liveSearchChord.quality}
                  </span>
                  <p className="text-[11px] text-amber-700 mt-1.5 font-medium">
                    {t('dictionary.generatedBadge')}
                  </p>
                </div>
                {liveSearchChord.difficulty && (
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      liveSearchChord.difficulty === 'fácil'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : liveSearchChord.difficulty === 'médio'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {diffLabel(liveSearchChord.difficulty)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 justify-center py-2">
                {liveSearchChord.fingerings.map((fingering, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <ChordDiagram
                      chordName={liveSearchChord.fingerings.length > 1 ? `${liveSearchChord.name} (v${idx + 1})` : liveSearchChord.name}
                      fingering={fingering}
                      size="md"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => playUkuleleChord(liveSearchChord.fingerings[0].frets)}
              className="w-full mt-4 py-2.5 rounded-xl bg-amber-500 hover:bg-[#F26419] text-white text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
            >
              <Volume2 className="w-4 h-4" /> {t('dictionary.playChordSound')}
            </button>
          </div>
        </div>
      ) : filteredChords.length > 0 ? (
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
                      {chord.generated && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-[#F26419] text-[10px] font-extrabold uppercase tracking-wide border border-amber-300"
                          title={t('dictionary.generatedTitle')}
                        >
                          <Zap className="w-3 h-3" /> {t('dictionary.generated')}
                        </span>
                      )}
                      {chord.aliases && chord.aliases.some((a) => a !== chord.name) && (
                        <span className="text-xs font-sans font-normal text-slate-500">
                          ({chord.aliases.filter((a) => a !== chord.name)[0]})
                        </span>
                      )}
                    </h3>
                    <span className="text-xs text-slate-500 font-medium">
                      {t('dictionary.tonic')} {chord.key} • {chord.quality}
                    </span>
                    {chord.aliases && chord.aliases.length > 1 && (
                      <div className="text-[10px] text-orange-600/80 mt-0.5 font-medium">
                        {t('dictionary.otherSpellings')} {chord.aliases.join(', ')}
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
                      {diffLabel(chord.difficulty)}
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
                <Volume2 className="w-4 h-4" /> {t('dictionary.playChordSound')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white border border-slate-200/90 rounded-2xl p-8">
          <Filter className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">{t('dictionary.noResults')}</h3>
          <p className="text-slate-500 text-sm mt-1">
            {t('dictionary.noResultsHint')}
          </p>
        </div>
      )}
      </>
      )}
    </div>
  );
};
