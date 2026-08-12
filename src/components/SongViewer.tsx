/**
 * Leitor de cifra: transposição, auto-scroll, tamanho de fonte, tablaturas, vídeo YouTube, voto, repertório e ações (editar/excluir admin).
 */
import React, { useState, useEffect, useRef } from 'react';
import { Song } from '../types';
import {
  parseChordPro,
  extractUniqueChords,
  extractYouTubeId,
  transposeChordName,
  resolveChordWithTheory,
  generateSimplifiedContent,
  isHardSong,
} from '../utils/chordUtils';
import { SongComments } from './SongComments';
import { useSongSeo } from '../hooks/useSongSeo';
import { ChordDiagram } from './ChordDiagram';
import { YouTubePlayer } from './YouTubePlayer';
import { TraditionalTabBlock } from './TraditionalTabBlock';
import { AdSenseSlot } from './AdSenseSlot';
import { AffiliateAdCard } from './AffiliateAdCard';
import type { AffiliateLink } from '../types';
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
  Tag,
  Trash2,
  Eye,
  EyeOff,
  FolderHeart,
  Star,
} from 'lucide-react';
import { playUkuleleChord } from '../utils/audio';
import {
  downloadSongHtml,
  downloadSongTxt,
  printSong,
} from '../lib/songExport';
import { Download } from 'lucide-react';
import { Logo } from './Logo';
import { schedulePersistGeneratedChords } from '../lib/chordCache';
import { useT } from '../lib/i18n';
import { difficultyLabel } from '../utils/difficultyLabel';

interface SongViewerProps {
  song: Song;
  /** A cifra ainda está sendo buscada na nuvem (a lista só tem metadados). */
  contentLoading?: boolean;
  /** Links de afiliado (card "Patrocinado" na cifra). */
  affiliateLinks?: AffiliateLink[];
  /** Gate do intersticial para downloads (o App decide cadência/limite). */
  onGateDownload?: (run: () => void) => void;
  onBack: () => void;
  onEdit: (song: Song) => void;
  onAddToPlaylist?: (song: Song) => void;
  onDelete?: (songId: string) => void;
  /** Só o admin (iluminatto@gmail.com) pode excluir músicas do acervo. */
  isAdmin?: boolean;
  currentUser?: { id?: string; name: string; email: string } | null;
  isInRepertoire?: boolean;
  onToggleRepertoire?: () => void;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
  isVoted?: boolean;
  onVoteSong?: (song: Song) => void;
}

