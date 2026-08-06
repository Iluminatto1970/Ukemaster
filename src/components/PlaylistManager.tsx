/**
 * Gerenciamento de playlists: criar, renomear, excluir e adicionar músicas da biblioteca.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Playlist, Song, SONG_CATEGORIES, PLAYLIST_DIFFICULTIES } from '../types';
import { List, Plus, Trash2, Edit2, Play, Music, ChevronRight, X, Sparkles, Check, Tag, Gauge, Filter, FolderHeart, Globe, Download, Loader2, Search } from 'lucide-react';
import { Logo } from './Logo';
import { PublicRepertoire } from '../lib/repertoires';
import { getPublicRepertoiresWithCloud } from '../lib/cloudSync';

interface PlaylistManagerProps {
  playlists: Playlist[];
  songs: Song[];
  onSelectSong: (song: Song) => void;
  onCreatePlaylist: (
    title: string,
    description?: string,
    category?: string,
    difficulty?: 'Simplificado' | 'Médio' | 'Avançado' | 'Misto'
  ) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onRemoveSongFromPlaylist: (playlistId: string, songId: string) => void;
  onAddSongToPlaylist: (playlistId: string, songId: string) => void;
  /** Baixa a playlist (letra + diagramas de todas as cifras). */
  onDownloadPlaylist?: (title: string, songs: Song[]) => Promise<void> | void;
  /** Criar/modificar listas da comunidade exige login. */
  isLoggedIn?: boolean;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
}

