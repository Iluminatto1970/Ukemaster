import React, { useState, useEffect } from 'react';
import { Song, Playlist, ActiveTab } from './types';
import { DEFAULT_SONGS, DEFAULT_PLAYLISTS } from './data/defaultSongs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChordDictionary } from './components/ChordDictionary';
import { Tuner } from './components/Tuner';
import { SongList } from './components/SongList';
import { SongViewer } from './components/SongViewer';
import { SongEditor } from './components/SongEditor';
import { PlaylistManager } from './components/PlaylistManager';
import { StrummingGuide } from './components/StrummingGuide';
// import { AdSenseSlot } from './components/AdSenseSlot'; // placeholder // placeholder
import { StickyBottomAd } from './components/StickyBottomAd';
import { AdSenseSettingsModal } from './components/AdSenseSettingsModal';
import { AuthModal } from './components/AuthModal';
import { Dashboard } from './components/Dashboard';
import { AdInterstitialModal } from './components/AdInterstitialModal';
import { Music, List, Sparkles, Plus, BookOpen, Radio, Flame, DollarSign } from 'lucide-react';

const LOCAL_STORAGE_SONGS_KEY = 'ukemaster_songs_v1';
const LOCAL_STORAGE_PLAYLISTS_KEY = 'ukemaster_playlists_v1';
const LOCAL_STORAGE_USER_KEY = 'ukemaster_user_v1';
const LOCAL_STORAGE_REPERTOIRE_KEY = 'ukemaster_repertoire_v1';

