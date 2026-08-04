import React, { useState, useEffect, useRef } from 'react';
import { Song } from '../types';
import { parseChordPro, extractUniqueChords, extractYouTubeId } from '../utils/chordUtils';
import { useSongSeo } from '../hooks/useSongSeo';
import { findChord } from '../data/chords';
import { ChordDiagram } from './ChordDiagram';
import { YouTubePlayer } from './YouTubePlayer';
import { TraditionalTabBlock } from './TraditionalTabBlock';
import { AdSenseSlot } from './AdSenseSlot';
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Minus,
  Youtube,
  Edit3,
  ListPlus,
  Volume2,
  Sparkles,
  ArrowLeft,
  Maximize2,
  Bookmark,
  ChevronUp,
  ChevronDown,
  Share2,
  Tag,
  Copy,
  Check,
  Trash2,
  Eye,
  EyeOff,
  FolderHeart,
  Lock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { playUkuleleChord } from '../utils/audio';
import { useAuth } from '../auth';
import { saveLead, normalizeWhatsApp } from '../lib/leads';

interface SongViewerProps {
  song: Song;
  onBack: () => void;
  onEdit: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onDelete?: (songId: string) => void;
  currentUser?: { name: string; email: string } | null;
  isInRepertoire?: boolean;
  onToggleRepertoire?: () => void;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
}

