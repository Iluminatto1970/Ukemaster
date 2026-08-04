import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './auth';
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
import { Dashboard } from './components/Dashboard';
import { AdInterstitialModal } from './components/AdInterstitialModal';
import { Monetag } from './components/Monetag';
import { SupportPrompt } from './components/SupportPrompt';
import {
  loadRepertoire,
  saveRepertoire,
  loadRepertoirePublic,
  saveRepertoirePublic,
  setPublicRepertoire,
} from './lib/repertoires';
import {
  fetchSongsFromCloud,
  pushSongsToCloud,
  fetchPlaylistsFromCloud,
  pushPlaylistsToCloud,
  fetchRepertoireFromCloud,
  pushRepertoireToCloud,
  isSupabaseConfigured,
} from './lib/cloudSync';


const LOCAL_STORAGE_SONGS_KEY = 'ukemaster_songs_v1';
const LOCAL_STORAGE_PLAYLISTS_KEY = 'ukemaster_playlists_v1';

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

  // Autenticação real via Clerk (substitui o login falso em localStorage)
  const { isSignedIn, user: clerkUser, openSignIn, openSignUp } = useAuth();

  const currentUser = useMemo(() => {
    if (!isSignedIn || !clerkUser) return null;
    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    return {
      name: clerkUser.fullName || clerkUser.username || email.split('@')[0] || 'Músico',
      email,
    };
  }, [isSignedIn, clerkUser]);

  // ── Repertório INDIVIDUAL (cada usuário tem o seu) ───────────────────────
  // As MÚSICAS são públicas para todos; o REPERTÓRIO é chaveado pelo id do
  // Clerk (visitantes usam uma área "guest" separada). Toggle para torná-lo
  // público e compartilhar com a comunidade fica no Dashboard.
  const currentUserId = clerkUser?.id || 'guest';

  const [repertoireSongIds, setRepertoireSongIds] = useState<string[]>([]);
  const [repertoireLoadedFor, setRepertoireLoadedFor] = useState<string>('');
  const [isRepertoirePublic, setIsRepertoirePublic] = useState<boolean>(false);
  const [repertoirePublicLoadedFor, setRepertoirePublicLoadedFor] = useState<string>('');

  // Nuvem (Supabase): só habilita push depois do primeiro carregamento
  const [cloudReady, setCloudReady] = useState<boolean>(false);
  // Marca se o usuário editou dados locais antes do primeiro load da nuvem
  // terminar — nesse caso a nuvem NÃO sobrescreve a edição local.
  const localEditedRef = useRef<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('musicas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'viewer' | 'editor' | 'playlists'>('list');
  const [isAdSenseModalOpen, setIsAdSenseModalOpen] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Interstitial Ad State (Shows advertisement gating periodically before opening lyrics)
  const [isAdInterstitialOpen, setIsAdInterstitialOpen] = useState<boolean>(false);
  const [pendingSongToView, setPendingSongToView] = useState<Song | null>(null);

  // Import Monetag and SupportPrompt
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

  // ── Nuvem (Supabase): carregamento inicial ──────────────────────────
  // Busca songs/playlists na nuvem. Se a nuvem tiver dados (acervo público
  // compartilhado), eles substituem o local. Se vazia/indisponível, mantém
  // o local e faz seed na nuvem via push (abaixo).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cloudSongs, cloudPlaylists] = await Promise.all([
        fetchSongsFromCloud(),
        fetchPlaylistsFromCloud(),
      ]);
      if (cancelled) return;
      // Se o usuário editou algo antes da resposta chegar, não sobrescreve
      if (cloudSongs && cloudSongs.length > 0 && !localEditedRef.current) {
        setSongs(cloudSongs);
      }
      if (cloudPlaylists && cloudPlaylists.length > 0 && !localEditedRef.current) {
        setPlaylists(cloudPlaylists);
      }
      setCloudReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Push (debounce) songs/playlists para a nuvem a cada alteração
  useEffect(() => {
    if (!cloudReady) return;
    const t = setTimeout(() => {
      pushSongsToCloud(songs);
    }, 1000);
    return () => clearTimeout(t);
  }, [songs, cloudReady]);

  useEffect(() => {
    if (!cloudReady) return;
    const t = setTimeout(() => {
      pushPlaylistsToCloud(playlists);
    }, 1000);
    return () => clearTimeout(t);
  }, [playlists, cloudReady]);

  // Carrega o repertório do usuário atual (troca de lista ao trocar de conta)
  useEffect(() => {
    if (repertoireLoadedFor === currentUserId) return;
    const userId = currentUserId;
    setRepertoireSongIds(loadRepertoire(userId, true));
    setRepertoireLoadedFor(userId);
    // Nuvem: se houver repertório salvo para este usuário, ele vence.
    // Guarda: só aplica se ainda for o MESMO usuário (evita que a resposta
    // atrasada de uma conta sobrescreva a lista de outra ao trocar de conta).
    fetchRepertoireFromCloud(userId).then((cloudIds) => {
      if (cloudIds && cloudIds.length > 0 && userId === currentUserId) {
        setRepertoireSongIds(cloudIds);
      }
    });
  }, [currentUserId, repertoireLoadedFor]);

  useEffect(() => {
    if (repertoireLoadedFor !== currentUserId) return;
    saveRepertoire(currentUserId, repertoireSongIds);
  }, [repertoireSongIds, currentUserId, repertoireLoadedFor]);

  // Visibilidade pública do repertório (por usuário) + registro da comunidade
  useEffect(() => {
    if (repertoirePublicLoadedFor === currentUserId) return;
    setIsRepertoirePublic(loadRepertoirePublic(currentUserId));
    setRepertoirePublicLoadedFor(currentUserId);
  }, [currentUserId, repertoirePublicLoadedFor]);

  useEffect(() => {
    if (repertoirePublicLoadedFor !== currentUserId) return;
    saveRepertoirePublic(currentUserId, isRepertoirePublic);
    if (isRepertoirePublic && isSignedIn && clerkUser) {
      setPublicRepertoire(currentUserId, {
        userId: currentUserId,
        name:
          clerkUser.fullName ||
          clerkUser.username ||
          clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] ||
          'Músico',
        songIds: repertoireSongIds,
        updatedAt: new Date().toISOString(),
      });
    } else {
      setPublicRepertoire(currentUserId, null);
    }
  }, [
    isRepertoirePublic,
    repertoireSongIds,
    currentUserId,
    isSignedIn,
    clerkUser,
    repertoirePublicLoadedFor,
  ]);

  // Nuvem: espelha o repertório do usuário (só contas reais, não guest)
  useEffect(() => {
    if (repertoireLoadedFor !== currentUserId) return;
    if (currentUserId === 'guest') return;
    if (!isSupabaseConfigured()) return;
    const name =
      isSignedIn && clerkUser
        ? clerkUser.fullName ||
          clerkUser.username ||
          clerkUser.primaryEmailAddress?.emailAddress?.split('@')[0] ||
          'Músico'
        : 'Músico';
    pushRepertoireToCloud(currentUserId, name, repertoireSongIds, isRepertoirePublic);
  }, [
    repertoireSongIds,
    isRepertoirePublic,
    currentUserId,
    repertoireLoadedFor,
    isSignedIn,
    clerkUser,
  ]);

  const handleToggleRepertoire = (songId: string) => {
    setRepertoireSongIds((prev) =>
      prev.includes(songId) ? prev.filter((id) => id !== songId) : [...prev, songId]
    );
  };

  // Handlers for Song CRUD
  const markLocalEdited = () => {
    localEditedRef.current = true;
  };

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
    markLocalEdited();
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
    markLocalEdited();
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
    markLocalEdited();
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
    markLocalEdited();
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
  };

  const handleAddSongToPlaylist = (playlistId: string, songId: string) => {
    markLocalEdited();
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
    markLocalEdited();
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
    markLocalEdited();
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
    <div className="min-h-screen bg-bg-brand text-slate-900 font-sans antialiased flex flex-col">
      {/* Monetag Ads (push/popunder) — script injetado no <head> */}
      <Monetag />

      {/* Support Banner — comunidade APOIA.se */}
      <SupportPrompt />

      {/* Navigation Header */}
      <Header
        setActiveTab={(tab) => {
          setActiveTab(tab);
          if (tab === 'musicas') {
            setViewMode('list');
          }
        }}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          if (q) {
            // Digitar na busca deve SEMPRE mostrar os resultados filtrados:
            // volta para a aba de músicas e sai do viewer/playlists (mas
            // não interrompe a edição de uma cifra em andamento).
            if (activeTab !== 'musicas') {
              setActiveTab('musicas');
            }
            if (viewMode !== 'editor') {
              setViewMode('list');
            }
          }
        }}
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
          viewMode={viewMode}
          onOpenPlaylists={() => {
            setActiveTab('musicas');
            setViewMode('playlists');
          }}
          onOpenAdSenseSettings={() => setIsAdSenseModalOpen(true)}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Right Main Content Panel */}
        <main className="flex-1 min-w-0">
          {/* Tab Views — lista de músicas fica sem wrapper branco (layout do template); demais telas mantêm o card */}
          <div
            className={
              activeTab === 'musicas' && viewMode === 'list'
                ? ''
                : 'bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs min-h-[600px]'
            }
          >
            {/* Tab 1: Dashboard (Repertório Privado) */}
            {activeTab === 'dashboard' && (
              <Dashboard
                currentUser={currentUser}
                repertoireSongIds={repertoireSongIds}
                isRepertoirePublic={isRepertoirePublic}
                onToggleRepertoirePublic={() => setIsRepertoirePublic((prev) => !prev)}
                songs={songs}
                playlists={playlists}
                onSelectSong={handleSelectSong}
                onRemoveFromRepertoire={handleToggleRepertoire}
                onOpenAuth={(mode) => {
                  // Abre o fluxo real do Clerk (modal hospedado)
                  if (mode === 'login') {
                    openSignIn();
                  } else {
                    openSignUp();
                  }
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
                      // Abre o fluxo real do Clerk (modal hospedado)
                      if (mode === 'login') {
                        openSignIn();
                      } else {
                        openSignUp();
                      }
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
            <span className="font-bold text-slate-800">UkeMaster Pro</span> • Plataforma 100% Gratuita Mantida por Anúncios
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
