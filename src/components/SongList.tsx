/**
 * Listagem principal do acervo: busca/filtros por gênero e nível, ranking Mais Votadas (estilo CifraClub), linhas densas de músicas, ações (votar, playlist, editar, excluir só admin) e widgets laterais (Em Alta, Artistas, Repertório).
 *
 * HOME DINÂMICA: quando não há busca/filtro ativo, a página abre com uma
 * vitrine variada — ranking hero, mini-rankings (Em Alta / Mais Acessadas /
 * Novidades / Contribuidores), parceiros, patrocinado e blog — e só DEPOIS
 * vem a lista de canções. Cada bloco aparece apenas quando tem conteúdo,
 * então a home nunca vira uma parede massiva de músicas.
 */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Song, Playlist, SONG_CATEGORIES, SONG_DIFFICULTIES } from '../types';
import {
  Search,
  Plus,
  Music,
  Trash2,
  Edit3,
  Download,
  Upload,
  ListPlus,
  Play,
  User,
  ChevronRight,
  ChevronDown,
  Star,
  Tag,
  Gauge,
  TrendingUp,
  Flame,
  Eye,
  BarChart3,
  Sparkles,
  Newspaper,
  Calendar,
  FolderHeart,
  ListMusic,
} from 'lucide-react';
import { ImportSongModal } from './ImportSongModal';
import { TopContributors } from './TopContributors';
import { AdSenseSlot } from './AdSenseSlot';
import { ADSENSE_SLOTS } from '../config';
import { getAbVariant } from '../lib/abTest';
import { AffiliateAdCard } from './AffiliateAdCard';
import { PartnersSection } from './PartnersSection';
import type { AffiliateLink, PartnerLink, BlogPost } from '../types';
import { fetchTrendingSongIds } from '../lib/ratings';
import { useT } from '../lib/i18n';
import { difficultyLabel } from '../utils/difficultyLabel';

// ── Mini-ranking genérico da vitrine (Em Alta / Mais Acessadas / Novidades) ──
// Definido FORA do componente: com 5k músicas e re-renders frequentes, um
// componente definido no corpo seria recriado a cada render (remount churn).
const MiniRanking: React.FC<{
  title: string;
  icon: React.ReactNode;
  accent: string; // classe de cor do número #1
  items: Song[];
  value: (s: Song) => number;
  valueIcon?: React.ReactNode;
  onSelect: (s: Song) => void;
  emptyText: string;
}> = ({ title, icon, accent, items, value, valueIcon, onSelect, emptyText }) => (
  <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-1.5">
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
        {icon} {title}
      </h3>
      {items.length > 0 && (
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
          Top {items.length}
        </span>
      )}
    </div>

    {items.length === 0 ? (
      <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">{emptyText}</p>
    ) : (
      <div className="space-y-0.5">
        {items.map((song, idx) => (
          <button
            key={song.id}
            onClick={() => onSelect(song)}
            className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left group cursor-pointer"
          >
            <span
              className={`w-5 text-center font-black text-sm shrink-0 transition-colors ${
                idx === 0 ? accent : idx < 3 ? 'text-amber-500' : 'text-slate-300'
              } group-hover:text-[#F26419]`}
            >
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-900 truncate group-hover:text-orange-600 transition-colors">
                {song.title}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{song.artist}</p>
            </div>
            <span className="flex items-center gap-0.5 text-[10px] font-black text-slate-500 shrink-0 tabular-nums">
              {valueIcon}
              {value(song).toLocaleString('pt-BR')}
            </span>
          </button>
        ))}
      </div>
    )}
  </div>
);

interface SongListProps {
  songs: Song[];
  playlists: Playlist[];
  /** Links de afiliado (cards "Patrocinado" no feed). */
  affiliateLinks?: AffiliateLink[];
  /** Parceiros (vídeos/cursos/links — seção no sidebar). */
  partnerLinks?: PartnerLink[];
  /** Posts do blog — os mais recentes ganham vitrine na home. */
  blogPosts?: BlogPost[];
  /** Navega para a aba Blog ("ver todos os artigos"). */
  onOpenBlog?: () => void;
  /** Abre o gerenciador de playlists (widget REPERTÓRIO ATUAL). */
  onOpenPlaylists?: () => void;
  onSelectSong: (song: Song) => void;
  onEditSong: (song: Song) => void;
  onDeleteSong: (songId: string) => void;
  onCreateNewSong: () => void;
  onAddToPlaylist: (song: Song) => void;
  onExportSongs: () => void;
  onImportSongs: (importedSongs: Song[]) => void;
  searchQuery?: string;
  setSearchQuery?: (query: string) => void;
  myVotes?: Set<string>;
  onVoteSong?: (song: Song) => void;
  /** Só o admin (iluminatto@gmail.com) pode excluir músicas do acervo. */
  isAdmin?: boolean;
  /** Enviar/importar músicas exige login (usuário autenticado). */
  isLoggedIn?: boolean;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
  /** O acervo da nuvem ainda está carregando (mostra indicador no contador). */
  catalogLoading?: boolean;
  /** Usuário logado — destaque no ranking de contribuidores. */
  currentUser?: { id: string; name: string } | null;
  /** Incrementa a cada contribuição da sessão (o ranking re-busca). */
  contributionsRefreshKey?: number;
}

