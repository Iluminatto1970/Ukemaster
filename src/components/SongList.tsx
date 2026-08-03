import React, { useState, useMemo } from 'react';
import { Song, Playlist, SONG_CATEGORIES, SONG_DIFFICULTIES } from '../types';
import {
  Search,
  Plus,
  Music,
  Youtube,
  Trash2,
  Edit3,
  Eye,
  Download,
  Upload,
  Filter,
  ListPlus,
  Play,
  User,
  Sparkles,
  ChevronRight,
  Star,
  Tag,
  Gauge,
} from 'lucide-react';
import { ImportSongModal } from './ImportSongModal';
import { AdSenseSlot } from './AdSenseSlot';
import { ChordDiagram } from './ChordDiagram';
import { findChord } from '../data/chords';

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
}) => {
  const [internalSearchQuery, setInternalSearchQuery] = useState<string>('');
  
  const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
  const setSearchQuery = externalSetSearchQuery || setInternalSearchQuery;

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string>('all');
  const [activeSubTab, setActiveSubTab] = useState<'artistas' | 'listas' | 'todas'>('todas');
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [songToDelete, setSongToDelete] = useState<Song | null>(null);

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

    return Array.from(artistMap.entries()).map(([name, count]) => ({
      name,
      count,
      avatar: `https://images.unsplash.com/photo-${
        1500000000000 + Math.abs(name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 50000000
      }?w=100&auto=format&fit=crop&q=80`,
    }));
  }, [songs]);

  const filteredSongs = songs.filter((s) => {
    const query = searchQuery.trim().toLowerCase();

    // Comprehensive search match across title (música), artist (autor/artista), category (categoria/gênero), tags, key, content
    const matchSearch =
      !query ||
      s.title.toLowerCase().includes(query) ||
      s.artist.toLowerCase().includes(query) ||
      (s.category && s.category.toLowerCase().includes(query)) ||
      (s.tags && s.tags.some((tag) => tag.toLowerCase().includes(query))) ||
      (s.key && s.key.toLowerCase().includes(query)) ||
      (s.content && s.content.toLowerCase().includes(query));

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
  const fChord = findChord('F')?.fingerings[0] || { frets: [2, 0, 1, 0], fingers: [2, 0, 1, 0] };

  const getDifficultyBadgeClass = (diff?: string) => {
    if (diff === 'Simplificado' || diff === 'Iniciante') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (diff === 'Avançado') {
      return 'bg-orange-50 text-orange-700 border-orange-200';
    }
    return 'bg-amber-50 text-amber-700 border-amber-200'; // Médio / Intermediário
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Section Bar: Title & Subtabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase font-sans flex items-center gap-2">
            ACERVO PÚBLICO
          </h1>
          <p className="text-slate-500 text-xs font-semibold mt-0.5">
            Músicas e playlists 100% públicas com {songs.length} cifras abertas para toda a comunidade.
          </p>
        </div>

        {/* Subtabs matching screenshot */}
        <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('artistas')}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer ${
              activeSubTab === 'artistas'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Listas de Artistas
          </button>
          <button
            onClick={() => setActiveSubTab('listas')}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer ${
              activeSubTab === 'listas'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Playlists Públicas
          </button>
          <button
            onClick={() => {
              setActiveSubTab('todas');
              setSelectedArtistFilter('all');
            }}
            className={`text-xs font-extrabold uppercase tracking-wider transition-all pb-1 cursor-pointer ${
              activeSubTab === 'todas'
                ? 'text-orange-500 border-b-2 border-orange-500'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Todas as Canções
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsImportModalOpen(true)}
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
            onClick={onCreateNewSong}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" /> Nova Cifra
          </button>
        </div>
      </div>

      {/* Main 3-Column Dashboard Layout matching user screenshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMN 1: Listas de Artistas (Left Sidebar Panel) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider flex items-center gap-1.5">
                <User className="w-4 h-4 text-orange-500" /> LISTAS DE ARTISTAS
              </h3>
              {selectedArtistFilter !== 'all' && (
                <button
                  onClick={() => setSelectedArtistFilter('all')}
                  className="text-[10px] text-orange-600 font-bold hover:underline"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {artistsList.map((artist, idx) => {
                const isSelected = selectedArtistFilter.toLowerCase() === artist.name.toLowerCase();
                return (
                  <div
                    key={idx}
                    onClick={() =>
                      setSelectedArtistFilter(isSelected ? 'all' : artist.name)
                    }
                    className={`flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-orange-500 text-white shadow-xs font-bold'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <img
                      src={artist.avatar}
                      alt={artist.name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-200/80 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {artist.name}
                      </p>
                      <p className={`text-[10px] ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                        {artist.count > 0 ? `${artist.count} músicas` : 'Artista Ukulele'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUMN 2: Songs Main Grid (Middle Panel) */}
        <div className="lg:col-span-6 space-y-4">
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

          {/* Songs Grid */}
          {filteredSongs.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredSongs.map((song, index) => {
                const showFeedAd = index > 0 && index % 6 === 0;

                return (
                  <React.Fragment key={song.id}>
                    {showFeedAd && (
                      <div className="col-span-1 sm:col-span-2 my-1">
                        <AdSenseSlot format="horizontal" label="Anúncio do Repertório" />
                      </div>
                    )}

                    {/* Song Card matching screenshot style */}
                    <div
                      onClick={() => onSelectSong(song)}
                      className="bg-white border border-slate-200/90 hover:border-orange-400/80 rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer space-y-3"
                    >
                      {/* Top Visual Box (Album cover or Chord diagrams preview) */}
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center justify-center gap-2 overflow-hidden min-h-[90px]">
                        {song.youtubeId ? (
                          <div className="relative w-full h-24 rounded-lg overflow-hidden group-hover:scale-102 transition-transform">
                            <img
                              src={`https://img.youtube.com/vi/${song.youtubeId}/mqdefault.jpg`}
                              alt={song.title}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center">
                              <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-md">
                                <Play className="w-4 h-4 fill-white ml-0.5" />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 scale-75 transform -my-4">
                            <ChordDiagram chordName="G" fingering={gChord} size="sm" showPlayButton={false} />
                            <ChordDiagram chordName="C" fingering={cChord} size="sm" showPlayButton={false} />
                          </div>
                        )}
                      </div>

                      {/* Song Details */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-base font-black text-slate-900 group-hover:text-orange-600 transition-colors truncate">
                              {song.title}
                            </h3>
                            <p className="text-slate-500 text-xs font-semibold truncate">
                              {song.artist}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-mono font-bold text-[10px] border border-orange-200 shrink-0">
                            Tom: {song.key}
                          </span>
                        </div>

                        {/* Badges for Category & Mode */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {song.category && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-[#0E7C7B]/10 text-[#0E7C7B] border border-[#0E7C7B]/20">
                              <Tag className="w-2.5 h-2.5" />
                              {song.category}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${getDifficultyBadgeClass(song.difficulty)}`}>
                            <Gauge className="w-2.5 h-2.5" />
                            {song.difficulty || 'Simplificado'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSong(song);
                          }}
                          className="flex-1 py-1.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs transition-colors flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-white" /> TOCAR
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToPlaylist(song);
                          }}
                          title="Adicionar à Playlist"
                          className="p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditSong(song);
                          }}
                          title="Editar Cifra"
                          className="p-1.5 rounded-xl bg-slate-100 text-slate-600 hover:text-orange-600 hover:bg-orange-50 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSongToDelete(song);
                          }}
                          title="Excluir Música"
                          className="p-1.5 rounded-xl bg-slate-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 text-rose-500" />
                        </button>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
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

        {/* COLUMN 3: Right Sidebar Widgets (Repertório Atual & Hoje) matching screenshot */}
        <div className="lg:col-span-3 space-y-4">
          {/* Widget 1: REPERTÓRIO ATUAL (Chord boxes G, C, Am) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                REPERTÓRIO ATUAL
              </h3>
              <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer">
                Inéditos <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <ChordDiagram chordName="G" fingering={gChord} size="sm" showPlayButton={false} />
              <ChordDiagram chordName="C" fingering={cChord} size="sm" showPlayButton={false} />
              <ChordDiagram chordName="Am" fingering={amChord} size="sm" showPlayButton={false} />
            </div>
          </div>

          {/* Widget 2: REPERTÓRIO DE HOJE */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                REPERTÓRIO DE HOJE
              </h3>
              <span className="text-[10px] text-orange-500 font-bold flex items-center gap-0.5 cursor-pointer">
                Favoritos <ChevronRight className="w-3 h-3" />
              </span>
            </div>

            <div className="space-y-2.5">
              {songs.slice(0, 3).map((song, i) => (
                <div
                  key={song.id}
                  onClick={() => onSelectSong(song)}
                  className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100 hover:border-orange-300 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-600 font-black shrink-0 overflow-hidden">
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
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-orange-600 truncate">
                      {song.title}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{song.artist}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSong(song);
                    }}
                    className="px-2 py-1 rounded-lg bg-orange-500 text-white font-extrabold text-[10px] shadow-2xs hover:bg-orange-600"
                  >
                    PLAY
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 3: Featured Player Banner */}
          {songs.length > 0 && (
            <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-white rounded-2xl p-4 shadow-sm space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-orange-400 uppercase tracking-widest text-[10px]">
                  REPERTÓRIO EM DESTAQUE
                </span>
                <div className="flex text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400" />
                  <Star className="w-3 h-3 fill-amber-400" />
                </div>
              </div>

              <div>
                <h4 className="font-extrabold text-sm text-white">{songs[0].title}</h4>
                <p className="text-slate-300 text-xs font-medium">{songs[0].artist}</p>
              </div>

              <button
                onClick={() => onSelectSong(songs[0])}
                className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-md shadow-orange-950/40 cursor-pointer"
              >
                TOCAR AGORA
              </button>
            </div>
          )}
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