export const SongViewer: React.FC<SongViewerProps> = ({
  song,
  onBack,
  onEdit,
  onAddToPlaylist,
  onDelete,
  currentUser,
  isInRepertoire = false,
  onToggleRepertoire,
  onOpenAuth,
}) => {
  const videoId = extractYouTubeId(song.youtubeId || song.youtubeUrl || '');
  const [transposeSemitones, setTransposeSemitones] = useState<number>(0);
  const [fontSize, setFontSize] = useState<number>(18); // px
  const [showVideo, setShowVideo] = useState<boolean>(Boolean(videoId));
  const [floatingVideo, setFloatingVideo] = useState<boolean>(false);
  const [selectedChordModal, setSelectedChordModal] = useState<string | null>(null);
  const [copiedHashtags, setCopiedHashtags] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showTablatures, setShowTablatures] = useState<boolean>(true);

  // Lead capture (paywall estilo Scribd) — nome/e-mail/WhatsApp para o seu banco de leads
  const [leadName, setLeadName] = useState<string>('');
  const [leadEmail, setLeadEmail] = useState<string>('');
  const [leadWhatsapp, setLeadWhatsapp] = useState<string>('');
  const [leadSubmitted, setLeadSubmitted] = useState<boolean>(false);
  const { available: clerkAvailable } = useAuth();

  const clampSemitone = (value: number) => Math.max(-2, Math.min(2, value));
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1 to 5
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  // Unique chords in this song with current transposition
  const uniqueChords = extractUniqueChords(song.content, transposeSemitones);
  const parsedLines = parseChordPro(song.content, transposeSemitones);

  // Automatically generate SEO metatags, title & hashtags based on Title and Artist
  const generatedSeo = useSongSeo({
    title: song.title,
    artist: song.artist,
    key: song.key,
    difficulty: song.difficulty,
    chords: uniqueChords,
    strummingPattern: song.strummingPattern,
    category: song.category,
    autoUpdateHead: true, // Dynamically updates <title> and <meta> tags in document head
  });

  const seoData = {
    seoDescription: song.seoDescription || generatedSeo.seoDescription,
    hashtags: song.hashtags && song.hashtags.length > 0 ? song.hashtags : generatedSeo.hashtags,
  };

  // Handle Auto-Scroll
  useEffect(() => {
    if (isAutoScrolling) {
      scrollIntervalRef.current = window.setInterval(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += scrollSpeed * 0.8;
          // Stop when reaching bottom
          const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
          if (scrollTop + clientHeight >= scrollHeight - 5) {
            setIsAutoScrolling(false);
          }
        }
      }, 50);
    } else if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }

    return () => {
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [isAutoScrolling, scrollSpeed]);

  // Group contiguous tab lines for TraditionalTabBlock rendering
  const groupedRenderItems = React.useMemo(() => {
    const items: (
      | { type: 'section'; title: string }
      | { type: 'tab'; content: string }
      | { type: 'line'; line: (typeof parsedLines)[0] }
    )[] = [];

    let currentTabLines: string[] = [];

    const flushTabs = () => {
      if (currentTabLines.length > 0) {
        items.push({ type: 'tab', content: currentTabLines.join('\n') });
        currentTabLines = [];
      }
    };

    parsedLines.forEach((line) => {
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
  }, [parsedLines]);

  const hasTablatures = React.useMemo(() => {
    return groupedRenderItems.some((item) => item.type === 'tab');
  }, [groupedRenderItems]);

  const modalChordDef = selectedChordModal ? findChord(selectedChordModal) : null;

  // Salva o lead (nome/e-mail/WhatsApp) e segue para o cadastro real (Clerk)
  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadSubmitted(true);
    await saveLead({
      name: leadName.trim(),
      email: leadEmail.trim(),
      whatsapp: normalizeWhatsApp(leadWhatsapp),
      source: 'paywall',
    });
    // Abre o fluxo de cadastro para liberar 100% do conteúdo
    onOpenAuth?.('signup');
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Toolbar */}
      <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 sticky top-2 z-30 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-700 hover:text-orange-600 font-extrabold text-xs px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-orange-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Private Repertoire Button */}
          {isInRepertoire ? (
            <button
              onClick={onToggleRepertoire}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Esta música está no seu repertório privado"
            >
              <FolderHeart className="w-4 h-4 text-emerald-600 fill-current" /> No Seu Repertório
            </button>
          ) : (
            <button
              onClick={() => {
                if (currentUser) {
                  onToggleRepertoire?.();
                } else {
                  onOpenAuth?.('signup');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-[#F26419] text-white hover:bg-[#D9530D] transition-colors cursor-pointer shadow-xs"
              title="Adicionar à sua área privada de estudos"
            >
              <FolderHeart className="w-4 h-4" /> + Repertório Privado
            </button>
          )}

          {videoId ? (
            <button
              onClick={() => {
                setShowVideo(!showVideo);
                if (floatingVideo) setFloatingVideo(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                showVideo
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-red-600'
              }`}
            >
              <Youtube className="w-4 h-4 text-red-500" />
              {showVideo ? 'Ocultar Vídeo' : 'Ver Vídeo'}
            </button>
          ) : (
            <button
              onClick={() => onEdit(song)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-500 hover:text-white transition-colors cursor-pointer"
              title="Buscar e Adicionar Vídeo da Música no YouTube"
            >
              <Youtube className="w-4 h-4 text-red-500" /> + Adicionar Vídeo
            </button>
          )}

          {onAddToPlaylist && (
            <button
              onClick={() => onAddToPlaylist(song)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-orange-500" /> Playlist
            </button>
          )}

          <button
            onClick={() => onEdit(song)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4" /> Editar Cifra
          </button>

          {onDelete && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-rose-600 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Excluir Música Definitivamente"
            >
              <Trash2 className="w-4 h-4 text-rose-500" /> Excluir Música
            </button>
          )}
        </div>
      </div>

      {/* Main Song Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-600 font-bold border border-orange-200">
                Tom Original: {song.key}
              </span>
              {song.category && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-extrabold border border-[#0E7C7B]/20 inline-flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {song.category}
                </span>
              )}
              {song.difficulty && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200">
                  Modo {song.difficulty}
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {song.title}
            </h1>
            <p className="text-orange-600 font-bold text-base mt-1">{song.artist}</p>
          </div>

          {/* Strumming pattern & Tempo badge */}
          {(song.strummingPattern || song.tempo) && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 sm:max-w-xs shrink-0">
              <span className="text-xs text-slate-500 font-extrabold uppercase tracking-wider block mb-1">
                Ritmo & Batida
              </span>
              {song.strummingPattern && (
                <div className="text-orange-600 font-mono font-black text-lg tracking-widest">
                  {song.strummingPattern}
                </div>
              )}
              {song.tempo && (
                <div className="text-xs text-slate-500 font-medium mt-1">
                  Andamento: <span className="text-slate-800 font-mono font-bold">{song.tempo} BPM</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transpose & Auto-scroll Controls Row */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${hasTablatures ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 pt-2`}>
          {/* Transposition Control */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-bold block">Transposição (Tom)</span>
              <span className="text-orange-600 font-mono font-bold text-sm">
                {transposeSemitones === 0
                  ? `Tom Atual: ${song.key}`
                  : `${transposeSemitones > 0 ? `+${transposeSemitones}` : transposeSemitones} Semitons`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTransposeSemitones((prev) => clampSemitone(prev - 1))}
                className="p-2 rounded-lg bg-white border border-slate-200 hover:border-orange-400 text-slate-700 font-bold text-xs cursor-pointer shadow-2xs"
                title="-1 Semitom"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>

              {transposeSemitones !== 0 && (
                <button
                  onClick={() => setTransposeSemitones(0)}
                  className="p-2 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-500 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                  title="Resetar Tom Original"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => setTransposeSemitones((prev) => clampSemitone(prev + 1))}
                className="p-2 rounded-lg bg-white border border-slate-200 hover:border-orange-400 text-slate-700 font-bold text-xs cursor-pointer shadow-2xs"
                title="+1 Semitom"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Auto-Scroll Control */}
          <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAutoScrolling(!isAutoScrolling)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isAutoScrolling
                    ? 'bg-[#F26419] text-white animate-pulse shadow-md'
                    : 'bg-white text-[#1D2D44] border border-slate-200 hover:border-orange-400'
                }`}
              >
                {isAutoScrolling ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {isAutoScrolling ? 'Pausar Rolagem' : 'Rolar Cifra'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">Velocidade:</span>
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={scrollSpeed}
                onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
                className="w-20 accent-[#F26419] cursor-pointer"
              />
              <span className="text-xs text-[#F26419] font-mono font-black">{scrollSpeed}x</span>
            </div>
          </div>

          {/* Text Size Control */}
          <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-semibold">Tamanho da Fonte</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize((prev) => Math.max(14, prev - 2))}
                className="p-2 rounded-lg bg-white border border-slate-200 hover:border-orange-400 text-slate-700 font-bold text-xs cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-[#1D2D44] font-mono font-black">{fontSize}px</span>
              <button
                onClick={() => setFontSize((prev) => Math.min(28, prev + 2))}
                className="p-2 rounded-lg bg-white border border-slate-200 hover:border-orange-400 text-slate-700 font-bold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tablatures Toggle Control */}
          {hasTablatures && (
            <div className="bg-slate-100/80 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-semibold block">Tablaturas</span>
                <span className="text-slate-800 text-xs font-bold">
                  {showTablatures ? 'Exibindo' : 'Ocultas'}
                </span>
              </div>
              <button
                onClick={() => setShowTablatures(!showTablatures)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                  showTablatures
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900'
                }`}
                title={showTablatures ? "Ocultar blocos de tablatura da cifra" : "Exibir blocos de tablatura na cifra"}
              >
                {showTablatures ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showTablatures ? 'Ocultar Tabs' : 'Ver Tabs'}
              </button>
            </div>
          )}
        </div>

        {/* Quick Chord Diagrams Bar at top of song */}
        {uniqueChords.length > 0 && (
          <div className="pt-3 border-t border-slate-200">
            <span className="text-xs font-extrabold text-[#1D2D44] uppercase tracking-wider block mb-3">
              Acordes Utilizados nesta Música ({uniqueChords.length}):
            </span>
            <div className="flex flex-wrap gap-3 overflow-x-auto pb-2">
              {uniqueChords.map((chordName) => {
                const chordDef = findChord(chordName);
                if (!chordDef) {
                  return (
                    <div
                      key={chordName}
                      onClick={() => setSelectedChordModal(chordName)}
                      className="px-3 py-2 rounded-xl bg-orange-50 border border-orange-200 text-[#F26419] font-mono font-bold text-sm cursor-pointer hover:border-orange-500"
                    >
                      {chordName}
                    </div>
                  );
                }

                return (
                  <div
                    key={chordName}
                    onClick={() => setSelectedChordModal(chordName)}
                    className="cursor-pointer transform transition-transform hover:scale-105"
                  >
                    <ChordDiagram
                      chordName={chordName}
                      fingering={chordDef.fingerings[0]}
                      size="sm"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Automatic SEO & Hashtags Card */}
        <div className="pt-3 border-t border-slate-200">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#0E7C7B] flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-[#0E7C7B]" /> SEO & Hashtags para Redes Sociais
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(seoData.hashtags.join(' '));
                  setCopiedHashtags(true);
                  setTimeout(() => setCopiedHashtags(false), 2000);
                }}
                className="text-xs text-[#0E7C7B] hover:underline font-bold flex items-center gap-1 bg-[#0E7C7B]/10 px-2.5 py-1 rounded-lg border border-[#0E7C7B]/20 cursor-pointer self-start sm:self-auto"
                title="Copiar todas as hashtags formatadas para postagem"
              >
                {copiedHashtags ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedHashtags ? 'Hashtags Copiadas!' : 'Copiar Hashtags (#)'}
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed italic">
              "{seoData.seoDescription}"
            </p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {seoData.hashtags.map((tag, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-white border border-slate-200 text-[#1D2D44] rounded text-[11px] font-mono">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Picture-in-Picture YouTube Player */}
      {floatingVideo && videoId && (
        <YouTubePlayer
          youtubeUrlOrId={videoId}
          songTitle={song.title}
          isFloating
          onCloseFloating={() => setFloatingVideo(false)}
        />
      )}

      {/* Top Banner Ad before chord sheet */}
      {/* <AdSenseSlot format="horizontal" label="Anúncio do Topo da Cifra" /> */}

      {/* Main Content Area: Side-by-Side Grid when video is shown */}
      <div className={showVideo && videoId ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" : "w-full"}>
        {/* Main Interactive Chord Sheet View - Theme Matched */}
        <div
          ref={scrollContainerRef}
          className={`bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-h-[75vh] overflow-y-auto space-y-4 font-mono select-text ${
            showVideo && videoId ? 'lg:col-span-7 xl:col-span-8' : 'w-full'
          }`}
          style={{ fontSize: `${fontSize}px` }}
        >
          {groupedRenderItems.map((item, itemIdx) => {
            const maxPreviewItems = Math.max(3, Math.floor(groupedRenderItems.length * 0.25));
            const isLockedForGuest = !currentUser && itemIdx >= maxPreviewItems;

            if (isLockedForGuest) {
              if (itemIdx === maxPreviewItems) {
                return (
                  <div key="scribd-paywall" className="relative mt-6 pt-6 pb-8 px-6 sm:px-8 rounded-3xl bg-gradient-to-b from-[#1D2D44] via-[#1D2D44] to-[#0E7C7B] border-2 border-[#F26419]/40 text-center space-y-4 shadow-2xl overflow-hidden backdrop-blur-xl">
                    <div className="relative z-10 max-w-md mx-auto space-y-3 font-sans text-white">
                      <div className="w-12 h-12 rounded-2xl bg-[#F26419] text-white flex items-center justify-center mx-auto shadow-md">
                        <Lock className="w-6 h-6" />
                      </div>

                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F26419] text-white font-black text-[10px] tracking-wider uppercase">
                        <Sparkles className="w-3.5 h-3.5" />
                        Visualização Parcial • Scribd Lock
                      </div>

                      <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                        Crie sua conta grátis para ver 100% desta cifra
                      </h3>

                      <p className="text-xs text-teal-100 leading-relaxed">
                        Apenas os primeiros versos de <strong className="text-amber-300">{song.title}</strong> estão visíveis para leitores não cadastrados.
                      </p>

                      <div className="bg-white/10 rounded-2xl p-3.5 border border-white/20 text-left space-y-2 text-xs font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Libere a letra e cifras completas de todas as músicas</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Ferramentas de transposição de tom e rolagem automática</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Monte seu **Repertório Privado** personalizado</span>
                        </div>
                      </div>

                      <div className="pt-2 space-y-3">
                        {!leadSubmitted ? (
                          /* Formulário de lead: nome, e-mail e WhatsApp */
                          <form onSubmit={handleLeadSubmit} className="space-y-2">
                            <input
                              type="text"
                              value={leadName}
                              onChange={(e) => setLeadName(e.target.value)}
                              placeholder="Seu nome"
                              required
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white placeholder-teal-100/60 focus:outline-none focus:border-[#F26419] focus:bg-white/15 transition-all"
                            />
                            <input
                              type="email"
                              value={leadEmail}
                              onChange={(e) => setLeadEmail(e.target.value)}
                              placeholder="Seu melhor e-mail"
                              required
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white placeholder-teal-100/60 focus:outline-none focus:border-[#F26419] focus:bg-white/15 transition-all"
                            />
                            <input
                              type="tel"
                              value={leadWhatsapp}
                              onChange={(e) => setLeadWhatsapp(e.target.value)}
                              placeholder="Seu WhatsApp com DDD (ex: 11 98765-4321)"
                              required
                              minLength={10}
                              className="w-full bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white placeholder-teal-100/60 focus:outline-none focus:border-[#F26419] focus:bg-white/15 transition-all"
                            />
                            <button
                              type="submit"
                              className="w-full py-3 px-5 rounded-2xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-[#F26419]/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                            >
                              <span>Liberar Cifra Completa</span>
                              <ArrowRight className="w-4 h-4" />
                            </button>
                            <p className="text-[10px] text-teal-100/70 font-medium text-center">
                              Seus dados ficam seguros e são usados apenas para contato e novidades do portal.
                            </p>
                          </form>
                        ) : (
                          /* Confirmação após salvar o lead */
                          <div className="text-center space-y-3">
                            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold text-xs">
                              <Check className="w-4 h-4" /> Cadastro recebido!
                            </div>
                            <p className="text-xs text-teal-100/80">
                              {clerkAvailable
                                ? 'Agora conclua seu cadastro para liberar 100% da cifra...'
                                : 'Obrigado! Em breve você terá acesso completo ao acervo.'}
                            </p>
                            {clerkAvailable && (
                              <button
                                onClick={() => onOpenAuth?.('signup')}
                                className="w-full py-3 px-5 rounded-2xl bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-[#F26419]/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
                              >
                                <span>Continuar Cadastro Grátis</span>
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => onOpenAuth?.('login')}
                          className="text-xs text-amber-200 font-bold hover:underline cursor-pointer block mx-auto pt-1"
                        >
                          Já possui conta? Clique para Entrar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }

            let itemContent = null;

            if (item.type === 'section') {
              itemContent = (
                <div
                  key={itemIdx}
                  className="text-[#0E7C7B] font-sans font-black tracking-wide uppercase mt-6 mb-2 border-b border-[#0E7C7B]/20 pb-1 text-sm sm:text-base flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-[#F26419]" /> {item.title}
                </div>
              );
            } else if (item.type === 'tab') {
              if (!showTablatures) return null;
              itemContent = <TraditionalTabBlock key={itemIdx} rawContent={item.content} />;
            } else {
              const line = item.line;
              const hasChords = line.tokens.some((t) => t.chord);

              itemContent = (
                <div key={itemIdx} className="line-block leading-relaxed my-2">
                  {hasChords ? (
                    <div className="flex flex-wrap items-baseline gap-x-1 py-1">
                      {line.tokens.map((token, tokenIdx) => (
                        <span key={tokenIdx} className="inline-flex flex-col items-start relative group">
                          {token.chord ? (
                            <button
                              onClick={() => {
                                const chordDef = findChord(token.chord!);
                                if (chordDef) {
                                  playUkuleleChord(chordDef.fingerings[0].frets);
                                }
                                setSelectedChordModal(token.chord!);
                              }}
                              className="text-[#F26419] font-black bg-[#F26419]/10 hover:bg-[#F26419] hover:text-white px-1.5 py-0.5 rounded text-sm sm:text-base transition-colors cursor-pointer border border-[#F26419]/30 font-mono -mb-1 inline-block"
                              title={`Clique para ver o diagrama de ${token.chord}`}
                            >
                              {token.chord}
                            </button>
                          ) : (
                            <span className="h-5"></span>
                          )}
                          <span className="text-[#1D2D44] font-semibold whitespace-pre">{token.text}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-700 whitespace-pre-wrap">{line.rawLine}</div>
                  )}
                </div>
              );
            }

            return <React.Fragment key={itemIdx}>{itemContent}</React.Fragment>;
          })}
        </div>

        {/* Embedded YouTube Side Panel */}
        {showVideo && videoId && (
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
              <span className="text-xs text-[#1D2D44] font-bold flex items-center gap-2">
                <Youtube className="w-4 h-4 text-red-500" /> Vídeo / Aula
              </span>
              <button
                onClick={() => {
                  setShowVideo(false);
                  setFloatingVideo(true);
                }}
                className="text-xs text-slate-500 hover:text-[#F26419] flex items-center gap-1 font-semibold cursor-pointer"
                title="Transformar em janela flutuante"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Flutuante
              </button>
            </div>
            <YouTubePlayer youtubeUrlOrId={videoId} songTitle={song.title} />
          </div>
        )}
      </div>

      {/* Bottom Ad Banner after chord sheet */}
      <AdSenseSlot format="horizontal" label="Anúncio Google • Recomendado" />

      {/* Chord Modal Popup */}
      {selectedChordModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedChordModal(null)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-2xl font-black text-[#F26419] font-mono">
                Acorde: {selectedChordModal}
              </h3>
              <button
                onClick={() => setSelectedChordModal(null)}
                className="text-slate-400 hover:text-slate-800 font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            {modalChordDef ? (
              <div className="space-y-4">
                <div className="flex justify-center py-2">
                  <ChordDiagram
                    chordName={modalChordDef.name}
                    fingering={modalChordDef.fingerings[0]}
                    size="lg"
                  />
                </div>
                <button
                  onClick={() => playUkuleleChord(modalChordDef.fingerings[0].frets)}
                  className="w-full py-3 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-extrabold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#0E7C7B]/20"
                >
                  <Volume2 className="w-4 h-4" /> Tocar Som
                </button>
              </div>
            ) : (
              <div className="py-6 text-slate-500 text-sm">
                Posição do acorde <span className="font-bold text-[#F26419]">{selectedChordModal}</span> não encontrada no dicionário padrão.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && onDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Excluir Música</h3>
                <p className="text-xs text-slate-500">Esta ação irá remover a música do acervo.</p>
              </div>
            </div>

            <p className="text-sm text-slate-700">
              Tem certeza que deseja excluir permanentemente a música <strong className="text-[#F26419]">{song.title}</strong> ({song.artist})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  onDelete(song.id);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-colors shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
};