export const PlaylistManager: React.FC<PlaylistManagerProps> = ({
  playlists,
  songs,
  onSelectSong,
  onCreatePlaylist,
  onDeletePlaylist,
  onRemoveSongFromPlaylist,
  onAddSongToPlaylist,
  onDownloadPlaylist,
  isLoggedIn = false,
  onOpenAuth,
}) => {
  // Toda ação de ESCRITA em listas (criar/adicionar/remover/excluir) é uma
  // contribuição à comunidade → exige login. Visitantes só navegam.
  const requireAuth = (): boolean => {
    if (isLoggedIn) return true;
    onOpenAuth?.('signup');
    return false;
  };
  // Download da playlist ativa: busca as cifras completas e gera o documento
  const [downloading, setDownloading] = useState<boolean>(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>(
    playlists[0]?.id || ''
  );
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [showAddSongModal, setShowAddSongModal] = useState<boolean>(false);
  const [addSongSearch, setAddSongSearch] = useState<string>('');

  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Pop');
  const [newDifficulty, setNewDifficulty] = useState<'Simplificado' | 'Médio' | 'Avançado' | 'Misto'>('Simplificado');

  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('all');

  // Repertórios públicos da comunidade (nuvem primeiro, local como fallback)
  const [publicRepertoires, setPublicRepertoires] = useState<PublicRepertoire[]>([]);
  const [publicLoaded, setPublicLoaded] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getPublicRepertoiresWithCloud();
      if (cancelled) return;
      setPublicRepertoires(list);
      setPublicLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPlaylists = playlists.filter((pl) => {
    const matchCat = filterCategory === 'all' || pl.category === filterCategory;
    const matchDiff = filterDifficulty === 'all' || pl.difficulty === filterDifficulty;
    return matchCat && matchDiff;
  });

  // Busca no modal "Adicionar Músicas": ignora case e acentos
  const normalizeSearch = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const addSongQuery = normalizeSearch(addSongSearch.trim());
  const addableSongs = useMemo(() => {
    if (!addSongQuery) return songs;
    return songs.filter(
      (s) =>
        normalizeSearch(s.title || '').includes(addSongQuery) ||
        normalizeSearch(s.artist || '').includes(addSongQuery) ||
        (s.category && normalizeSearch(s.category).includes(addSongQuery))
    );
  }, [songs, addSongQuery]);

  const activePlaylist = playlists.find((p) => p.id === selectedPlaylistId) || filteredPlaylists[0] || playlists[0];
  const activeSongs = activePlaylist
    ? activePlaylist.songIds
        .map((id) => songs.find((s) => s.id === id))
        .filter((s): s is Song => s !== undefined)
    : [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !requireAuth()) return;
    onCreatePlaylist(newTitle.trim(), newDesc.trim() || undefined, newCategory, newDifficulty);
    setNewTitle('');
    setNewDesc('');
    setShowNewModal(false);
  };

  const handleDownloadActivePlaylist = async () => {
    if (!activePlaylist || downloading || !onDownloadPlaylist) return;
    // Baixar/exportar é ação de membro → exige login (nunca exportar sem logar)
    if (!requireAuth()) return;
    setDownloading(true);
    try {
      await onDownloadPlaylist(activePlaylist.title, activeSongs);
    } finally {
      setDownloading(false);
    }
  };

  const getDifficultyBadgeClass = (diff?: string) => {
    if (diff === 'Simplificado') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (diff === 'Avançado') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (diff === 'Misto') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-amber-50 text-amber-700 border-amber-200'; // Médio
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Top Banner */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <List className="w-6 h-6 text-orange-500" /> Playlists & Listas Públicas
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1 font-medium">
            Explore e crie playlists abertas para toda a comunidade do UkeMaster Pro.
          </p>
        </div>

        <button
          onClick={() => (isLoggedIn ? setShowNewModal(true) : requireAuth())}
          title={isLoggedIn ? 'Criar Nova Lista' : 'Faça login para criar listas'}
          className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md shadow-orange-500/20 flex items-center gap-1.5 cursor-pointer scale-105"
        >
          <Plus className="w-4 h-4" /> Criar Nova Lista
        </button>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Playlists Navigation */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block">
              Playlists Públicas ({filteredPlaylists.length})
            </span>
          </div>

          {/* Filters for playlists */}
          <div className="grid grid-cols-2 gap-1.5 pb-2 border-b border-slate-100">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="all">Cat: Todas</option>
              {SONG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              <option value="all">Modo: Todos</option>
              {PLAYLIST_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-0.5">
            {filteredPlaylists.map((pl) => {
              const isSelected = pl.id === selectedPlaylistId;
              return (
                <div
                  key={pl.id}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className={`p-3 rounded-xl transition-all cursor-pointer flex items-center justify-between group ${
                    isSelected
                      ? 'bg-orange-50 border border-orange-200 text-orange-950 font-bold'
                      : 'bg-slate-50 border border-slate-200/80 text-slate-700 hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="truncate min-w-0 space-y-1">
                    <h4 className="font-bold text-sm truncate text-slate-900">{pl.title}</h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-500 font-medium">
                        {pl.songIds.length} {pl.songIds.length === 1 ? 'música' : 'músicas'}
                      </span>
                      {pl.category && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-[#0E7C7B]/10 text-[#0E7C7B]">
                          {pl.category}
                        </span>
                      )}
                      {pl.difficulty && (
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${getDifficultyBadgeClass(pl.difficulty)}`}>
                          {pl.difficulty}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight
                    className={`w-4 h-4 transition-transform shrink-0 ml-1 ${
                      isSelected ? 'text-orange-500 translate-x-0.5' : 'text-slate-400'
                    }`}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Playlist Content & Songs */}
        <div className="md:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-5">
          {activePlaylist ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-2xl font-black text-orange-600 tracking-tight">
                      {activePlaylist.title}
                    </h3>
                    {activePlaylist.category && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-extrabold bg-[#0E7C7B]/10 text-[#0E7C7B] border border-[#0E7C7B]/20 inline-flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {activePlaylist.category}
                      </span>
                    )}
                    {activePlaylist.difficulty && (
                      <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border inline-flex items-center gap-1 ${getDifficultyBadgeClass(activePlaylist.difficulty)}`}>
                        <Gauge className="w-3 h-3" />
                        Modo {activePlaylist.difficulty}
                      </span>
                    )}
                  </div>
                  {activePlaylist.description && (
                    <p className="text-slate-600 text-sm mt-1">{activePlaylist.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!requireAuth()) return;
                      setAddSongSearch('');
                      setShowAddSongModal(true);
                    }}
                    title={isLoggedIn ? 'Adicionar Cifra' : 'Faça login para adicionar cifras'}
                    className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-orange-400 text-orange-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Cifra
                  </button>

                  {onDownloadPlaylist && (
                    <button
                      onClick={handleDownloadActivePlaylist}
                      disabled={downloading || activeSongs.length === 0}
                      title={activeSongs.length === 0 ? 'Adicione músicas para baixar' : isLoggedIn ? `Baixar ${activeSongs.length} cifra(s) com letra e diagramas` : 'Faça login para baixar listas'}
                      className="px-4 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {downloading ? 'Preparando…' : 'Baixar'}
                    </button>
                  )}

                  {playlists.length > 1 && (
                    <button
                      onClick={() => {
                        if (!requireAuth()) return;
                        if (confirm(`Deseja excluir a playlist "${activePlaylist.title}"?`)) {
                          onDeletePlaylist(activePlaylist.id);
                          setSelectedPlaylistId(playlists.find((p) => p.id !== activePlaylist.id)?.id || '');
                        }
                      }}
                      className="p-2 rounded-xl bg-slate-50 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-500 hover:text-rose-600 text-xs cursor-pointer"
                      title={isLoggedIn ? 'Excluir Playlist' : 'Faça login para excluir listas'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Song list in active playlist */}
              {activeSongs.length > 0 ? (
                <div className="space-y-2">
                  {activeSongs.map((song, idx) => (
                    <div
                      key={song.id}
                      onClick={() => onSelectSong(song)}
                      className="bg-slate-50 border border-slate-200/80 hover:border-orange-300 rounded-xl p-3.5 flex items-center justify-between gap-3 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <span className="w-6 text-center text-xs font-mono font-extrabold text-slate-400">
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <h5 className="font-bold text-slate-900 text-sm group-hover:text-orange-600 truncate">
                            {song.title}
                          </h5>
                          <p className="text-xs text-orange-600 font-bold">{song.artist}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="hidden min-[480px]:inline-block text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-mono font-bold">
                          Tom: {song.key}
                        </span>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSong(song);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
                        >
                          <Play className="w-3 h-3 fill-white" /> Tocar
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!requireAuth()) return;
                            onRemoveSongFromPlaylist(activePlaylist.id, song.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-200 cursor-pointer"
                          title={isLoggedIn ? 'Remover da lista' : 'Faça login para editar listas'}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-xl p-6">
                  <Music className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-600 text-sm font-semibold">Esta lista está vazia.</p>
                  <button
                    onClick={() => {
                      if (!requireAuth()) return;
                      setAddSongSearch('');
                      setShowAddSongModal(true);
                    }}
                    className="mt-3 px-4 py-2 rounded-xl bg-orange-500 text-white font-extrabold text-xs shadow-2xs"
                  >
                    Adicionar Cifras
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">
              Selecione uma playlist para visualizar.
            </div>
          )}
        </div>
      </div>

      {/* Repertórios Públicos da Comunidade */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FolderHeart className="w-5 h-5 text-[#F26419]" />
            <h3 className="font-black text-slate-900 uppercase text-sm tracking-wider">
              Repertórios Públicos da Comunidade
            </h3>
          </div>
          <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
            <Globe className="w-3 h-3 text-[#0E7C7B]" /> {publicRepertoires.length} compartilhados
          </span>
        </div>

        {!publicLoaded ? (
          <div className="py-8 text-center text-xs text-slate-400 font-semibold">
            Carregando repertórios públicos...
          </div>
        ) : publicRepertoires.length === 0 ? (
          <div className="py-8 text-center space-y-1.5 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
            <Globe className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-extrabold text-slate-600">Nenhum repertório público ainda</p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              No seu Dashboard, ative "Tornar Público" para compartilhar suas seleções com outros músicos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {publicRepertoires.map((rep) => (
              <div
                key={rep.userId}
                className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[#0E7C7B] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-xs">
                    {(rep.name || 'M').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{rep.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold">
                      Repertório Público • {rep.songIds.length} {rep.songIds.length === 1 ? 'música' : 'músicas'}
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  {rep.songIds.map((id) => {
                    const s = songs.find((song) => song.id === id);
                    if (!s) return null;
                    return (
                      <div
                        key={id}
                        onClick={() => onSelectSong(s)}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/70 hover:border-orange-300 transition-colors cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-800 truncate group-hover:text-orange-600">
                            {s.title}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">{s.artist}</p>
                        </div>
                        <Play className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create New Playlist Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 min-w-0">
              <div className="min-w-0">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 leading-tight">
                  Criar Nova Lista
                </h3>
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                  Playlist da comunidade UkeMaster Pro
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Logo size="sm" />
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="text-slate-400 hover:text-slate-900 font-bold"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Nome da Playlist *
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Show de Sexta, Modas de Viola..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Descrição (Opcional)
              </label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ex: Repertório acústico para ensaio"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-orange-500 font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Categoria
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
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
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as 'Simplificado' | 'Médio' | 'Avançado' | 'Misto')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs font-semibold focus:outline-none focus:border-orange-500 cursor-pointer"
                >
                  {PLAYLIST_DIFFICULTIES.map((diff) => (
                    <option key={diff} value={diff}>
                      {diff}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-orange-500 text-white font-extrabold text-xs shadow-2xs"
              >
                Criar Lista
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Song to Playlist Modal */}
      {showAddSongModal && activePlaylist && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddSongModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[80vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 min-w-0">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                  Adicionar Músicas
                </h3>
                <p className="text-xs font-bold text-orange-600 truncate mt-0.5 max-w-full">
                  para "{activePlaylist.title}"
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Logo size="sm" />
                <button
                  onClick={() => setShowAddSongModal(false)}
                  className="text-slate-400 hover:text-slate-900 font-bold"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={addSongSearch}
                onChange={(e) => setAddSongSearch(e.target.value)}
                placeholder={`Buscar música ou artista... (${songs.length} na biblioteca)`}
                aria-label="Buscar música ou artista"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-sm text-slate-900 focus:outline-none focus:border-orange-500 font-medium"
              />
              {addSongSearch && (
                <button
                  onClick={() => setAddSongSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 font-bold px-1 cursor-pointer"
                  aria-label="Limpar busca"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {addableSongs.length === 0 ? (
                <div className="text-center py-10 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                  <Music className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-extrabold text-slate-600">Nenhuma música encontrada</p>
                  <p className="text-xs text-slate-400 mt-1">Tente outro título ou artista.</p>
                </div>
              ) : (
                addableSongs.map((song) => {
                const isAlreadyAdded = activePlaylist.songIds.includes(song.id);
                return (
                  <div
                    key={song.id}
                    className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <h5 className="font-bold text-sm text-slate-900">{song.title}</h5>
                      <span className="text-xs text-orange-600 font-bold">{song.artist}</span>
                    </div>

                    {isAlreadyAdded ? (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Adicionada
                      </span>
                    ) : (
                      <button
                        onClick={() => onAddSongToPlaylist(activePlaylist.id, song.id)}
                        className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs cursor-pointer shadow-2xs"
                      >
                        + Adicionar
                      </button>
                    )}
                  </div>
                );
              })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