export const SongList: React.FC<SongListProps> = ({
  songs,
  playlists,
  affiliateLinks = [],
  partnerLinks = [],
  blogPosts = [],
  onOpenBlog,
  onOpenPlaylists,
  onSelectSong,
  onEditSong,
  onDeleteSong,
  onCreateNewSong,
  onAddToPlaylist,
  onExportSongs,
  onImportSongs,
  searchQuery: externalSearchQuery,
  setSearchQuery: externalSetSearchQuery,
  isAdmin = false,
  isLoggedIn = false,
  onOpenAuth,
  myVotes,
  onVoteSong,
  catalogLoading = false,
  currentUser = null,
  contributionsRefreshKey = 0,
}) => {
  const { t, lang } = useT();

  // Base das SUGESTÕES da home: músicas do idioma da interface (mais as 'multi'
  // e as sem idioma — importadas pelo usuário). Se o idioma NÃO tiver nenhuma
  // música nativa (ex.: 'ar'/'zh' ainda sem acervo), cai para o acervo todo —
  // a home nunca fica vazia e as 'multi' sozinhas não prendem o fallback.
  // A BUSCA (filteredSongs) continua GLOBAL.
  const langBaseSongs = useMemo(() => {
    const hasNative = songs.some((s) => s.lang === lang);
    if (!hasNative) return songs;
    return songs.filter((s) => !s.lang || s.lang === lang || s.lang === 'multi');
  }, [songs, lang]);
  const [internalSearchQuery, setInternalSearchQuery] = useState<string>('');

  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = externalSetSearchQuery || setInternalSearchQuery;

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string>('all');
  const [showAllArtists, setShowAllArtists] = useState<boolean>(false);
  // Lista de artistas secundária: no celular já nasce recolhida (só o cabeçalho
  // visível) para não roubar o protagonismo das músicas; no desktop abre normal.
  const [artistsCollapsed, setArtistsCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );
  const [activeSubTab, setActiveSubTab] = useState<'artistas' | 'listas' | 'todas'>('todas');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);
  // Paginação da lista (estilo CifraClub): mostra 10 por vez e carrega mais sob
  // demanda — essencial para o acervo de milhares de canções não travar o
  // navegador nem enterrar o resto da página (parceiros, widgets) numa lista
  // infinita logo na primeira tela.
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // Nova busca limpa o filtro de artista selecionado (evita "nenhuma cifra
  // encontrada" quando artista + busca se combinam e dão zero resultados).
  useEffect(() => {
    if (searchQuery.trim()) {
      setSelectedArtistFilter('all');
    }
  }, [searchQuery]);

  // Qualquer mudança de filtro/busca reinicia a paginação.
  useEffect(() => {
    setVisibleCount(10);
  }, [searchQuery, selectedCategory, selectedDifficulty, selectedArtistFilter]);

  // Extract unique list of artists with counts
  const artistsList = useMemo(() => {
    const artistMap = new Map<string, number>();
    songs.forEach((s) => {
      const name = s.artist.trim();
      artistMap.set(name, (artistMap.get(name) || 0) + 1);
    });

    const defaultSampleArtists = [
      'Alceu Valença',
      "Israel Kamakawiwo'ole",
      'Vance Joy',
      'Jason Mraz',
      'Billie Eilish',
      'Ana Gabriela',
      'Jem',
    ];

    defaultSampleArtists.forEach((a) => {
      if (!artistMap.has(a)) {
        artistMap.set(a, 0);
      }
    });

    return Array.from(artistMap.entries())
      .map(([name, count]) => ({
        name,
        count,
        // Avatar inicial confiável (DiceBear) — URLs falsas do Unsplash não carregam.
        avatar: `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
          name
        )}&backgroundColor=0e7c7b&fontWeight=600`,
      }))
      // Artistas com músicas primeiro (os demais são exemplos/placeholders)
      .sort((a, b) => b.count - a.count);
  }, [songs]);

  // Mostra no máximo 5 artistas; o resto fica sob "Ver todos" para a lista
  // não roubar o protagonismo das músicas na página inicial.
  // Se o artista selecionado estiver além dos 5, ele entra na lista visível
  // para a seleção nunca sumir silenciosamente.
  const visibleArtists = useMemo(() => {
    if (showAllArtists) return artistsList;
    const top = artistsList.slice(0, 5);
    const selected = selectedArtistFilter === 'all'
      ? null
      : artistsList.find(
          (a) => a.name.toLowerCase() === selectedArtistFilter.toLowerCase()
        );
    if (selected && !top.some((a) => a.name === selected.name)) {
      return [...top, selected];
    }
    return top;
  }, [artistsList, showAllArtists, selectedArtistFilter]);

  // Normaliza texto para busca: minúsculas + remove acentos (caetano == caetano).
  const normalizeSearch = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const filteredSongs = songs.filter((s) => {
    const query = normalizeSearch(searchQuery.trim());

    // Comprehensive search match across title (música), artist (autor/artista), category (categoria/gênero), tags, key, content
    const matchSearch =
      !query ||
      normalizeSearch(s.title || '').includes(query) ||
      normalizeSearch(s.artist || '').includes(query) ||
      (s.category && normalizeSearch(s.category).includes(query)) ||
      (s.tags && s.tags.some((tag) => normalizeSearch(tag).includes(query))) ||
      (s.key && normalizeSearch(s.key).includes(query)) ||
      (s.content && normalizeSearch(s.content).includes(query));

    const matchDifficulty =
      selectedDifficulty === 'all' ||
      s.difficulty === selectedDifficulty ||
      (selectedDifficulty === 'Simplificado' && (s.difficulty === 'Iniciante' || s.difficulty === 'Simplificado')) ||
      (selectedDifficulty === 'Médio' && (s.difficulty === 'Intermediário' || s.difficulty === 'Médio'));

    const matchCategory =
      selectedCategory === 'all' || (s.category && s.category.toLowerCase() === selectedCategory.toLowerCase());

    const matchArtist =
      selectedArtistFilter === 'all' || s.artist.toLowerCase() === selectedArtistFilter.toLowerCase();

    return matchSearch && matchDifficulty && matchCategory && matchArtist;
  });

  // ── Mais Votadas: top 10 por votos da comunidade (com empate por título) —
  // filtradas pelo idioma da interface (sugestões do idioma em questão).
  const topVotedSongs = useMemo(() => {
    return [...langBaseSongs]
      .filter((s) => (s.votes ?? 0) > 0)
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.title.localeCompare(b.title))
      .slice(0, 10);
  }, [langBaseSongs]);

  // ── Ranking principal (hero estilo CifraClub): se ainda não há votos,
  // usa as músicas mais RECENTES (novidades) para o ranking nunca ficar vazio.
  const heroSongs = useMemo(() => {
    if (topVotedSongs.length > 0) return topVotedSongs;
    return [...langBaseSongs]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10);
  }, [topVotedSongs, langBaseSongs]);

  // ── EM ALTA: top 8 por votos RECENTES (14 dias) — o "que está bombando" ──
  const [trendingMap, setTrendingMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    fetchTrendingSongIds(14, 300).then((map) => {
      if (!cancelled) setTrendingMap(map);
    });
    return () => {
      cancelled = true;
    };
    // Depende de myVotes para o widget refletir um voto dado na sessão atual.
  }, [myVotes?.size]);

  const trendingSongs = useMemo(() => {
    return [...langBaseSongs]
      .filter((s) => (trendingMap.get(s.id) ?? 0) > 0)
      .sort(
        (a, b) =>
          (trendingMap.get(b.id) ?? 0) - (trendingMap.get(a.id) ?? 0) ||
          (b.votes ?? 0) - (a.votes ?? 0) ||
          a.title.localeCompare(b.title)
      )
      .slice(0, 5);
  }, [langBaseSongs, trendingMap]);

  // ── MAIS ACESSADAS: top 5 por visualizações (do idioma) ──
  const mostViewedSongs = useMemo(() => {
    return [...langBaseSongs]
      .filter((s) => (s.views ?? 0) > 0)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0) || a.title.localeCompare(b.title))
      .slice(0, 5);
  }, [langBaseSongs]);

  // ── NOVIDADES: top 5 recém-adicionadas (vitrine da home, do idioma) ──
  const recentSongs = useMemo(() => {
    return [...langBaseSongs]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5);
  }, [langBaseSongs]);

  const totalVotes = useMemo(
    () => langBaseSongs.reduce((acc, s) => acc + (s.votes ?? 0), 0),
    [langBaseSongs]
  );

  // ── Stats aggregados da home: total de artistas, votos e visualizações ──
  const totalArtists = useMemo(
    () => new Set(songs.map((s) => s.artist.trim())).size,
    [songs]
  );
  const totalViews = useMemo(
    () => songs.reduce((acc, s) => acc + (s.views ?? 0), 0),
    [songs]
  );

  // Trecho da LETRA para o preview do card — o foco visual é a letra,
  // não os diagramas de acordes (que ficam no viewer da cifra).
  const lyricsPreviewMap = useMemo(() => {
    const map = new Map<string, string>();
    songs.forEach((song) => {
      // Extrai linhas de LETRA REAL: remove acordes/parênteses, exige ao
      // menos 2 palavras (descarta 'Intro:', '(Riff)', símbolos e tabs).
      const lines = (song.content || '')
        .split('\n')
        // Linha que é SÓ um cabeçalho/acorde em colchetes ([Intro], [Primeira
        // Parte], [G]) NÃO é letra — checa ANTES de remover os colchetes.
        .filter((l) => !/^\[[^\[\]]*\]\s*$/.test(l.trim()))
        .map((l) => l.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ' ').trim())
        .filter((l) => /[a-zà-ú]/i.test(l))
        .filter((l) => l.split(/\s+/).filter(Boolean).length >= 2)
        .filter((l) => !/^(intro|verso|refrão|refrao|ponte|solo|final|outro|bridge|chorus|verse|instrumental|primeira|segunda|terceira|quarta)[\s:]*(parte|estrofe)?$/i.test(l))
        .filter((l) => !/^\s*[A-Ga-g]\|/.test(l) && !/^\|?\s*[\d\-xphv/\\~ ]+\|?$/.test(l) && !/^\{\/?[a-z]+\}$/i.test(l))
        .filter((l) => !/transcrita por|digitada por|letra por|envie por|colaboração/i.test(l))
        .slice(0, 3);
      map.set(song.id, lines.join('\n') || song.title);
    });
    return map;
  }, [songs]);

  const todayScrollRef = useRef<HTMLDivElement>(null);

  // Ref para rolar até a seção de canções quando um artista é escolhido.
  const songsSectionRef = useRef<HTMLDivElement>(null);

  const handleArtistClick = (name: string) => {
    const isSelected = selectedArtistFilter.toLowerCase() === name.toLowerCase();
    setSelectedArtistFilter(isSelected ? 'all' : name);
    if (!isSelected) {
      // Leva o usuário até a seção com os itens do artista escolhido.
      requestAnimationFrame(() => {
        songsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  const selectedArtistCount =
    selectedArtistFilter === 'all'
      ? 0
      : songs.filter(
          (s) => s.artist.toLowerCase() === selectedArtistFilter.toLowerCase()
        ).length;

  const getDifficultyBadgeClass = (diff?: string) => {
    if (diff === 'Simplificado' || diff === 'Iniciante') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (diff === 'Avançado') {
      return 'bg-orange-50 text-orange-700 border-orange-200';
    }
    return 'bg-amber-50 text-amber-700 border-amber-200'; // Médio / Intermediário
  };

  const shownSongs = filteredSongs.slice(0, visibleCount);
  const hasMore = filteredSongs.length > visibleCount;

  // Ranking hero estilo CifraClub: escondido quando há busca ou filtro ativo
  // (aí o foco é o resultado filtrado, não o ranking global — igual ao CifraClub).
  const isFiltering =
    searchQuery.trim().length > 0 ||
    selectedArtistFilter !== 'all' ||
    selectedCategory !== 'all' ||
    selectedDifficulty !== 'all';

  // Posts do blog habilitados, mais recentes primeiro (vitrine: top 2).
  const blogVisible = useMemo(
    () =>
      blogPosts
        .filter((p) => p.enabled)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 2),
    [blogPosts]
  );

  const hasAffiliates = affiliateLinks.filter((l) => l.enabled).length > 0;
  const hasPartners = partnerLinks.filter((p) => p.enabled).length > 0;

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header: BIBLIOTECA (LIBRARY) + tabs — conforme template */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase font-sans">
              {t('library.title')}
            </h1>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-0.5">
              {catalogLoading
                ? t('misc.loading')
                : `${songs.length} ${t('library.subtitle')}`}
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => (isLoggedIn ? setIsImportModalOpen(true) : onOpenAuth?.('signup'))}
              title={isLoggedIn ? 'Importar cifras' : t('library.loginToEdit')}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:border-orange-400 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-orange-500" /> {t('library.import')}
            </button>
            <button
              onClick={() => (isLoggedIn ? onExportSongs() : onOpenAuth?.('login'))}
              title={isLoggedIn ? 'Exportar acervo (JSON)' : t('library.loginToEdit')}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:border-orange-400 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-orange-500" /> {t('library.export')}
            </button>
            <button
              onClick={() => (isLoggedIn ? onCreateNewSong() : onOpenAuth?.('signup'))}
              title={isLoggedIn ? 'Criar nova cifra' : t('library.loginToEdit')}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" /> {t('library.newSong')}
            </button>
          </div>
        </div>

        {/* Tabs: LISTAS DE ARTISTAS / MINHAS LISTAS / TODAS AS CANÇÕES (laranja à direita) */}
        <div className="flex items-center gap-5 border-b border-slate-200 pb-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('artistas')}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'artistas'
                ? 'text-slate-900 border-b-2 border-orange-500'
                : 'text-slate-400 font-bold hover:text-slate-700'
            }`}
          >
            {t('library.artistLists')}
          </button>
          <button
            onClick={() => setActiveSubTab('listas')}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'listas'
                ? 'text-slate-900 border-b-2 border-orange-500'
                : 'text-slate-400 font-bold hover:text-slate-700'
            }`}
          >
            {t('library.myLists')}
          </button>
          <span className="flex-1 hidden sm:block" />
          <button
            onClick={() => {
              setActiveSubTab('todas');
              setSelectedArtistFilter('all');
            }}
            className="text-xs font-extrabold uppercase tracking-wider pb-1 cursor-pointer whitespace-nowrap text-orange-500 hover:text-orange-600"
          >
            {t('library.allSongs')}
          </button>
        </div>
      </div>

      {/* ════════════════════ HOME DINÂMICA (sem busca/filtro) ════════════════════
          Vitrine de conteúdo variado: stats + ranking hero + mini-rankings + parceiros +
          patrocinado + blog. Cada bloco só aparece quando há dados. */}
      {!isFiltering && (
        <div className="space-y-6">
          {/* ══════════════ STATS BAR: dados agregados do acervo ══════════════ */}
          {songs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F26419]/10 text-[#F26419] flex items-center justify-center shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900 leading-none tabular-nums">
                    {catalogLoading ? '···' : songs.length.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {t('library.songsCount')}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900 leading-none tabular-nums">
                    {catalogLoading ? '···' : totalArtists.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    Artistas
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900 leading-none tabular-nums">
                    {catalogLoading ? '···' : totalVotes.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    {t('library.votes')}
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xl font-black text-slate-900 leading-none tabular-nums">
                    {catalogLoading ? '···' : totalViews.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                    Visualizações
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* RANKING HERO estilo CifraClub: o protagonista da página inicial */}
          {heroSongs.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              {/* Cabeçalho do ranking (fundo grafite da marca) */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-[#1D2D44] to-[#0E7C7B]">
                <h3 className="font-black text-white uppercase text-xs tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-current" />
                  {topVotedSongs.length > 0 ? t('library.mostVoted') : t('library.newest')}
                </h3>
                <span className="text-[10px] font-black text-amber-300 shrink-0">
                  {topVotedSongs.length > 0
                    ? `${totalVotes} ${totalVotes === 1 ? t('library.voteSingular') : t('library.votes')}`
                    : t('library.newest')}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {heroSongs.map((song, idx) => {
                  const medalClass =
                    idx === 0
                      ? 'bg-[#F26419] text-white shadow-sm'
                      : idx === 1
                      ? 'bg-amber-400 text-[#1D2D44] shadow-sm'
                      : idx === 2
                      ? 'bg-[#F8B833] text-[#1D2D44] shadow-sm'
                      : 'bg-slate-100 text-slate-400';
                  const isTop3 = idx < 3;

                  return (
                    <div
                      key={song.id}
                      onClick={() => onSelectSong(song)}
                      className={`group flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2 transition-colors cursor-pointer ${
                        isTop3 ? 'bg-orange-50/40 hover:bg-orange-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Medalha do ranking */}
                      <span
                        className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-xs font-black leading-none ${medalClass}`}
                      >
                        {idx + 1}
                      </span>

                      {/* Thumbnail (vídeo) ou ícone */}
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg overflow-hidden shrink-0 border border-slate-100 bg-slate-50">
                        {song.youtubeId ? (
                          <img
                            src={`https://img.youtube.com/vi/${song.youtubeId}/default.jpg`}
                            alt={song.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#0E7C7B]/10 via-white to-orange-50 flex items-center justify-center">
                            <Music className="w-4 h-4 text-orange-500" />
                          </div>
                        )}
                      </div>

                      {/* Título + artista */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate group-hover:text-orange-600 transition-colors leading-tight">
                          {song.title}
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold truncate">
                          {song.artist}
                          {song.key ? ` · Tom ${song.key}` : ''}
                        </p>
                      </div>

                      {/* Nível + votos (desktop) */}
                      <div className="hidden md:flex items-center gap-2 shrink-0">
                        {song.difficulty && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold border shrink-0 ${getDifficultyBadgeClass(song.difficulty)}`}
                          >
                            <Gauge className="w-2.5 h-2.5" />
                            {difficultyLabel(t, song.difficulty)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-[10px] font-black text-amber-500 shrink-0">
                          <Star className="w-3 h-3 fill-current" />
                          <span className="tabular-nums">{song.votes ?? 0}</span>
                        </span>
                      </div>

                      {/* TOCAR */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSong(song);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#F26419] hover:bg-[#D9530D] text-white font-black text-[10px] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer shrink-0"
                      >
                        <Play className="w-3 h-3 fill-white" /> {t('library.play')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VITRINE de mini-rankings: Em Alta · Mais Acessadas · Novidades · Contribuidores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
            <MiniRanking
              title={t('library.trending')}
              icon={<TrendingUp className="w-3.5 h-3.5 text-[#F26419]" />}
              accent="text-[#F26419]"
              items={trendingSongs}
              value={(s) => trendingMap.get(s.id) ?? 0}
              valueIcon={<Flame className="w-2.5 h-2.5 fill-current" />}
              onSelect={onSelectSong}
              emptyText={t('library.emptyTrending')}
            />

            <MiniRanking
              title={t('library.mostViewed')}
              icon={<BarChart3 className="w-3.5 h-3.5 text-[#0E7C7B]" />}
              accent="text-[#F26419]"
              items={mostViewedSongs}
              value={(s) => s.views ?? 0}
              valueIcon={<Eye className="w-2.5 h-2.5" />}
              onSelect={onSelectSong}
              emptyText={t('library.emptyMostViewed')}
            />

            <MiniRanking
              title={t('library.newest')}
              icon={<Sparkles className="w-3.5 h-3.5 text-[#F26419]" />}
              accent="text-[#F26419]"
              items={recentSongs}
              value={(s) => s.votes ?? 0}
              valueIcon={<Star className="w-2.5 h-2.5 fill-current" />}
              onSelect={onSelectSong}
              emptyText={t('library.emptyNewest')}
            />

            {/* MAIORES CONTRIBUIDORES — ranking de quem mais ajuda a comunidade */}
            <TopContributors
              currentUser={currentUser}
              refreshKey={contributionsRefreshKey}
              onOpenAuth={onOpenAuth}
            />
          </div>

          {/* PARCEIROS & CURSOS — vídeos/cursos/links do proprietário */}
          {hasPartners && <PartnersSection partners={partnerLinks} />}

          {/* PATROCINADO em destaque (afiliado) — antes da lista de canções */}
          {hasAffiliates && (
            <AffiliateAdCard links={affiliateLinks} placement="home_destaque" dismissible />
          )}

          {/* BLOG — últimos artigos do proprietário */}
          {blogVisible.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                  <Newspaper className="w-4 h-4 text-[#0E7C7B]" /> Últimos do Blog
                </h3>
                {onOpenBlog && (
                  <button
                    onClick={onOpenBlog}
                    className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer hover:text-orange-600"
                  >
                    Ver todos os artigos <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {blogVisible.map((p) => (
                  <button
                    key={p.id}
                    onClick={onOpenBlog}
                    title={onOpenBlog ? 'Abrir o Blog' : undefined}
                    className="text-left bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-md rounded-2xl p-4 shadow-2xs transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {p.category && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-extrabold border border-[#0E7C7B]/20 uppercase tracking-wider">
                          {p.category}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-900 leading-snug group-hover:text-orange-600 transition-colors line-clamp-2">
                      {p.title}
                    </h4>
                    {p.excerpt && (
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">
                        {p.excerpt}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Layout estilo CifraClub: coluna principal com a LISTA DENSA de canções
          (o foco) + sidebar com artistas e widgets. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA PRINCIPAL (8/12): CANÇÕES — primeiro no mobile */}
        <div ref={songsSectionRef} className="lg:col-span-8 space-y-4 scroll-mt-24 order-1">
          {/* Header: CANÇÕES (conforme template) */}
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-1.5">
              <Music className="w-4 h-4 text-orange-500" /> {t('library.songs')}
            </h3>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedDifficulty('all');
                setSelectedArtistFilter('all');
                setSearchQuery('');
                setActiveSubTab('todas');
              }}
              className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer hover:text-orange-600"
              title={t('library.allSongs')}
            >
              {t('library.original')} <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Banner do artista escolhido — leva a uma seção com os itens do artista */}
          {selectedArtistFilter !== 'all' && (
            <div className="flex items-center justify-between gap-3 bg-[#0E7C7B]/[0.06] border border-[#0E7C7B]/25 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
                    selectedArtistFilter
                  )}&backgroundColor=0e7c7b&fontWeight=600`}
                  alt={selectedArtistFilter}
                  className="w-10 h-10 rounded-full border-2 border-white shadow-sm shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate leading-tight">
                    {selectedArtistFilter}
                  </p>
                  <p className="text-[10px] font-extrabold text-[#0E7C7B]">
                    {selectedArtistCount > 0
                      ? `${selectedArtistCount} ${t('library.songsCount')}`
                      : t('library.noArtistSongs')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedArtistFilter('all')}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-300 font-bold text-[11px] transition-colors cursor-pointer shrink-0"
              >
                {t('library.allSongs')}
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('library.search')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">{t('library.allCategories')}</option>
                {SONG_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">{t('library.allLevels')}</option>
                {SONG_DIFFICULTIES.map((diff) => (
                  <option key={diff} value={diff}>
                    {t('playlist.mode')} {difficultyLabel(t, diff)}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Genre / Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1 border-t border-slate-100">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-orange-500" /> {t('library.genres')}
              </span>
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-orange-500 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos
              </button>
              {SONG_CATEGORIES.map((cat) => {
                const isActive = selectedCategory.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(isActive ? 'all' : cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-orange-500 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lista DENSA de canções (estilo CifraClub) — linhas compactas */}
          {shownSongs.length > 0 ? (
            <div className="space-y-2">
              {shownSongs.map((song, index) => {
                // AdSense: máx 1 ad no feed por página (total ≤3: StickyBottom +
                // SideWidgets + 1 feed). Só quando há ≥16 músicas visíveis.
                // A/B test: feed_ad_position — early (index 8), late (index 16), none
                const feedAdVariant = getAbVariant('feed_ad_position');
                const feedAdIndex = feedAdVariant === 'late' ? 16 : 8;
                const showFeedAd = shownSongs.length >= 16 && index === feedAdIndex && feedAdVariant !== 'none';
                // Afiliado 1× por página (a cada 6) para aparecer na primeira
                // tela com a lista curta — o card "Patrocinado" é conteúdo
                // que o proprietário quer visível, não enterrado.
                const showAffiliate = index > 0 && index % 6 === 0;

                return (
                  <React.Fragment key={song.id}>
                    {showAffiliate && hasAffiliates && (
                      <div className="my-1">
                        <AffiliateAdCard links={affiliateLinks} placement="song_feed" />
                      </div>
                    )}
                    {showFeedAd && (
                      <div className="my-1">
                        <AdSenseSlot format="fluid" layout="in-article" label="Publicidade" adSlot={ADSENSE_SLOTS.feed} abTestId="feed_ad_position" />
                      </div>
                    )}

                    {/* Linha de música — foco no título, artista e ação (como o CifraClub) */}
                    <div
                      onClick={() => onSelectSong(song)}
                      className="group flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200/80 hover:border-orange-300/80 hover:shadow-md rounded-xl transition-all cursor-pointer"
                    >
                      {/* Thumbnail (vídeo) ou ícone de música */}
                      <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-slate-100 bg-slate-50">
                        {song.youtubeId ? (
                          <img
                            src={`https://img.youtube.com/vi/${song.youtubeId}/default.jpg`}
                            alt={song.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-[#0E7C7B]/10 via-white to-orange-50 flex items-center justify-center">
                            <Music className="w-4 h-4 text-orange-500" />
                          </div>
                        )}
                      </div>

                      {/* Título + linha de detalhe. Mobile: mostra a LETRA real
                          sempre (foco no conteúdo). Desktop: artista/tom/gênero
                          e a letra aparece no hover. */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black text-slate-900 truncate group-hover:text-orange-600 transition-colors leading-tight">
                          {song.title}
                        </p>
                        {/* Mobile (sem hover): letra sempre visível */}
                        <p className="sm:hidden text-[11px] text-[#0E7C7B] font-semibold truncate leading-snug">
                          {lyricsPreviewMap.get(song.id) || song.title}
                        </p>
                        {/* Desktop: artista/tom/gênero, trocado pela letra no hover */}
                        <div className="hidden sm:block">
                          <p className="text-[11px] text-slate-500 font-semibold truncate leading-snug group-hover:hidden">
                            {song.artist}
                            {song.key ? ` · Tom ${song.key}` : ''}
                            {song.category ? ` · ${song.category}` : ''}
                            {(song.views ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-slate-400 ml-1" title="Visualizações">
                                · <Eye className="w-2.5 h-2.5" /> {(song.views ?? 0).toLocaleString('pt-BR')}
                              </span>
                            )}
                          </p>
                          <p className="hidden group-hover:block text-[11px] text-[#0E7C7B] font-semibold truncate leading-snug">
                            {lyricsPreviewMap.get(song.id) || song.title}
                          </p>
                        </div>
                      </div>

                      {/* Nível (desktop largo) */}
                      {song.difficulty && (
                        <span
                          className={`hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-extrabold border shrink-0 ${getDifficultyBadgeClass(song.difficulty)}`}
                        >
                          <Gauge className="w-2.5 h-2.5" />
                          {difficultyLabel(t, song.difficulty)}
                        </span>
                      )}

                      {/* Voto */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onVoteSong?.(song);
                        }}
                        title={
                          myVotes?.has(song.id)
                            ? 'Remover meu voto'
                            : 'Votar nesta música'
                        }
                        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-black border transition-colors cursor-pointer shrink-0 ${
                          myVotes?.has(song.id)
                            ? 'bg-amber-400 text-[#1D2D44] border-amber-400 shadow-sm'
                            : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-amber-400 hover:text-amber-600'
                        }`}
                      >
                        <Star
                          className={`w-3 h-3 ${
                            myVotes?.has(song.id) ? 'fill-current' : ''
                          }`}
                        />
                        <span className="tabular-nums">{song.votes ?? 0}</span>
                      </button>

                      {/* Ações rápidas (aparecem no hover) */}
                      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToPlaylist(song);
                          }}
                          title={t('library.addToPlaylist')}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isLoggedIn) {
                              onEditSong(song);
                            } else {
                              onOpenAuth?.('login');
                            }
                          }}
                          title={isLoggedIn ? t('library.editChord') : t('library.loginToEdit')}
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSongToDelete(song);
                            }}
                            title="Excluir Música"
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}
                      </div>

                      {/* TOCAR */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSong(song);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer shrink-0"
                      >
                        <Play className="w-3 h-3 fill-white" /> {t('library.play')}
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Paginação: Mostrar mais */}
              {hasMore && (
                <div className="pt-2">
                  <button
                    onClick={() => setVisibleCount((c) => c + 10)}
                    className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-600 hover:text-orange-600 hover:border-orange-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {t('library.showMore')} ({filteredSongs.length - visibleCount} restantes)
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-center text-[10px] text-slate-400 font-bold mt-1.5">
                    {t('library.showing')} {shownSongs.length} {t('library.of')} {filteredSongs.length} {t('library.songsLower')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-slate-200/90 rounded-2xl p-6">
              <Music className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-extrabold text-slate-800">{t('library.noResults')}</h3>
              <p className="text-slate-500 text-xs mt-1 mb-4">
                {t('library.noResultsHint')}
              </p>
              <button
                onClick={onCreateNewSong}
                className="px-5 py-2 rounded-xl bg-orange-500 text-white font-extrabold text-xs"
              >
                {t('library.newSong')}
              </button>

              {/* Conteúdo editorial no estado vazio — guia rápido para novos usuários */}
              <div className="mt-6 text-left space-y-3 max-w-md mx-auto">
                <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">💡 Enquanto isso, confira:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { icon: '🎵', text: 'Use a busca acima para encontrar cifras por título ou artista.' },
                    { icon: '🎸', text: 'Explore o Dicionário de Acordes para aprender novas formas de tocar.' },
                    { icon: '📚', text: 'As Trilhas de Aprendizado guiados de iniciante a avançado.' },
                    { icon: '🎤', text: 'O Afinador ajuda a manter seu ukulele sempre afinado.' },
                  ].map((tip) => (
                    <div key={tip.text} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-sm shrink-0 mt-0.5">{tip.icon}</span>
                      <p className="text-[11px] text-slate-600 leading-relaxed">{tip.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR (4/12): artistas + repertórios — depois das músicas no mobile */}
        <div className="lg:col-span-4 space-y-4 order-2">
          {/* Widget: Lista de Artistas — compacta, visível mas secundária */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setArtistsCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 uppercase font-black text-[11px] tracking-wider cursor-pointer transition-colors group"
                title={artistsCollapsed ? 'Mostrar lista de artistas' : 'Recolher lista de artistas'}
              >
                <User className="w-3.5 h-3.5 text-orange-500" />
                {t('library.artists')}
                <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-px leading-none">
                  {artistsList.length}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 transition-transform duration-200 group-hover:text-orange-500 ${
                    artistsCollapsed ? '' : 'rotate-180'
                  }`}
                />
              </button>
              {selectedArtistFilter !== 'all' && (
                <button
                  onClick={() => setSelectedArtistFilter('all')}
                  className="text-[10px] text-orange-600 font-bold hover:underline"
                >
                  {t('library.clear')}
                </button>
              )}
            </div>

            {artistsCollapsed ? (
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed px-0.5">
                {t('library.tapToBrowse')}
              </p>
            ) : (
              <div className="space-y-0.5 max-h-[300px] overflow-y-auto pr-1">
              {visibleArtists.map((artist, idx) => {
                const isSelected = selectedArtistFilter.toLowerCase() === artist.name.toLowerCase();
                return (
                  <div
                    key={idx}
                    onClick={() => artist.count > 0 && handleArtistClick(artist.name)}
                    title={
                      artist.count > 0
                        ? 'Ver as canções deste artista'
                        : 'Este artista ainda não tem canções no acervo'
                    }
                    className={`flex items-center gap-2.5 p-1.5 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-slate-100 border border-slate-200 cursor-default'
                        : artist.count > 0
                        ? 'hover:bg-slate-100 text-slate-700 cursor-pointer'
                        : 'text-slate-300 cursor-default'
                    }`}
                  >
                    <img
                      src={artist.avatar}
                      alt={artist.name}
                      loading="lazy"
                      className="w-6 h-6 rounded-full object-cover border border-slate-200/80 shrink-0 bg-slate-100"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.onerror = null;
                        target.src =
                          'https://ui-avatars.com/api/?name=' +
                          encodeURIComponent(artist.name) +
                          '&background=0E7C7B&color=fff&bold=true&size=64';
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold truncate text-slate-900 leading-tight">
                        {artist.name}
                      </p>
                      <p className={`text-[9px] ${isSelected ? 'text-[#0E7C7B] font-bold' : 'text-slate-400'}`}>
                        {artist.count > 0 ? `${artist.count} ${t('library.songsCount')}` : 'Artista Ukulele'}
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                        isSelected ? 'text-orange-500' : 'text-slate-300'
                      }`}
                    />
                  </div>
                );
              })}

                {artistsList.length > 5 && (
                  <button
                    onClick={() => setShowAllArtists((prev) => !prev)}
                    className="w-full py-1.5 text-[10px] font-extrabold text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {showAllArtists
                      ? `${t('library.viewLess')} (${visibleArtists.length})`
                      : `${t('library.seeAll')} (${artistsList.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Widget: REPERTÓRIO DE HOJE — lista horizontal com PLAY + seta */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                {t('library.todaysRepertoire')}
              </h3>
              <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer">
                {t('library.favorites')} <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            <div className="relative">
              {/* Fade à direita: indica que o carrossel tem mais cards e o
                  último card cortado na borda não é um bug de layout. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white via-white/80 to-transparent z-[1]" />
              <div
                ref={todayScrollRef}
                className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 pr-7"
              >
                {songs.slice(0, 8).map((song) => (
                  <div
                    key={song.id}
                    onClick={() => onSelectSong(song)}
                    className="w-28 shrink-0 bg-slate-50 border border-slate-100 hover:border-orange-300 rounded-xl p-2 space-y-1.5 transition-all cursor-pointer group"
                  >
                    <div className="w-full h-14 rounded-lg overflow-hidden bg-orange-500/10 flex items-center justify-center">
                      {song.youtubeId ? (
                        <img
                          src={`https://img.youtube.com/vi/${song.youtubeId}/default.jpg`}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-5 h-5 text-orange-500" />
                      )}
                    </div>
                    <p className="text-[10px] font-bold text-slate-900 truncate group-hover:text-orange-600">
                      {song.title}
                    </p>
                    <p className="text-[9px] text-slate-400 truncate">{song.artist}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSong(song);
                      }}
                      className="w-full py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-[9px] cursor-pointer"
                    >
                      {t('library.play')}
                    </button>
                  </div>
                ))}
              </div>

              {/* Seta de navegação (sobreposta, como no template) */}
              {songs.length > 4 && (
                <button
                  onClick={() => todayScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-orange-500 cursor-pointer"
                  title={t('library.next')}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Widget: REPERTÓRIO ATUAL — as listas/playlists do usuário (em vez
              de diagramas soltos, mostra os nomes das listas + contagem e abre
              o gerenciador ao clicar — muito mais útil para navegar). */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                <FolderHeart className="w-3.5 h-3.5 text-[#F26419]" />
                {t('library.currentRepertoire')}
              </h3>
              <button
                onClick={onOpenPlaylists}
                className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer hover:text-orange-600"
                title={t('library.lists')}
              >
                {t('library.lists')} <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {playlists.length === 0 ? (
              <button
                onClick={onOpenPlaylists}
                className="w-full text-left text-[10px] text-slate-400 font-semibold leading-relaxed px-1 py-1.5 hover:text-slate-600 transition-colors cursor-pointer"
              >
                Crie listas com suas músicas favoritas — elas aparecem aqui. 🎶
              </button>
            ) : (
              <div className="space-y-1">
                {playlists.slice(0, 5).map((pl) => (
                  <button
                    key={pl.id}
                    onClick={onOpenPlaylists}
                    className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left group cursor-pointer"
                    title={`Abrir "${pl.title}"`}
                  >
                    <div className="w-7 h-7 shrink-0 rounded-lg bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center group-hover:bg-[#0E7C7B] group-hover:text-white transition-colors">
                      <ListMusic className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-900 truncate leading-tight group-hover:text-orange-600 transition-colors">
                        {pl.title}
                      </p>
                      <p className="text-[9px] text-slate-400 font-semibold">
                        {pl.songIds.length} {pl.songIds.length === 1 ? t('library.songSingular') : t('library.songsCount')}
                        {pl.difficulty ? ` · ${difficultyLabel(t, pl.difficulty)}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-orange-500 shrink-0 transition-colors" />
                  </button>
                ))}
                {playlists.length > 5 && (
                  <button
                    onClick={onOpenPlaylists}
                    className="w-full py-1 text-[10px] font-extrabold text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                  >
                    Ver todas ({playlists.length})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <ImportSongModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportSongs={onImportSongs}
        existingSongs={songs}
        onSelectSong={onSelectSong}
      />

      {/* Delete Confirmation Modal */}
      {songToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Excluir Música</h3>
                <p className="text-xs text-slate-500">Esta ação irá remover a música do seu repertório.</p>
              </div>
            </div>

            <p className="text-sm text-slate-700">
              Tem certeza que deseja excluir a cifra de <strong className="text-slate-900">{songToDelete.title}</strong>?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSongToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const id = songToDelete.id;
                  setSongToDelete(null);
                  onDeleteSong(id);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20 cursor-pointer"
              >
                Excluir Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