export default function App() {
  // Load initial state from localStorage or default dataset
  const [songs, setSongs] = useState<Song[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SONGS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_SONGS;
    } catch {
      return DEFAULT_SONGS;
    }
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PLAYLISTS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PLAYLISTS;
    } catch {
      return DEFAULT_PLAYLISTS;
    }
  });

  // User Auth & Private Repertoire State
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      if (saved) return JSON.parse(saved);
      // Default to logged-in user so dashboard is populated, but user can easily log out
      return { name: 'Músico Aluno', email: 'aluno@ukulele.com' };
    } catch {
      return { name: 'Músico Aluno', email: 'aluno@ukulele.com' };
    }
  });

  const [repertoireSongIds, setRepertoireSongIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_REPERTOIRE_KEY);
      return saved ? JSON.parse(saved) : ['s1', 's2', 's3'];
    } catch {
      return ['s1', 's2', 's3'];
    }
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('musicas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'viewer' | 'editor' | 'playlists'>('list');
  const [isAdSenseModalOpen, setIsAdSenseModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'signup' | 'login'>('signup');

  // Interstitial Ad State (Shows advertisement gating periodically before opening lyrics)
  const [isAdInterstitialOpen, setIsAdInterstitialOpen] = useState<boolean>(false);
  const [pendingSongToView, setPendingSongToView] = useState<Song | null>(null);
  const [songOpenCount, setSongOpenCount] = useState<number>(0);

  // Sync state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(songs));
    } catch (e) {
      console.error('Error saving songs to localStorage:', e);
    }
  }, [songs]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_PLAYLISTS_KEY, JSON.stringify(playlists));
    } catch (e) {
      console.error('Error saving playlists to localStorage:', e);
    }
  }, [playlists]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      }
    } catch (e) {
      console.error('Error saving user to localStorage:', e);
    }
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_REPERTOIRE_KEY, JSON.stringify(repertoireSongIds));
    } catch (e) {
      console.error('Error saving repertoire to localStorage:', e);
    }
  }, [repertoireSongIds]);

  // Auth Handlers
  const handleLoginSuccess = (user: { name: string; email: string }) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const handleToggleRepertoire = (songId: string) => {
    setRepertoireSongIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]
    );
  };

  // Handlers for Song CRUD
  const handleSelectSong = (song: Song) => {
    const nextCount = songOpenCount + 1;
    setSongOpenCount(nextCount);

    // Show interstitial ad gate on every 2nd song view attempt
    if (nextCount % 2 === 0) {
      setPendingSongToView(song);
      setIsAdInterstitialOpen(true);
    } else {
      setSelectedSong(song);
      setViewMode('viewer');
    }
  };

  const handleCompleteAdInterstitial = () => {
    if (pendingSongToView) {
      setSelectedSong(pendingSongToView);
      setViewMode('viewer');
      setPendingSongToView(null);
    }
    setIsAdInterstitialOpen(false);
  };

  const handleCreateNewSong = () => {
    setEditingSong(null);
    setIsCreatingNew(true);
    setViewMode('editor');
  };

  const handleEditSong = (song: Song) => {
    setEditingSong(song);
    setIsCreatingNew(false);
    setViewMode('editor');
  };

  const handleSaveSong = (savedSong: Song) => {
    setSongs((prev) => {
      const exists = prev.some((s) => s.id === savedSong.id);
      if (exists) {
        return prev.map((s) => (s.id === savedSong.id ? savedSong : s));
      } else {
        return [savedSong, ...prev];
      }
    });

    setSelectedSong(savedSong);
    setViewMode('viewer');
    setEditingSong(null);
    setIsCreatingNew(false);
  };

  const handleDeleteSong = (songId: string) => {
    const targetSong = songs.find((s) => s.id === songId);
    const title = targetSong ? targetSong.title : 'Música';

    setSongs((prev) => prev.filter((s) => s.id !== songId));
    // Also remove from playlists
    setPlaylists((prev) =>
      prev.map((pl) => ({
        ...pl,
        songIds: pl.songIds.filter((id) => id !== songId),
      }))
    );
    if (selectedSong?.id === songId) {
      setSelectedSong(null);
      setViewMode('list');
    }
    if (editingSong?.id === songId) {
      setEditingSong(null);
      setViewMode('list');
    }
  };

  // Handlers for Playlists
  const handleCreatePlaylist = (
    title: string,
    description?: string,
    category?: string,
    difficulty?: 'Simplificado' | 'Médio' | 'Avançado' | 'Misto'
  ) => {
    const newPl: Playlist = {
      id: `pl-${Date.now()}`,
      title,
      description,
      category,
      difficulty,
      songIds: [],
      createdAt: new Date().toISOString(),
    };
    setPlaylists((prev) => [newPl, ...prev]);
  };

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  };

  const handleAddSongToPlaylist = (playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId && !pl.songIds.includes(songId)) {
          return { ...pl, songIds: [...pl.songIds, songId] };
        }
        return pl;
      })
    );
  };

  const handleRemoveSongFromPlaylist = (playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return { ...pl, songIds: pl.songIds.filter((id) => id !== songId) };
        }
        return pl;
      })
    );
  };

  // Export & Import Library JSON
  const handleExportSongs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(songs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ukemaster_repertorio_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportSongs = (importedSongs: Song[]) => {
    setSongs((prev) => {
      const merged = [...prev];
      importedSongs.forEach((imp) => {
        const index = merged.findIndex(
          (m) =>
            m.id === imp.id ||
            (m.title.trim().toLowerCase() === imp.title.trim().toLowerCase() &&
              m.artist.trim().toLowerCase() === imp.artist.trim().toLowerCase())
        );
        if (index >= 0) {
          merged[index] = { ...merged[index], ...imp, updatedAt: new Date().toISOString() };
        } else {
          merged.unshift(imp);
        }
      });
      return merged;
    });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans antialiased flex flex-col">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'musicas') {
            setViewMode('list');
          }
        }}
        songsCount={songs.length}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          if (q && activeTab !== 'musicas') {
            setActiveTab('musicas');
            setViewMode('list');
          }
        }}
        currentUser={currentUser}
        onOpenAuth={(mode) => {
          setAuthModalInitialMode(mode || 'signup');
          setIsAuthModalOpen(true);
        }}
        onLogout={handleLogout}
      />

      {/* Main Container Layout with Sidebar + Workspace */}
      <div className="flex-1 flex w-full max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6 gap-6">
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab === 'musicas') {
              setViewMode('list');
            }
          }}
          songsCount={songs.length}
          playlistsCount={playlists.length}
          onOpenAdSenseSettings={() => setIsAdSenseModalOpen(true)}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Right Main Content Panel */}
        <main className="flex-1 min-w-0 space-y-4">
          {/* Top Banner Ad */}
          <div id="carbonads" className="bg-white border border-slate-200/90 rounded-2xl p-3 text-center text-xs text-slate-500">Anúncio</div>

          {/* Sub Switcher for Musicas View Modes */}
          {activeTab === 'musicas' && (
            <div className="flex items-center gap-2 bg-white border border-slate-200/90 rounded-2xl p-2 shadow-2xs">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-[#F26419] text-white shadow-xs'
                    : 'bg-slate-100 text-[#1D2D44] hover:bg-slate-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" /> Músicas Públicas ({songs.length})
              </button>

              <button
                onClick={() => setViewMode('playlists')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'playlists'
                    ? 'bg-[#F26419] text-white shadow-xs'
                    : 'bg-slate-100 text-[#1D2D44] hover:bg-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" /> Playlists Públicas ({playlists.length})
              </button>

              {viewMode === 'viewer' && selectedSong && (
                <span className="text-xs font-bold text-[#F26419] bg-[#FEF0E8] px-3 py-1.5 rounded-xl border border-[#F26419]/30 truncate max-w-xs ml-auto">
                  Tocando: {selectedSong.title}
                </span>
              )}
            </div>
          )}

          {/* Tab Views */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs min-h-[600px]">
            {/* Tab 1: Dashboard (Repertório Privado) */}
            {activeTab === 'dashboard' && (
              <Dashboard
                currentUser={currentUser}
                repertoireSongIds={repertoireSongIds}
                songs={songs}
                playlists={playlists}
                onSelectSong={handleSelectSong}
                onRemoveFromRepertoire={handleToggleRepertoire}
                onOpenAuth={(mode) => {
                  setAuthModalInitialMode(mode || 'signup');
                  setIsAuthModalOpen(true);
                }}
                onGoToPublicSongs={() => {
                  setActiveTab('musicas');
                  setViewMode('list');
                }}
              />
            )}

            {/* Tab 2: Public Songs & Playlists Catalog */}
            {activeTab === 'musicas' && (
              <>
                {viewMode === 'list' && (
                  <SongList
                    songs={songs}
                    playlists={playlists}
                    onSelectSong={handleSelectSong}
                    onEditSong={handleEditSong}
                    onDeleteSong={handleDeleteSong}
                    onCreateNewSong={handleCreateNewSong}
                    onAddToPlaylist={(song) => {
                      setSelectedSong(song);
                      setViewMode('playlists');
                    }}
                    onExportSongs={handleExportSongs}
                    onImportSongs={handleImportSongs}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                  />
                )}

                {viewMode === 'viewer' && selectedSong && (
                  <SongViewer
                    song={selectedSong}
                    onBack={() => setViewMode('list')}
                    onEdit={handleEditSong}
                    onAddToPlaylist={() => setViewMode('playlists')}
                    onDelete={handleDeleteSong}
                    currentUser={currentUser}
                    isInRepertoire={repertoireSongIds.includes(selectedSong.id)}
                    onToggleRepertoire={() => handleToggleRepertoire(selectedSong.id)}
                    onOpenAuth={(mode) => {
                      setAuthModalInitialMode(mode || 'signup');
                      setIsAuthModalOpen(true);
                    }}
                  />
                )}

                {viewMode === 'editor' && (
                  <SongEditor
                    initialSong={isCreatingNew ? undefined : editingSong || undefined}
                    onSave={handleSaveSong}
                    onDelete={handleDeleteSong}
                    onCancel={() => {
                      if (selectedSong) {
                        setViewMode('viewer');
                      } else {
                        setViewMode('list');
                      }
                    }}
                  />
                )}

                {viewMode === 'playlists' && (
                  <PlaylistManager
                    playlists={playlists}
                    songs={songs}
                    onSelectSong={handleSelectSong}
                    onCreatePlaylist={handleCreatePlaylist}
                    onDeletePlaylist={handleDeletePlaylist}
                    onRemoveSongFromPlaylist={handleRemoveSongFromPlaylist}
                    onAddSongToPlaylist={handleAddSongToPlaylist}
                  />
                )}
              </>
            )}

            {/* Tab 3: Chord Dictionary */}
            {activeTab === 'dicionario' && <ChordDictionary />}

            {/* Tab 4: Ukulele Tuner */}
            {activeTab === 'afinador' && <Tuner />}

            {/* Tab 5: Strumming & Rhythm Guide */}
            {activeTab === 'ritmos' && <StrummingGuide />}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 pb-24 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Uke Master Pro</span> • Plataforma 100% Gratuita Mantida por Anúncios
          </div>
          <div className="flex items-center gap-4">
            <span>Afinação padrão G4 C4 E4 A4</span>
          </div>
        </div>
      </footer>

      {/* Sticky Bottom Ad Banner */}
      <StickyBottomAd />

      {/* AdSense Settings Modal */}
      <AdSenseSettingsModal
        isOpen={isAdSenseModalOpen}
        onClose={() => setIsAdSenseModalOpen(false)}
      />

      {/* Auth Modal for Scribd Paywall Sign Up / Sign In */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialMode={authModalInitialMode}
      />

      {/* Interstitial Ad Modal (Gates song opening periodically with countdown) */}
      <AdInterstitialModal
        isOpen={isAdInterstitialOpen}
        onComplete={handleCompleteAdInterstitial}
        title={pendingSongToView?.title}
        artist={pendingSongToView?.artist}
      />
    </div>
  );
}
