/**
 * Listagem principal do acervo: busca/filtros por gênero e nível, ranking Mais Votadas (estilo CifraClub), linhas densas de músicas, ações (votar, playlist, editar, excluir só admin) e widgets laterais (Em Alta, Artistas, Repertório).
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
} from 'lucide-react';
import { ImportSongModal } from './ImportSongModal';
import { AdSenseSlot } from './AdSenseSlot';
import { ChordDiagram } from './ChordDiagram';
import { findChord } from '../data/chords';
import { fetchTrendingSongIds } from '../lib/ratings';

interface SongListProps {
  songs: Song[];
  playlists: Playlist[];
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
}

export const SongList: React.FC<SongListProps> = ({
  songs,
  playlists,
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
}) => {
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
  // Paginação da lista (estilo CifraClub): mostra 24 e carrega mais sob demanda —
  // essencial para o acervo de milhares de canções não travar o navegador.
  const [visibleCount, setVisibleCount] = useState<number>(24);

  // Nova busca limpa o filtro de artista selecionado (evita "nenhuma cifra
  // encontrada" quando artista + busca se combinam e dão zero resultados).
  useEffect(() => {
    if (searchQuery.trim()) {
      setSelectedArtistFilter('all');
    }
  }, [searchQuery]);

  // Qualquer mudança de filtro/busca reinicia a paginação.
  useEffect(() => {
    setVisibleCount(24);
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

  // Repertoire default chords for current song widget
  const gChord = findChord('G')?.fingerings[0] || { frets: [0, 2, 3, 2], fingers: [0, 1, 3, 2] };
  const cChord = findChord('C')?.fingerings[0] || { frets: [0, 0, 0, 3], fingers: [0, 0, 0, 3] };
  const amChord = findChord('Am')?.fingerings[0] || { frets: [2, 0, 0, 0], fingers: [2, 0, 0, 0] };

  // ── Mais Votadas: top 10 por votos da comunidade (com empate por título) ──
  const topVotedSongs = useMemo(() => {
    return [...songs]
      .filter((s) => (s.votes ?? 0) > 0)
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.title.localeCompare(b.title))
      .slice(0, 10);
  }, [songs]);

  // ── Ranking principal (hero estilo CifraClub): se ainda não há votos,
  // usa as músicas mais RECENTES (novidades) para o ranking nunca ficar vazio.
  const heroSongs = useMemo(() => {
    if (topVotedSongs.length > 0) return topVotedSongs;
    return [...songs]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10);
  }, [topVotedSongs, songs]);

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
    return [...songs]
      .filter((s) => (trendingMap.get(s.id) ?? 0) > 0)
      .sort(
        (a, b) =>
          (trendingMap.get(b.id) ?? 0) - (trendingMap.get(a.id) ?? 0) ||
          (b.votes ?? 0) - (a.votes ?? 0) ||
          a.title.localeCompare(b.title)
      )
      .slice(0, 8);
  }, [songs, trendingMap]);

  const totalVotes = useMemo(
    () => songs.reduce((acc, s) => acc + (s.votes ?? 0), 0),
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

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header: BIBLIOTECA (LIBRARY) + tabs — conforme template */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase font-sans">
              BIBLIOTECA
            </h1>
            <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-0.5">
              {songs.length} canções da comunidade
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => (isLoggedIn ? setIsImportModalOpen(true) : onOpenAuth?.('signup'))}
              title={isLoggedIn ? 'Importar cifras' : 'Faça login para importar músicas'}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:border-orange-400 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-orange-500" /> Importar
            </button>
            <button
              onClick={onExportSongs}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:border-orange-400 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 text-orange-500" /> Exportar
            </button>
            <button
              onClick={() => (isLoggedIn ? onCreateNewSong() : onOpenAuth?.('signup'))}
              title={isLoggedIn ? 'Criar nova cifra' : 'Faça login para enviar músicas'}
              className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" /> Nova Cifra
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
            Listas de Artistas
          </button>
          <button
            onClick={() => setActiveSubTab('listas')}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'listas'
                ? 'text-slate-900 border-b-2 border-orange-500'
                : 'text-slate-400 font-bold hover:text-slate-700'
            }`}
          >
            Minhas Listas
          </button>
          <span className="flex-1 hidden sm:block" />
          <button
            onClick={() => {
              setActiveSubTab('todas');
              setSelectedArtistFilter('all');
            }}
            className="text-xs font-extrabold uppercase tracking-wider pb-1 cursor-pointer whitespace-nowrap text-orange-500 hover:text-orange-600"
          >
            Todas as Canções
          </button>
        </div>
      </div>

      {/* Layout estilo CifraClub: coluna principal com a LISTA DENSA de canções
          (o foco) + sidebar com ranking, artistas e widgets. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA PRINCIPAL (8/12): CANÇÕES — primeiro no mobile */}
        <div ref={songsSectionRef} className="lg:col-span-8 space-y-4 scroll-mt-24 order-1">
          {/* Header: CANÇÕES (conforme template) */}
          <div className="flex items-center justify-between">
            <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-1.5">
              <Music className="w-4 h-4 text-orange-500" /> CANÇÕES
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
              title="Ver todas as canções"
            >
              Inéditos <ChevronRight className="w-3 h-3" />
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
                      ? `${selectedArtistCount} canções deste artista`
                      : 'Nenhuma canção encontrada'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedArtistFilter('all')}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-300 font-bold text-[11px] transition-colors cursor-pointer shrink-0"
              >
                Ver todas as canções
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
                  placeholder="Buscar por música, autor, artista, categoria ou gênero..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-orange-500 font-medium"
                />
              </div>
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
              >
                <option value="all">Todas Categorias / Gêneros</option>
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
                <option value="all">Todos Níveis</option>
                {SONG_DIFFICULTIES.map((diff) => (
                  <option key={diff} value={diff}>
                    Modo {diff}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Genre / Category Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1 border-t border-slate-100">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <Tag className="w-3 h-3 text-orange-500" /> Gêneros:
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

          {/* RANKING HERO estilo CifraClub: lista numerada com medalhas, thumbnail,
              tom, nível, votos e botão TOCAR — o protagonista da página inicial.
              Escondido quando o usuário busca/filtra (foco nos resultados). */}
          {!isFiltering && heroSongs.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
              {/* Cabeçalho do ranking (fundo grafite da marca) */}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-[#1D2D44] to-[#0E7C7B]">
                <h3 className="font-black text-white uppercase text-xs tracking-wider flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400 fill-current" />
                  {topVotedSongs.length > 0 ? 'Mais Votadas' : 'Novidades'}
                </h3>
                <span className="text-[10px] font-black text-amber-300 shrink-0">
                  {topVotedSongs.length > 0
                    ? `${totalVotes} ${totalVotes === 1 ? 'voto' : 'votos'} da comunidade`
                    : 'Recém-adicionadas ao acervo'}
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
                            {song.difficulty}
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
                        <Play className="w-3 h-3 fill-white" /> TOCAR
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lista DENSA de canções (estilo CifraClub) — linhas compactas */}
          {shownSongs.length > 0 ? (
            <div className="space-y-2">
              {shownSongs.map((song, index) => {
                const showFeedAd = index > 0 && index % 8 === 0;

                return (
                  <React.Fragment key={song.id}>
                    {showFeedAd && (
                      <div className="my-1">
                        <AdSenseSlot format="horizontal" label="Anúncio do Repertório" />
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
                          {song.difficulty}
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
                          title="Adicionar à Playlist"
                          className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSong(song);
                          }}
                          title="Editar Cifra"
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
                        <Play className="w-3 h-3 fill-white" /> TOCAR
                      </button>
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Paginação: Mostrar mais */}
              {hasMore && (
                <div className="pt-2">
                  <button
                    onClick={() => setVisibleCount((c) => c + 24)}
                    className="w-full py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-extrabold text-slate-600 hover:text-orange-600 hover:border-orange-300 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Mostrar mais ({filteredSongs.length - visibleCount} restantes)
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-center text-[10px] text-slate-400 font-bold mt-1.5">
                    Mostrando {shownSongs.length} de {filteredSongs.length} canções
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 bg-white border border-slate-200/90 rounded-2xl p-6">
              <Music className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-extrabold text-slate-800">Nenhuma cifra encontrada</h3>
              <p className="text-slate-500 text-xs mt-1 mb-4">
                Cadastre ou importe novas canções para o seu repertório.
              </p>
              <button
                onClick={onCreateNewSong}
                className="px-5 py-2 rounded-xl bg-orange-500 text-white font-extrabold text-xs"
              >
                Nova Cifra
              </button>
            </div>
          )}
        </div>

        {/* SIDEBAR (4/12): ranking + artistas + widgets — depois das músicas no mobile */}
        <div className="lg:col-span-4 space-y-4 order-2">
          {/* Widget 0: EM ALTA — o que está bombando nos últimos 14 dias */}
          <div className="bg-gradient-to-br from-[#F26419]/10 via-white to-amber-100/60 border border-orange-200/70 rounded-2xl p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-orange-200/60 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#F26419]" /> Em Alta
              </h3>
              <span className="text-[10px] font-black text-[#F26419] flex items-center gap-0.5 shrink-0">
                <Flame className="w-3 h-3 fill-current" /> 14 dias
              </span>
            </div>

            {trendingSongs.length > 0 ? (
              <div className="space-y-0.5">
                {trendingSongs.map((song, idx) => (
                  <button
                    key={song.id}
                    onClick={() => onSelectSong(song)}
                    className="w-full flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-orange-50/80 transition-colors text-left group/trend cursor-pointer"
                  >
                    <span
                      className={`w-6 text-center font-black text-sm shrink-0 transition-colors ${
                        idx === 0
                          ? 'text-[#F26419]'
                          : idx < 3
                          ? 'text-amber-500'
                          : 'text-slate-300'
                      } group-hover/trend:text-[#F26419]`}
                    >
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-900 truncate group-hover/trend:text-orange-600">
                        {song.title}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate">{song.artist}</p>
                    </div>
                    <span className="flex items-center gap-0.5 text-[10px] font-black text-[#F26419] shrink-0">
                      <Flame className="w-2.5 h-2.5 fill-current" />
                      {trendingMap.get(song.id) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                As músicas com mais votos nos últimos 14 dias aparecem aqui — vote em suas
                favoritas para colocá-las em alta! 🔥
              </p>
            )}
          </div>

          {/* Widget 2: Lista de Artistas — compacta, visível mas secundária */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setArtistsCollapsed((prev) => !prev)}
                className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 uppercase font-black text-[11px] tracking-wider cursor-pointer transition-colors group"
                title={artistsCollapsed ? 'Mostrar lista de artistas' : 'Recolher lista de artistas'}
              >
                <User className="w-3.5 h-3.5 text-orange-500" />
                Artistas
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
                  Limpar
                </button>
              )}
            </div>

            {artistsCollapsed ? (
              <p className="text-[10px] text-slate-400 font-semibold leading-relaxed px-0.5">
                Toque para navegar por artista. As canções continuam logo ao lado ⬅️
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
                        {artist.count > 0 ? `${artist.count} músicas` : 'Artista Ukulele'}
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
                      ? `▲ Ver menos (${visibleArtists.length})`
                      : `▼ Ver todos (${artistsList.length})`}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Widget 3: REPERTÓRIO DE HOJE — lista horizontal com PLAY + seta */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                REPERTÓRIO DE HOJE
              </h3>
              <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer">
                Favoritos <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            <div className="relative">
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
                      PLAY
                    </button>
                  </div>
                ))}
              </div>

              {/* Seta de navegação (sobreposta, como no template) */}
              {songs.length > 4 && (
                <button
                  onClick={() => todayScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-orange-500 cursor-pointer"
                  title="Próximo"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Widget 4: REPERTÓRIO ATUAL — acordes compactos em linha */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-1">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                REPERTÓRIO ATUAL
              </h3>
              <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer">
                Inéditos <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            {/* Diagramas em tamanho xs NATIVO (sem scale/margem negativa) —
                antes o hack scale-[0.82] + -my-2.5 fazia o layout colapsar e
                os diagramas vazarem por cima do widget acima ao rolar. */}
            <div className="flex justify-center gap-1.5 items-start">
              {[
                { name: 'G', fingering: gChord },
                { name: 'C', fingering: cChord },
                { name: 'Am', fingering: amChord },
              ].map((ch) => (
                <ChordDiagram key={ch.name} chordName={ch.name} fingering={ch.fingering} size="xs" showPlayButton={false} />
              ))}
            </div>
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
