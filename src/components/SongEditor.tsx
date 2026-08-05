/**
 * Editor de cifra: criar/editar músicas com busca de vídeo, adaptação de tom, tags/SEO e estrutura passo a passo.
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Song, SONG_CATEGORIES, SONG_DIFFICULTIES } from '../types';
import { ALL_KEYS, ALL_QUALITIES, findChord, CHORD_DATABASE } from '../data/chords';
import { Save, ArrowLeft, Sparkles, Youtube, Edit, Eye, Volume2, Search, Plus, Columns, Music, Check, Info, ExternalLink, Share2, Tag, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { parseChordPro, extractUniqueChords, extractYouTubeId, generateSongSeoAndHashtags, UkuleleTabStep, generateUkuleleTabBlock, formatAndCleanTabs } from '../utils/chordUtils';
import { useSongSeo } from '../hooks/useSongSeo';
import { ChordDiagram } from './ChordDiagram';
import { YouTubePlayer } from './YouTubePlayer';
import { TraditionalTabBlock } from './TraditionalTabBlock';
import { playUkuleleChord } from '../utils/audio';

interface SongEditorProps {
  initialSong?: Song;
  onSave: (song: Song) => void;
  onCancel: () => void;
  onDelete?: (songId: string) => void;
  /** Só o admin (iluminatto@gmail.com) pode excluir músicas do acervo. */
  isAdmin?: boolean;
}

const COMMON_QUICK_CHORDS = ['C', 'G', 'Am', 'F', 'Dm', 'Em', 'E7', 'D', 'A7', 'C7', 'A', 'Bm', 'G7', 'Cmaj7'];