export const SongViewer: React.FC<SongViewerProps> = ({
  song,
  contentLoading = false,
  affiliateLinks = [],
  onGateDownload,
  onBack,
  onEdit,
  onAddToPlaylist,
  onDelete,
  isAdmin = false,
  currentUser,
  isInRepertoire = false,
  onToggleRepertoire,
  onOpenAuth,
  isVoted = false,
  onVoteSong,
}) => {
  const { t } = useT();
  const videoId = extractYouTubeId(song.youtubeId || song.youtubeUrl || '');
  const [transposeSemitones, setTransposeSemitones] = useState<number>(0);
  // Capotraste: toca no capo N → as CIFRAS exibidas descem N semitons para
  // o som continuar no tom original (capo 2 + formas de C = som em D).
  const [capo, setCapo] = useState<number>(0);
  const effectiveTranspose = transposeSemitones - capo;
  const [fontSize, setFontSize] = useState<number>(18); // px
  const [showVideo, setShowVideo] = useState<boolean>(Boolean(videoId));
  const [floatingVideo, setFloatingVideo] = useState<boolean>(false);
  const [selectedChordModal, setSelectedChordModal] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showTablatures, setShowTablatures] = useState<boolean>(true);
  // Menu "Baixar" — fecha ao clicar em qualquer opção ou no botão de novo
  const [showDownloadMenu, setShowDownloadMenu] = useState<boolean>(false);
  // Baixar é ação "premium": se o App fornecer o gate, o download espera o
  // intersticial (cadência + limite diário); senão, executa direto.
  const runDownload = (fn: () => void) => {
    if (onGateDownload) {
      onGateDownload(fn);
    } else {
      fn();
    }
  };
  // Versão da cifra: 'original' | 'medium' | 'simple'. Toda música difícil
  // ganha versões SIMPLES e MÉDIA geradas pela teoria musical (o app deixa
  // explícito com badges quando a cifra exibida não é a original).
  const [contentVersion, setContentVersion] = useState<'original' | 'medium' | 'simple'>('original');

  const clampSemitone = (value: number) => Math.max(-2, Math.min(2, value));
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(2); // 1 to 5
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  // Versões facilitadas: usa as SALVAS quando existem; para músicas do
  // acervo que ainda não têm versões, gera na hora pela teoria musical
  // (assim TODA música difícil ganha as 3 versões, sem depender de migração).
  const liveVersions = React.useMemo(() => {
    const base = song.content || '';
    if (!isHardSong(base)) return null;
    return {
      simple: song.simplifiedContent || generateSimplifiedContent(base, 'simple'),
      medium: song.mediumContent || generateSimplifiedContent(base, 'medium'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, song.content, song.simplifiedContent, song.mediumContent]);

  const activeContent =
    contentVersion === 'simple' && (song.simplifiedContent || liveVersions)
      ? song.simplifiedContent || liveVersions!.simple
      : contentVersion === 'medium' && (song.mediumContent || liveVersions)
      ? song.mediumContent || liveVersions!.medium
      : song.content;
  const uniqueChords = extractUniqueChords(activeContent, effectiveTranspose);
  const parsedLines = parseChordPro(activeContent, effectiveTranspose);
  const displayedKey = transposeChordName(song.key || 'C', transposeSemitones);

  // Ao abrir uma música, o motor pode gerar acordes que não existiam no
  // dicionário — persiste em localStorage + Supabase (compartilhado entre
  // dispositivos) para a próxima vez carregar do cache em vez de regenerar.
  useEffect(() => {
    schedulePersistGeneratedChords(1500);
  }, [song.id, activeContent]);

  // SEO: atualiza <title> e <meta> no head (as hashtags ficam apenas nos dados, sem UI visível)
  useSongSeo({
    title: song.title,
    artist: song.artist,
    key: song.key,
    difficulty: song.difficulty,
    chords: uniqueChords,
    strummingPattern: song.strummingPattern,
    category: song.category,
    autoUpdateHead: true, // Dynamically updates <title> and <meta> tags in document head
  });

  // SEO estruturado: JSON-LD MusicRecording + canonical + og:url — para o
  // Google/WhatsApp/redes entenderem que esta página É uma música (crawlers
  // também recebem o prerender completo via /api/musica no servidor).
  useEffect(() => {
    // Usa o origin real (produção = ukemasterpro.com; dev = localhost)
    const siteUrl = window.location.origin;
    const pageUrl = `${siteUrl}/musica/${encodeURIComponent(song.id)}`;

    // Só remove no cleanup o que ESTE componente criou (se já existia um
    // canonical/og:url de outra origem, não apagamos o de outra pessoa)
    const created: HTMLElement[] = [];

    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
      created.push(link);
    }
    link.href = pageUrl;

    let ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
      created.push(ogUrl);
    }
    ogUrl.setAttribute('content', pageUrl);

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'MusicRecording',
      name: song.title,
      byArtist: { '@type': 'MusicGroup', name: song.artist },
      ...(song.key ? { inKey: song.key } : {}),
      ...(song.category ? { genre: song.category } : {}),
      url: pageUrl,
      publisher: { '@type': 'Organization', name: 'UkeMaster Pro', url: siteUrl },
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-song-jsonld]');
    if (!script) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-song-jsonld', '1');
      document.head.appendChild(script);
      created.push(script);
    }
    script.textContent = JSON.stringify(jsonLd);

    return () => {
      // Remove só o que criamos — JSON-LD de uma música não vaza para outra
      created.forEach((el) => el.remove());
    };
  }, [song.id, song.title, song.artist, song.key, song.category]);

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

  // Resolve o acorde completo: dicionário → motor de voicings (gerado) →
  // simplificação pela teoria musical. Nunca apresenta acorde sem diagrama.
  const resolveChordForDisplay = (chordName: string) => {
    const res = resolveChordWithTheory(chordName);
    if (res) {
      return {
        name: chordName,
        def: res.def,
        simplified: res.simplified,
        generated: res.generated,
        reason: res.reason,
      };
    }
    return { name: chordName, def: undefined, simplified: false, generated: false, reason: undefined };
  };

  const modalChordDef = selectedChordModal
    ? resolveChordForDisplay(selectedChordModal)
    : null;

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Toolbar */}
      <div className="bg-white/95 border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 sticky top-2 z-30 backdrop-blur-md">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-slate-700 hover:text-orange-600 font-extrabold text-xs px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-orange-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('viewer.back')}
        </button>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Community Vote Button (rating) */}
          <button
            onClick={() => onVoteSong?.(song)}
            title={
              isVoted
                ? t('viewer.removeVote')
                : currentUser
                ? t('viewer.vote')
                : t('viewer.loginToVote')
            }
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
              isVoted
                ? 'bg-amber-400 text-[#1D2D44] border-amber-400 shadow-sm'
                : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-400 hover:text-[#1D2D44]'
            }`}
          >
            <Star className={`w-4 h-4 ${isVoted ? 'fill-current' : ''}`} />
            {isVoted ? t('viewer.voted') : t('viewer.vote')}
            <span className="tabular-nums opacity-80">({song.votes ?? 0})</span>
          </button>

          {/* Private Repertoire Button */}
          {isInRepertoire ? (
            <button
              onClick={onToggleRepertoire}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Esta música está no seu repertório privado"
            >
              <FolderHeart className="w-4 h-4 text-emerald-600 fill-current" /> {t('viewer.inRepertoire')}
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
              <FolderHeart className="w-4 h-4" /> {t('viewer.addRepertoire')}
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
              {showVideo ? t('viewer.showVideo') : t('viewer.hideVideo')}
            </button>
          ) : (
            <button
              onClick={() => onEdit(song)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-500 hover:text-white transition-colors cursor-pointer"
              title="Buscar e Adicionar Vídeo da Música no YouTube"
            >
              <Youtube className="w-4 h-4 text-red-500" /> {t('viewer.addVideo')}
            </button>
          )}

          {onAddToPlaylist && (
            <button
              onClick={() => onAddToPlaylist(song)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-orange-500" /> {t('viewer.playlist')}
            </button>
          )}

          {/* Baixar: HTML com diagramas / TXT / Imprimir-PDF — baixar/exportar
              é ação de membro → exige login (nunca exportar sem logar). */}
          <div className="relative">
            <button
              onClick={() => {
                if (!currentUser) {
                  onOpenAuth?.('login');
                  return;
                }
                setShowDownloadMenu((v) => !v);
              }}
              aria-expanded={showDownloadMenu}
              aria-haspopup="menu"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                currentUser && showDownloadMenu
                  ? 'bg-[#0E7C7B] text-white border-[#0E7C7B]'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:border-[#0E7C7B] hover:text-[#0E7C7B]'
              }`}
              title={currentUser ? 'Baixar cifra (letra + diagramas de acordes)' : t('viewer.loginToDownload')}
            >
              <Download className="w-4 h-4" /> {t('viewer.download')}
            </button>

            {showDownloadMenu && (
              <>
                {/* Backdrop invisível: clicar fora fecha o menu */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowDownloadMenu(false)}
                />
                <div
                  role="menu"
                  aria-label="Opções de download"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowDownloadMenu(false);
                  }}
                  className="absolute right-0 top-full mt-2 z-30 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl p-1.5 animate-fade-in"
                >
                  <button
                    onClick={() => {
                      setShowDownloadMenu(false);
                      runDownload(() => downloadSongHtml(song));
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-teal-50 text-left transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#0E7C7B]" />
                    <span>
                      <span className="block text-xs font-extrabold text-slate-800">Baixar .HTML</span>
                      <span className="block text-[10px] text-slate-500">Letra + cifra + diagramas de acordes (tom original)</span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDownloadMenu(false);
                      runDownload(() => downloadSongTxt(song));
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-teal-50 text-left transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#0E7C7B]" />
                    <span>
                      <span className="block text-xs font-extrabold text-slate-800">Baixar .TXT</span>
                      <span className="block text-[10px] text-slate-500">Texto ChordPro puro (para importar depois)</span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setShowDownloadMenu(false);
                      runDownload(() => printSong(song));
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-orange-50 text-left transition-colors cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-[#F26419]" />
                    <span>
                      <span className="block text-xs font-extrabold text-slate-800">Imprimir / Salvar PDF</span>
                      <span className="block text-[10px] text-slate-500">Abre a impressão — escolha "Salvar como PDF"</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => onEdit(song)}
            title={currentUser ? 'Editar Cifra' : 'Faça login para editar cifras'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition-colors cursor-pointer"
          >
            <Edit3 className="w-4 h-4" /> {t('viewer.editSong')}
          </button>

          {onDelete && isAdmin && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-rose-600 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Excluir Música Definitivamente"
            >
              <Trash2 className="w-4 h-4 text-rose-500" /> {t('viewer.deleteSong')}
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
                {t('viewer.originalKey')} {song.key}
              </span>
              {song.category && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-extrabold border border-[#0E7C7B]/20 inline-flex items-center gap-1">
                  <Tag className="w-3 h-3" />
                  {song.category}
                </span>
              )}
              {song.difficulty && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200">
                  {t('playlist.mode')} {difficultyLabel(t, song.difficulty)}
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

        {/* Versões da cifra (original/média/simples) — sempre visível quando
            a música tem versões geradas pela teoria musical (salvas OU
            geradas na hora para o acervo existente) */}
        {(song.simplifiedContent || song.mediumContent || liveVersions) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50/80 border border-amber-200 p-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-black text-[#F26419] uppercase tracking-wide shrink-0">
                {t('viewer.version')}
              </span>
              <span className="text-[11px] text-amber-800 font-semibold leading-tight">
                {t('viewer.versionsExplain')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'original' as const, label: t('viewer.professional'), enabled: true },
                  { id: 'medium' as const, label: t('viewer.medium'), enabled: !!(song.mediumContent || liveVersions) },
                  { id: 'simple' as const, label: t('viewer.simple'), enabled: !!(song.simplifiedContent || liveVersions) },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  onClick={() => v.enabled !== false && setContentVersion(v.id)}
                  disabled={v.enabled === false}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all cursor-pointer ${
                    contentVersion === v.id
                      ? 'bg-[#F26419] text-white shadow-md shadow-[#F26419]/25'
                      : 'bg-white text-amber-700 border border-amber-300 hover:border-[#F26419] hover:text-[#F26419]'
                  } ${v.enabled === false ? 'opacity-40 cursor-not-allowed' : ''}`}                    title={
                      v.id === 'original'
                        ? 'Cifra original (versão profissional)'
                        : v.id === 'medium'
                        ? 'Versão média: extensões removidas, sétimas mantidas'
                        : 'Versão simples: só tríades (maior/menor)'
                    }
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Transpose & Auto-scroll Controls Row */}
        <div className={`grid grid-cols-1 md:grid-cols-2 ${hasTablatures ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 pt-2`}>
          {/* Transposition Control */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-xs text-slate-500 font-bold block">{t('viewer.transpose')}</span>
              <span className="text-orange-600 font-mono font-bold text-sm">
                {transposeSemitones === 0 && capo === 0
                  ? `${t('viewer.currentKey')} ${song.key || 'C'}`
                  : `${t('misc.key')}: ${displayedKey} ${capo > 0 ? `· ${t('viewer.capo')} ${capo}` : ''}`}
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
            {/* Capotraste */}
            <div className="col-span-2 flex items-center justify-between border-t border-slate-200/70 pt-2 mt-2">
              <div className="min-w-0">
                <span className="text-xs text-slate-500 font-bold block">{t('viewer.capo')}</span>
                <span className={`text-xs font-bold ${capo > 0 ? 'text-[#0E7C7B]' : 'text-slate-400'}`}>
                  {capo === 0
                    ? t('viewer.noCapo')
                    : `${t('viewer.capo')} ${capo}: toque as cifras abaixo ${capo} semitom(s) abaixo`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCapo((prev) => Math.max(0, prev - 1))}
                  className="p-2 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] text-slate-700 font-bold text-xs cursor-pointer shadow-2xs"
                  title="-1 casa do capo"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-xs font-black text-[#0E7C7B] font-mono">{capo}</span>
                <button
                  onClick={() => setCapo((prev) => Math.min(8, prev + 1))}
                  className="p-2 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] text-slate-700 font-bold text-xs cursor-pointer shadow-2xs"
                  title="+1 casa do capo"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
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
                {isAutoScrolling ? t('viewer.pauseScroll') : t('viewer.autoScroll')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-semibold">{t('viewer.speed')}</span>
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
            <span className="text-xs text-slate-500 font-semibold">{t('viewer.fontSize')}</span>
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
                <span className="text-xs text-slate-500 font-semibold block">{t('viewer.tabs')}</span>
                <span className="text-slate-800 text-xs font-bold">
                  {showTablatures ? t('viewer.showingTabs') : t('viewer.hiddenTabs')}
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
                {showTablatures ? t('viewer.hideTabs') : t('viewer.showTabs')}
              </button>
            </div>
          )}
        </div>

        {/* Quick Chord Diagrams Bar at top of song */}
        {uniqueChords.length > 0 && (
          <div className="pt-3 border-t border-slate-200">
            <span className="text-xs font-extrabold text-[#1D2D44] uppercase tracking-wider block mb-3">
              {t('viewer.chordsUsed')} ({uniqueChords.length}):
            </span>
            <div className="flex flex-wrap gap-3 overflow-x-auto pb-2">
              {uniqueChords.map((chordName) => {
                const resolved = resolveChordForDisplay(chordName);
                if (!resolved.def) {
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
                    title={resolved.reason ? `Sem diagrama de ${chordName}; ${resolved.reason}` : undefined}
                  >
                    <ChordDiagram
                      chordName={chordName}
                      fingering={resolved.def.fingerings[0]}
                      size="sm"
                    />
                    {resolved.simplified && (
                      <p className="text-[10px] text-center mt-0.5 text-[#0E7C7B] font-bold">
                        {t('viewer.playAs')} {resolved.def.name}
                      </p>
                    )}
                    {!resolved.simplified && resolved.generated && (
                      <p className="text-[10px] text-center mt-0.5 text-[#F26419] font-bold">
                        {t('viewer.generated')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

      {/* Card de AFILIADO — topo da cifra (rotativo, uma loja por vez) */}
      <AffiliateAdCard links={affiliateLinks} placement="song_viewer" dismissible />

      {/* Main Content Area: Side-by-Side Grid when video is shown */}
      <div className={showVideo && videoId ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" : "w-full"}>
        {/* Main Interactive Chord Sheet View - Theme Matched */}
        <div
          ref={scrollContainerRef}
          className={`bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-sm max-h-[75vh] overflow-y-auto overflow-x-hidden min-w-0 space-y-4 font-mono select-text ${
            showVideo && videoId ? 'lg:col-span-7 xl:col-span-8' : 'w-full'
          }`}
          style={{ fontSize: `${fontSize}px` }}
        >              {/* Badge explícito: a cifra exibida NÃO é a original */}
              {contentVersion !== 'original' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                  <Sparkles className="w-4 h-4 text-[#F26419] shrink-0" />
                  <span className="text-xs font-bold">
                    {contentVersion === 'simple'
                      ? t('viewer.simpleBadge')
                      : t('viewer.mediumBadge')}
                  </span>
                </div>
              )}

              {contentLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-8 h-8 rounded-full border-4 border-[#0E7C7B]/20 border-t-[#0E7C7B] animate-spin" />
              <p className="text-xs font-bold text-slate-400 mt-3">{t('viewer.loadingSong')}</p>
            </div>
          ) : !(song.content || '').trim() ? (
            <div className="text-center py-16">
              <p className="text-sm font-bold text-slate-500">
                {t('viewer.noSong')}
              </p>
            </div>
          ) : (
          groupedRenderItems.map((item, itemIdx) => {
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
                <div key={itemIdx} className="line-block leading-relaxed my-2 max-w-full">
                  {hasChords ? (
                    <div className="flex flex-wrap items-baseline gap-x-1 py-1 min-w-0">
                      {line.tokens.map((token, tokenIdx) => (
                        <span
                          key={tokenIdx}
                          className="inline-flex flex-col items-start relative group max-w-full min-w-0"
                        >
                          {token.chord ? (
                            <button
                              onClick={() => {
                                const resolved = resolveChordForDisplay(token.chord!);
                                if (resolved.def) {
                                  playUkuleleChord(resolved.def.fingerings[0].frets);
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
                          <span className="text-[#1D2D44] font-semibold whitespace-pre-wrap break-words">
                            {token.text}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-slate-700 whitespace-pre-wrap break-words">{line.rawLine}</div>
                  )}
                </div>
              );
            }

              return <React.Fragment key={itemIdx}>{itemContent}</React.Fragment>;
            })
          )}
        </div>

        {/* Embedded YouTube Side Panel */}
        {showVideo && videoId && (
          <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-24 space-y-3 min-w-0">
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5">
              <span className="text-xs text-[#1D2D44] font-bold flex items-center gap-2">
                <Youtube className="w-4 h-4 text-red-500" /> {t('viewer.videoLesson')}
              </span>
              <button
                onClick={() => {
                  setShowVideo(false);
                  setFloatingVideo(true);
                }}
                className="text-xs text-slate-500 hover:text-[#F26419] flex items-center gap-1 font-semibold cursor-pointer"
                title="Transformar em janela flutuante"
              >
                <Maximize2 className="w-3.5 h-3.5" /> {t('viewer.floating')}
              </button>
            </div>
            <YouTubePlayer youtubeUrlOrId={videoId} songTitle={song.title} />
          </div>
        )}
      </div>

      {/* Bottom Ad Banner after chord sheet */}
      <AdSenseSlot format="horizontal" label={t('viewer.adGoogle')} />

      {/* Comunidade: comentários + correção de cifra (contribuir exige login) */}
      <SongComments
        songId={song.id}
        songTitle={song.title}
        isLoggedIn={!!currentUser}
        userId={currentUser?.id}
        userName={currentUser?.name}
        onOpenAuth={onOpenAuth}
      />

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
              <Logo size="sm" />
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-black text-[#F26419] font-mono">
                  Acorde: {selectedChordModal}
                </h3>
                <button
                  onClick={() => setSelectedChordModal(null)}
                  className="text-slate-400 hover:text-slate-800 font-bold text-lg p-1"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            {modalChordDef ? (
              <div className="space-y-4">
                {modalChordDef.simplified && (
                  <p className="text-xs text-[#0E7C7B] font-bold bg-[#0E7C7B]/5 border border-[#0E7C7B]/15 rounded-xl px-3 py-2">
                    {t('viewer.simplifiedBadge')}{' '}
                    <span className="font-mono font-black">{modalChordDef.def.name}</span>
                    (o baixo invertido não muda a mão do acorde no ukulele).
                  </p>
                )}
                {!modalChordDef.simplified && modalChordDef.generated && (
                  <p className="text-xs text-[#F26419] font-bold bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
                    {t('viewer.generatedBadge')}{' '}
                    <span className="font-mono font-black">{modalChordDef.def.name}</span>.
                  </p>
                )}
                <div className="flex justify-center py-2">
                  <ChordDiagram
                    chordName={selectedChordModal || ''}
                    fingering={modalChordDef.def.fingerings[0]}
                    size="lg"
                  />
                </div>
                <button
                  onClick={() => playUkuleleChord(modalChordDef.def.fingerings[0].frets)}
                  className="w-full py-3 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-extrabold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#0E7C7B]/20"
                >
                  <Volume2 className="w-4 h-4" /> {t('viewer.playSound')}
                </button>
              </div>
            ) : (
              <div className="py-6 text-slate-500 text-sm">
                {t('viewer.noDiagram')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && onDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Logo size="sm" />
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{t('viewer.deleteSong')}</h3>
                  <p className="text-xs text-slate-500">Esta ação irá remover a música do acervo.</p>
                </div>
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
                {t('misc.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  onDelete(song.id);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-colors shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> {t('viewer.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