export const SongEditor: React.FC<SongEditorProps> = ({
  initialSong,
  onSave,
  onCancel,
  onDelete,
  isAdmin = false,
}) => {
  const [title, setTitle] = useState<string>(initialSong?.title || '');
  const [artist, setArtist] = useState<string>(initialSong?.artist || '');
  const [key, setKey] = useState<string>(initialSong?.key || 'C');
  const [tempo, setTempo] = useState<number | undefined>(initialSong?.tempo);
  const [strummingPattern, setStrummingPattern] = useState<string>(
    initialSong?.strummingPattern || '↓  ↓ ↑  ↑ ↓ ↑'
  );
  const [difficulty, setDifficulty] = useState<'Simplificado' | 'Médio' | 'Avançado'>(
    initialSong?.difficulty === 'Iniciante'
      ? 'Simplificado'
      : initialSong?.difficulty === 'Intermediário'
      ? 'Médio'
      : initialSong?.difficulty || 'Simplificado'
  );
  const [category, setCategory] = useState<string>(initialSong?.category || 'MPB');
  const [youtubeUrl, setYoutubeUrl] = useState<string>(
    initialSong?.youtubeUrl || (initialSong?.youtubeId ? `https://www.youtube.com/watch?v=${initialSong.youtubeId}` : '')
  );
  const [content, setContent] = useState<string>(initialSong?.content || '');
  const [seoDescription, setSeoDescription] = useState<string>(initialSong?.seoDescription || '');
  const [hashtags, setHashtags] = useState<string[]>(initialSong?.hashtags || []);
  const [activeTab, setActiveTab] = useState<'editor' | 'split' | 'preview'>('split');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);

  // Interactive Chord Selector State
  const [selectedBuilderKey, setSelectedBuilderKey] = useState<string>('C');
  const [selectedBuilderQuality, setSelectedBuilderQuality] = useState<string>('Maior');
  const [customSearchChord, setCustomSearchChord] = useState<string>('');

  // Tablature Builder State
  const [tabTitle, setTabTitle] = useState<string>('Intro Dedilhada');
  const [tabSteps, setTabSteps] = useState<UkuleleTabStep[]>([
    { A: '0', E: '0', C: '0', G: '0' },
    { A: '2', E: '1', C: '0', G: '0' },
    { A: '3', E: '0', C: '0', G: '2' },
    { A: '0', E: '0', C: '0', G: '0' },
  ]);
  const [tabCopied, setTabCopied] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAddTabStep = () => {
    setTabSteps((prev) => [...prev, { A: '-', E: '-', C: '-', G: '-' }]);
  };

  const handleRemoveTabStep = (index: number) => {
    if (tabSteps.length <= 1) return;
    setTabSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateTabStep = (index: number, stringName: 'A' | 'E' | 'C' | 'G', val: string) => {
    setTabSteps((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [stringName]: val };
      return copy;
    });
  };

  const handleLoadTabPreset = (presetType: 'dedilhado' | 'solo' | 'escala') => {
    if (presetType === 'dedilhado') {
      setTabTitle('Dedilhado Base 4/4');
      setTabSteps([
        { G: '0', C: '-', E: '-', A: '-' },
        { G: '-', C: '0', E: '-', A: '-' },
        { G: '-', C: '-', E: '0', A: '-' },
        { G: '-', C: '-', E: '-', A: '0' },
        { G: '-', C: '-', E: '0', A: '-' },
        { G: '-', C: '0', E: '-', A: '-' },
      ]);
    } else if (presetType === 'solo') {
      setTabTitle('Solo de Abertura');
      setTabSteps([
        { A: '0', E: '0', C: '0', G: '0' },
        { A: '2', E: '1', C: '0', G: '0' },
        { A: '3', E: '0', C: '0', G: '2' },
        { A: '5', E: '3', C: '0', G: '0' },
        { A: '3', E: '1', C: '0', G: '0' },
        { A: '0', E: '0', C: '0', G: '0' },
      ]);
    } else if (presetType === 'escala') {
      setTabTitle('Escala de C Maior');
      setTabSteps([
        { G: '-', C: '0', E: '-', A: '-' }, // C
        { G: '-', C: '2', E: '-', A: '-' }, // D
        { G: '-', C: '-', E: '0', A: '-' }, // E
        { G: '-', C: '-', E: '1', A: '-' }, // F
        { G: '-', C: '-', E: '3', A: '-' }, // G
        { G: '-', C: '-', E: '-', A: '0' }, // A
        { G: '-', C: '-', E: '-', A: '2' }, // B
        { G: '-', C: '-', E: '-', A: '3' }, // C
      ]);
    }
  };

  // Compute selected chord to insert
  const calculatedChordName = (() => {
    if (customSearchChord.trim()) {
      return customSearchChord.trim();
    }
    if (selectedBuilderQuality === 'Maior') return selectedBuilderKey;
    if (selectedBuilderQuality === 'Menor') return `${selectedBuilderKey}m`;
    return `${selectedBuilderKey}${selectedBuilderQuality}`;
  })();

  const selectedChordDef = findChord(calculatedChordName);

  // Extract unique chords in content in real time
  const detectedChords = extractUniqueChords(content);
  const previewLines = parseChordPro(content);

  const groupedPreviewItems = useMemo(() => {
    const items: (
      | { type: 'section'; title: string }
      | { type: 'tab'; content: string }
      | { type: 'line'; line: (typeof previewLines)[0] }
    )[] = [];

    let currentTabLines: string[] = [];

    const flushTabs = () => {
      if (currentTabLines.length > 0) {
        items.push({ type: 'tab', content: currentTabLines.join('\n') });
        currentTabLines = [];
      }
    };

    previewLines.forEach((line) => {
      if (line.isTabLine) {
        const text = line.tabContent || line.rawLine;
        if (text && text !== '--- Tablatura ---') {
          currentTabLines.push(text);
        }
      } else {
        flushTabs();
        if (line.isSectionHeader) {
          items.push({ type: 'section', title: line.sectionTitle || '' });
        } else {
          items.push({ type: 'line', line });
        }
      }
    });

    flushTabs();
    return items;
  }, [previewLines]);

  // Automatically generate SEO metatags, title, description, and hashtags
  const autoSeo = useSongSeo({
    title,
    artist,
    key,
    difficulty,
    chords: detectedChords,
    strummingPattern,
    category,
  });

  // Automatically update SEO description and hashtags when title or artist changes (if empty or previously auto-generated)
  useEffect(() => {
    if (title.trim() || artist.trim()) {
      setSeoDescription(autoSeo.seoDescription);
      setHashtags(autoSeo.hashtags);
    }
  }, [title, artist, key, difficulty, autoSeo.seoDescription, autoSeo.hashtags]);

  const handleGenerateSeo = () => {
    setSeoDescription(autoSeo.seoDescription);
    setHashtags(autoSeo.hashtags);
  };

  const handleInsertText = (textToInsert: string, chordNameForSound?: string) => {
    const textarea = textareaRef.current || (document.getElementById('song-content-textarea') as HTMLTextAreaElement);
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + textToInsert + content.substring(end);
      setContent(newContent);
      
      // Play sound if inserting a chord
      if (chordNameForSound) {
        const def = findChord(chordNameForSound);
        if (def && def.fingerings.length > 0) {
          playUkuleleChord(def.fingerings[0].frets);
        }
      }

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
      }, 50);
    } else {
      setContent((prev) => prev + textToInsert);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) {
      alert('Por favor, informe o título e o artista da música.');
      return;
    }

    const cleanYtId = extractYouTubeId(youtubeUrl.trim());

    let finalSeo = seoDescription.trim();
    let finalHashtags = hashtags;

    if (!finalSeo || finalHashtags.length === 0) {
      const seoData = generateSongSeoAndHashtags(
        title.trim(),
        artist.trim(),
        key,
        difficulty,
        detectedChords,
        strummingPattern
      );
      if (!finalSeo) finalSeo = seoData.seoDescription;
      if (finalHashtags.length === 0) finalHashtags = seoData.hashtags;
    }

    const updatedSong: Song = {
      id: initialSong?.id || `song-${Date.now()}`,
      title: title.trim(),
      artist: artist.trim(),
      key,
      category,
      tempo: tempo ? Number(tempo) : undefined,
      strummingPattern: strummingPattern.trim() || undefined,
      difficulty,
      youtubeUrl: youtubeUrl.trim() || undefined,
      youtubeId: cleanYtId || undefined,
      content: content.trim(),
      seoDescription: finalSeo,
      hashtags: finalHashtags,
      createdAt: initialSong?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(updatedSong);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-6xl mx-auto text-slate-900">
      {/* Top Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold mb-2 border border-orange-200">
            <Sparkles className="w-3.5 h-3.5" /> Adição Intuitiva de Acordes
          </div>
          <h2 className="text-2xl font-black text-slate-900">
            {initialSong ? 'Editar Cifra' : 'Criar Nova Cifra'}
          </h2>
          <p className="text-slate-600 text-xs mt-1 font-medium">
            Ao digitar ou selecionar notas [C], as imagens dos acordes de Ukulele aparecem automaticamente em tempo real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {initialSong && onDelete && isAdmin && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-100 text-rose-600 border border-slate-200 hover:bg-rose-50 font-bold text-xs cursor-pointer transition-colors flex items-center gap-1.5"
              title="Excluir Cifra"
            >
              <Trash2 className="w-4 h-4 text-rose-500" /> Excluir
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:text-slate-900 font-bold text-xs cursor-pointer transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/20 flex items-center gap-2 cursor-pointer transition-all"
          >
            <Save className="w-4 h-4" /> Salvar Cifra
          </button>
        </div>
      </div>

      {/* Song Metadata Fields */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Título da Música *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Anunciação, Riptide, More Than Words..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 transition-colors font-medium"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Artista / Banda *
            </label>
            <input
              type="text"
              required
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Ex: Alceu Valença, Vance Joy, Extreme..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 transition-colors font-medium"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Tom Principal
            </label>
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {ALL_KEYS.map((k) => (
                <option key={k} value={k}>
                  Tom de {k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Categoria / Estilo
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {SONG_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Modo / Dificuldade
            </label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as 'Simplificado' | 'Médio' | 'Avançado')}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {SONG_DIFFICULTIES.map((diff) => (
                <option key={diff} value={diff}>
                  {diff}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Andamento (BPM)
            </label>
            <input
              type="number"
              value={tempo || ''}
              onChange={(e) => setTempo(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="Ex: 100"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Padrão de Batida
            </label>
            <input
              type="text"
              value={strummingPattern}
              onChange={(e) => setStrummingPattern(e.target.value)}
              placeholder="Ex: ↓  ↓ ↑  ↑ ↓ ↑"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-mono focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* YouTube Video & Auto-Search Section */}
        <div className="bg-stone-950 border border-stone-800/80 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-semibold text-stone-200 flex items-center gap-1.5">
              <Youtube className="w-4 h-4 text-red-500" /> Vídeo / Aula no YouTube (Opcional)
            </label>
            <div className="flex items-center gap-2">
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                  `${title || ''} ${artist || ''} ukulele tutorial cifra`.trim() || 'ukulele cifra'
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-bold bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/20"
                title="Abrir busca no YouTube em nova aba"
              >
                <Search className="w-3.5 h-3.5" /> Buscar Vídeo no YouTube <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="Cole o link ou ID do vídeo (ex: https://www.youtube.com/watch?v=9vK6G6K7aSo ou 9vK6G6K7aSo)"
              className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-200 text-sm focus:outline-none focus:border-amber-500"
            />
            {youtubeUrl && (
              <button
                type="button"
                onClick={() => setYoutubeUrl('')}
                className="px-3.5 py-2.5 bg-stone-900 border border-stone-800 text-stone-400 hover:text-rose-400 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Live Video Preview inside Editor */}
          {extractYouTubeId(youtubeUrl) ? (
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> Vídeo Reconhecido e Pronto para Tocar!
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  ID: {extractYouTubeId(youtubeUrl)}
                </span>
              </div>
              <div className="max-w-md">
                <YouTubePlayer youtubeUrlOrId={youtubeUrl} songTitle={title || 'Pré-visualização do Vídeo'} />
              </div>
            </div>
          ) : youtubeUrl ? (
            <p className="text-xs text-rose-400 font-semibold">
              ⚠️ Link não reconhecido. Cole uma URL padrão do YouTube (watch, shorts, youtu.be) ou o ID de 11 caracteres.
            </p>
          ) : (
            <p className="text-[11px] text-stone-400">
              💡 Dica: Clique no botão <strong className="text-amber-400">Buscar Vídeo no YouTube</strong> acima para encontrar aulas, versões e tutoriais da música no YouTube, depois copie e cole o link aqui!
            </p>
          )}
        </div>

        {/* Automatic SEO & Hashtags Section */}
        <div className="bg-stone-950 border border-stone-800/80 rounded-xl p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800/60 pb-3">
            <div>
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-amber-500" /> SEO Automático (Gerado em Tempo Real)
              </span>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Sempre que você altera o título e artista, a descrição SEO e os metatags são gerados e sincronizados automaticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateSeo}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-gerar SEO
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-300 block mb-1">
              Título SEO Gerado para Google & Redes Sociais:
            </label>
            <div className="bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-amber-300 font-mono text-xs font-bold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{autoSeo.seoTitle}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-300 block mb-1">
              Descrição Meta SEO Otimizada:
            </label>
            <textarea
              rows={2}
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              placeholder="A descrição SEO é gerada automaticamente com base no título e artista..."
              className="w-full bg-stone-900 border border-stone-800 rounded-xl p-3 text-stone-200 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

        </div>
      </div>

      {/* Interactive Chord Adder Tool (Ferramenta Intuitiva de Adição de Acordes) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-[#F26419]" />
            <h3 className="text-base font-extrabold text-[#1D2D44]">
              Ferramenta de Seleção e Inserção de Acordes
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-medium">
            Escolha ou busque uma nota para ver o diagrama e inseri-la com 1 clique
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          {/* Key & Quality Selector Controls */}
          <div className="md:col-span-8 space-y-3">
            {/* Quick Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customSearchChord}
                onChange={(e) => setCustomSearchChord(e.target.value)}
                placeholder="Busque por nome do acorde (ex: C#, Bm, G7, Cmaj7, Dadd9)..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-slate-800 text-xs focus:outline-none focus:border-[#F26419]"
              />
              {customSearchChord && (
                <button
                  type="button"
                  onClick={() => setCustomSearchChord('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>

            {!customSearchChord && (
              <>
                {/* Roots Bar */}
                <div>
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
                    Nota Tônica:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ALL_KEYS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSelectedBuilderKey(k)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          selectedBuilderKey === k
                            ? 'bg-[#F26419] text-white font-black shadow-xs scale-105'
                            : 'bg-slate-100 text-slate-700 border border-slate-200 hover:border-orange-300'
                        }`}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Qualities Bar */}
                <div>
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
                    Qualidade / Tipo:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {ALL_QUALITIES.map((q) => (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelectedBuilderQuality(q.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                          selectedBuilderQuality === q.id
                            ? 'bg-[#0E7C7B] text-white font-bold shadow-xs'
                            : 'bg-slate-100 text-slate-600 border border-slate-200 hover:text-slate-900'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Quick Popular Chord Buttons */}
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">
                Atalhos Rápidos:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_QUICK_CHORDS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleInsertText(`[${c}]`, c)}
                    className="px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 hover:border-orange-400 text-[#F26419] font-mono font-bold text-xs cursor-pointer transition-all hover:scale-105 flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3 h-3 text-[#F26419]" /> [{c}]
                  </button>
                ))}
              </div>
            </div>

            {/* Section Dividers */}
            <div>
              <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block mb-1">
                Inserir Seções da Cifra:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {['[Intro]', '[Verso 1]', '[Verso 2]', '[Refrão]', '[Ponte]', '[Solo]', '[Outro]'].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => handleInsertText(`\n${sec}\n`)}
                    className="px-2.5 py-1 rounded-lg bg-stone-950 border border-stone-800 hover:border-amber-500/50 text-stone-300 font-xs cursor-pointer hover:text-amber-400 transition-colors"
                  >
                    + {sec}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Live Diagram Card & Insert Button */}
          <div className="md:col-span-4 bg-stone-950 border border-stone-800 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-3">
            <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider">
              Visualização da Nota Selecionada
            </span>

            {selectedChordDef ? (
              <div className="flex flex-col items-center space-y-3 w-full">
                <ChordDiagram
                  chordName={selectedChordDef.name}
                  fingering={selectedChordDef.fingerings[0]}
                  size="md"
                />

                <button
                  type="button"
                  onClick={() => handleInsertText(`[${selectedChordDef.name}]`, selectedChordDef.name)}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Inserir [{selectedChordDef.name}] na Cifra
                </button>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center space-y-2">
                <div className="text-amber-400 font-mono font-bold text-lg">
                  [{calculatedChordName}]
                </div>
                <p className="text-xs text-stone-500 max-w-[180px]">
                  Acorde personalizado. Clique para inserir na cifra.
                </p>
                <button
                  type="button"
                  onClick={() => handleInsertText(`[${calculatedChordName}]`)}
                  className="mt-2 px-4 py-2 rounded-xl bg-stone-900 border border-stone-800 hover:border-amber-500 text-amber-400 font-bold text-xs cursor-pointer"
                >
                  + Inserir [{calculatedChordName}]
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Ukulele Tablature Creator (Assistente de Tablatura) */}
      <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <Columns className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-stone-100">
              Assistente de Criar e Formatar Tablaturas de Ukulele (4 Cordas: A, E, C, G)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              const cleaned = formatAndCleanTabs(content);
              setContent(cleaned);
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-stone-950 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            title="Detecta e padroniza automaticamente todas as linhas de tablatura coladas no editor em blocos {sot} e {eot}"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Padronizar / Limpar Tablaturas no Texto
          </button>
        </div>

        {/* Tab Presets & Settings Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 space-y-2">
            <label className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
              Nome da Tablatura / Seção:
            </label>
            <input
              type="text"
              value={tabTitle}
              onChange={(e) => setTabTitle(e.target.value)}
              placeholder="ex: Solo de Abertura, Dedilhado Refrão..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 text-xs focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="md:col-span-7 space-y-2">
            <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
              Modelos Rápidos (Presets):
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLoadTabPreset('dedilhado')}
                className="px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-amber-500 text-stone-300 hover:text-amber-400 font-bold text-xs transition-all cursor-pointer"
              >
                + Dedilhado Base (4/4)
              </button>
              <button
                type="button"
                onClick={() => handleLoadTabPreset('solo')}
                className="px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-amber-500 text-stone-300 hover:text-amber-400 font-bold text-xs transition-all cursor-pointer"
              >
                + Solo Exemplo
              </button>
              <button
                type="button"
                onClick={() => handleLoadTabPreset('escala')}
                className="px-3 py-1.5 rounded-lg bg-stone-950 border border-stone-800 hover:border-amber-500 text-stone-300 hover:text-amber-400 font-bold text-xs transition-all cursor-pointer"
              >
                + Escala de C
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Fret Matrix Step Grid */}
        <div className="space-y-2 bg-stone-950 border border-stone-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs text-stone-400 font-semibold border-b border-stone-800/80 pb-2">
            <span>Passos / Notas da Tablatura ({tabSteps.length} Passos):</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddTabStep}
                className="px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 font-bold text-xs hover:bg-amber-400 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Passo
              </button>
              <button
                type="button"
                onClick={() => setTabSteps([{ A: '-', E: '-', C: '-', G: '-' }])}
                className="px-2.5 py-1 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 hover:text-red-400 font-bold text-xs cursor-pointer"
              >
                Limpar Passos
              </button>
            </div>
          </div>

          <div className="overflow-x-auto pb-2 pt-2">
            <div className="flex items-start gap-2 min-w-max">
              {/* String Headers */}
              <div className="flex flex-col gap-2 pt-6 font-mono text-xs font-bold text-amber-400 w-16 shrink-0">
                <div className="h-8 flex items-center">A (1ª)</div>
                <div className="h-8 flex items-center">E (2ª)</div>
                <div className="h-8 flex items-center">C (3ª)</div>
                <div className="h-8 flex items-center">G (4ª)</div>
              </div>

              {/* Steps Columns */}
              {tabSteps.map((step, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 bg-stone-900/80 border border-stone-800 p-2 rounded-xl shrink-0 w-16">
                  <span className="text-[10px] text-stone-500 font-bold font-mono">#{idx + 1}</span>
                  {(['A', 'E', 'C', 'G'] as const).map((st) => (
                    <input
                      key={st}
                      type="text"
                      value={step[st] || '-'}
                      onChange={(e) => handleUpdateTabStep(idx, st, e.target.value)}
                      className="w-10 h-8 text-center bg-stone-950 border border-stone-800 text-amber-300 font-mono font-bold text-xs rounded-lg focus:outline-none focus:border-amber-500"
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => handleRemoveTabStep(idx)}
                    className="text-[10px] text-stone-500 hover:text-red-400 font-bold pt-1 cursor-pointer"
                    title="Excluir este passo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live Tab Output & Insert Action */}
        <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="font-mono text-xs text-amber-300 space-y-1 w-full md:w-auto">
            <span className="text-[10px] text-stone-500 font-sans font-bold uppercase tracking-wider block">
              Pré-visualização do Código ChordPro:
            </span>
            <pre className="p-3 bg-stone-900 rounded-lg border border-stone-800/80 overflow-x-auto text-amber-200">
              {generateUkuleleTabBlock(tabSteps, tabTitle)}
            </pre>
          </div>

          <div className="flex flex-col gap-2 w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                const tabCode = generateUkuleleTabBlock(tabSteps, tabTitle);
                handleInsertText(`\n${tabCode}\n`);
              }}
              className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4" /> Inserir Tablatura na Cifra
            </button>
          </div>
        </div>
      </div>

      {/* Detected Chords Strip - Real time ukulele positions */}
      {detectedChords.length > 0 && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-stone-200 uppercase tracking-wider">
                Acordes Identificados nesta Cifra ({detectedChords.length}):
              </span>
            </div>
            <span className="text-xs text-stone-400">
              Clique em qualquer imagem para ouvir o som ou re-inserir a nota
            </span>
          </div>

          <div className="flex flex-wrap gap-3 overflow-x-auto pb-2">
            {detectedChords.map((chordName) => {
              const chordDef = findChord(chordName);
              if (!chordDef) {
                return (
                  <button
                    key={chordName}
                    type="button"
                    onClick={() => handleInsertText(`[${chordName}]`)}
                    className="px-3 py-2 rounded-xl bg-stone-950 border border-stone-800 text-amber-400 font-mono font-bold text-xs cursor-pointer hover:border-amber-500 flex flex-col items-center"
                  >
                    <span>[{chordName}]</span>
                    <span className="text-[10px] text-stone-500 font-sans mt-0.5">+ Inserir</span>
                  </button>
                );
              }

              return (
                <div
                  key={chordName}
                  onClick={() => handleInsertText(`[${chordName}]`, chordName)}
                  title={`Clique para inserir [${chordName}] na posição atual do cursor`}
                  className="cursor-pointer transform transition-transform hover:scale-105 relative group"
                >
                  <ChordDiagram
                    chordName={chordName}
                    fingering={chordDef.fingerings[0]}
                    size="sm"
                  />
                  <div className="absolute inset-0 bg-amber-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1 pointer-events-none">
                    <span className="bg-stone-950 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded shadow border border-amber-500/30">
                      + Inserir
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Editor & Preview Mode Switcher */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-stone-800 pb-3 gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'editor'
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200'
              }`}
            >
              <Edit className="w-3.5 h-3.5" /> Editor
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('split')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'split'
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200'
              }`}
            >
              <Columns className="w-3.5 h-3.5" /> Lado a Lado (Ao Vivo)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-amber-500 text-stone-950'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Pré-visualização
            </button>
          </div>

          <span className="text-xs text-stone-400 font-medium">
            Coloque as notas entre colchetes, ex: <code className="text-amber-400 font-mono font-bold">[C]</code> ou <code className="text-amber-400 font-mono font-bold">[Am]</code>
          </span>
        </div>

        {/* Tab 1: Editor Only */}
        {activeTab === 'editor' && (
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              id="song-content-textarea"
              rows={18}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Digite ou cole a letra com as notas entre colchetes. Exemplo:

[Intro]
[G] [Am] [C] [G]

[Verso 1]
Na [G]bruma leve das paixões que vem de [Am]dentro
Tu [C]vens chegando pra brincar no meu [G]quintal`}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-stone-200 font-mono text-sm leading-relaxed focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        )}

        {/* Tab 2: Split / Side-by-Side Live View */}
        {activeTab === 'split' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Input Textarea */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-stone-400 uppercase block mb-1">
                Editor da Letra (Digite os acordes [C] [G])
              </span>
              <textarea
                ref={textareaRef}
                id="song-content-textarea"
                rows={18}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Digite ou cole a letra aqui...

[Intro]
[C] [G] [Am] [F]

[Verso 1]
Eu [C]vejo o sol na [G]minha janela...`}
                className="w-full h-[450px] bg-stone-950 border border-stone-800 rounded-xl p-4 text-stone-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Right: Live Rendered Song with Chord Positions */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-amber-400 uppercase block mb-1 flex items-center justify-between">
                <span>Resultado Formatado em Tempo Real</span>
                <span className="text-[10px] text-stone-500 font-normal">Formatação automática ChordPro</span>
              </span>
              <div className="w-full h-[450px] overflow-y-auto overflow-x-hidden bg-stone-950 border border-stone-800 rounded-xl p-4 font-mono text-xs space-y-2 select-text">
                {groupedPreviewItems.length > 0 ? (
                  groupedPreviewItems.map((item, idx) => {
                    if (item.type === 'section') {
                      return (
                        <div key={idx} className="text-amber-400 font-sans font-extrabold uppercase mt-3 mb-1 border-b border-amber-500/20 pb-0.5 text-xs">
                          {item.title}
                        </div>
                      );
                    }
                    if (item.type === 'tab') {
                      return <TraditionalTabBlock key={idx} rawContent={item.content} />;
                    }
                    const line = item.line;
                    return (
                      <div key={idx} className="flex flex-wrap items-baseline gap-x-1 py-0.5 min-w-0">
                        {line.tokens.map((t, tidx) => (
                          <span key={tidx} className="inline-flex flex-col items-start max-w-full min-w-0">
                            {t.chord ? (
                              <span className="text-amber-400 font-bold bg-amber-500/20 border border-amber-500/30 px-1 py-0.2 rounded text-[11px] -mb-1">
                                {t.chord}
                              </span>
                            ) : null}
                            <span className="text-stone-200 whitespace-pre-wrap break-words">{t.text}</span>
                          </span>
                        ))}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-stone-600 italic">Digite algo no editor à esquerda para ver o resultado ao vivo aqui.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Preview Only */}
        {activeTab === 'preview' && (
          <div className="bg-stone-950 border border-stone-800 rounded-xl p-6 font-mono space-y-3 min-h-[350px] overflow-x-hidden">
            {groupedPreviewItems.length > 0 ? (
              groupedPreviewItems.map((item, idx) => {
                if (item.type === 'section') {
                  return (
                    <div key={idx} className="text-amber-400 font-sans font-extrabold uppercase mt-4 mb-1 border-b border-amber-500/20 pb-1 text-sm">
                      {item.title}
                    </div>
                  );
                }
                if (item.type === 'tab') {
                  return <TraditionalTabBlock key={idx} rawContent={item.content} />;
                }
                const line = item.line;
                return (
                  <div key={idx} className="flex flex-wrap items-baseline gap-x-1 py-1 min-w-0">
                    {line.tokens.map((t, tidx) => (
                      <span key={tidx} className="inline-flex flex-col items-start max-w-full min-w-0">
                        {t.chord ? (
                          <span className="text-amber-400 font-bold bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded text-xs -mb-1">
                            {t.chord}
                          </span>
                        ) : null}
                        <span className="text-stone-200 whitespace-pre-wrap break-words">{t.text}</span>
                      </span>
                    ))}
                  </div>
                );
              })
            ) : (
              <p className="text-stone-500 text-sm">Nenhum conteúdo para pré-visualizar ainda.</p>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && initialSong && onDelete && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-100">Excluir Música</h3>
                <p className="text-xs text-stone-400">Esta ação irá remover a música do seu repertório.</p>
              </div>
            </div>

            <p className="text-sm text-stone-300">
              Tem certeza que deseja excluir permanentemente a música <strong className="text-amber-400">{initialSong.title}</strong> ({initialSong.artist})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-800/80">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-950 text-stone-300 border border-stone-800 hover:bg-stone-800 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  onDelete(initialSong.id);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors shadow-lg shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
};

