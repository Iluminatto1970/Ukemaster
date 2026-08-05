/**
 * Componente raiz: orquestra toda a experiência — acervo (Supabase + cache local), busca/filtros, votação, repertórios, playlists, modais de anúncio/doação/lead, rotas SPA (/musica/:id) e SEO.
 */
import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useAuth } from './auth';
import { Song, Playlist, ActiveTab } from './types';
import { DEFAULT_SONGS, DEFAULT_PLAYLISTS } from './data/defaultSongs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SongList } from './components/SongList';

// Lazy-loading: telas pesadas (afinador, editor, player...) só são baixadas
// quando o usuário abre a tela — o bundle inicial fica ~3x menor no celular.
const ChordDictionary = lazy(() =>
  import('./components/ChordDictionary').then((m) => ({ default: m.ChordDictionary }))
);
const Tuner = lazy(() => import('./components/Tuner').then((m) => ({ default: m.Tuner })));
const SongViewer = lazy(() =>
  import('./components/SongViewer').then((m) => ({ default: m.SongViewer }))
);
const SongEditor = lazy(() =>
  import('./components/SongEditor').then((m) => ({ default: m.SongEditor }))
);
const PlaylistManager = lazy(() =>
  import('./components/PlaylistManager').then((m) => ({ default: m.PlaylistManager }))
);
const StrummingGuide = lazy(() =>
  import('./components/StrummingGuide').then((m) => ({ default: m.StrummingGuide }))
);
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const AdminScraper = lazy(() =>
  import('./components/AdminScraper').then((m) => ({ default: m.AdminScraper }))
);
// import { AdSenseSlot } from './components/AdSenseSlot'; // placeholder // placeholder
import { StickyBottomAd } from './components/StickyBottomAd';
import { AdInterstitialModal } from './components/AdInterstitialModal';
import { Monetag } from './components/Monetag';
import { SupportPrompt } from './components/SupportPrompt';
import { LeadCaptureModal } from './components/LeadCaptureModal';
import { SplashScreen } from './components/SplashScreen';

/** Máximo de anúncios intersticiais por dia (por dispositivo) — equilíbrio
 * entre receita e experiência: depois do limite, cifras abrem direto. */
const ADS_DAILY_LIMIT = 6;
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
import {
  getVoterId,
  mergeLocalVotes,
  fetchMyVotes,
  persistVote,
} from './lib/ratings';
import { trackEvent, trackPageView } from './lib/analytics';
import { markAdOverlayActive, markAdOverlayIdle } from './lib/adCoordinator';


const LOCAL_STORAGE_SONGS_KEY = 'ukemaster_songs_v1';
const LOCAL_STORAGE_PLAYLISTS_KEY = 'ukemaster_playlists_v1';

// Error boundary para os chunks lazy: se o download falhar (rede 3G caiu),
// mostra um aviso com botão de tentar de novo em vez de derrubar o app.
class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  props: { children: React.ReactNode };
  state: { hasError: boolean };

  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-16">
          <p className="text-sm font-bold text-slate-500">
            Não foi possível carregar esta tela (conexão instável).
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 rounded-xl bg-[#F26419] text-white text-xs font-bold cursor-pointer"
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  // Área ADMIN — visível apenas para o proprietário
  const isAdmin = currentUser?.email?.toLowerCase() === 'iluminatto@gmail.com';

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

  // ── Votação (rating): 1 voto por usuário por música ───────────────────────
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const voterId = useMemo(() => getVoterId(clerkUser?.id), [clerkUser?.id]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('musicas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'viewer' | 'editor' | 'playlists'>('list');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);

  // Splash de abertura (mostra a marca por ~2s e some com fade)
  const [showSplash, setShowSplash] = useState<boolean>(true);

  // Interstitial Ad State (Shows advertisement gating periodically before opening lyrics)
  const [isAdInterstitialOpen, setIsAdInterstitialOpen] = useState<boolean>(false);
  const [pendingSongToView, setPendingSongToView] = useState<Song | null>(null);

  // Captura de lead antes do cadastro (nome/e-mail/WhatsApp → seu banco)
  const [isLeadCaptureOpen, setIsLeadCaptureOpen] = useState<boolean>(false);

  // Import Monetag and SupportPrompt
  const [songOpenCount, setSongOpenCount] = useState<number>(0);

  // Modal de doação (APOIA.se + Pix) — abre no botão do header e, 1x por
  // sessão, automaticamente após a 4ª música aberta (conversão sem irritar).
  const [donationOpen, setDonationOpen] = useState<boolean>(false);
  const donationShownRef = useRef(false);

  // Limite diário de intersticiais: monetiza sem destruir a experiência.
  // O usuário vê no máximo 6 anúncios intersticiais por dia (contador em
  // localStorage por data); depois disso, cifras abrem direto. Além disso,
  // há um intervalo mínimo entre dois intersticiais (3 min) para o usuário
  // conseguir navegar/ler sem ser interrompido a cada ação.
  const adsShownRef = useRef<{ date: string; count: number }>({ date: '', count: 0 });
  const lastAdAtRef = useRef<number>(0);
  const MIN_AD_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos entre intersticiais
  const getAdsToday = (): number => {
    const today = new Date().toISOString().slice(0, 10);
    const saved = adsShownRef.current;
    if (saved.date === today) return saved.count;
    // primeira leitura da sessão: puxa do localStorage
    try {
      const raw = localStorage.getItem('ukemaster_ads_shown');
      const parsed = raw ? JSON.parse(raw) : { date: '', count: 0 };
      adsShownRef.current = parsed.date === today ? parsed : { date: today, count: 0 };
    } catch {
      adsShownRef.current = { date: today, count: 0 };
    }
    return adsShownRef.current.count;
  };
  const bumpAdsToday = () => {
    const today = new Date().toISOString().slice(0, 10);
    const next = { date: today, count: getAdsToday() + 1 };
    adsShownRef.current = next;
    try {
      localStorage.setItem('ukemaster_ads_shown', JSON.stringify(next));
    } catch {
      // cota cheia/privado — segue sem persistir
    }
  };

  // Sync state to localStorage — versão ENXUTA: com o acervo de 3.000+ cifras
  // completas o JSON estouraria a cota de ~5MB do localStorage, então o cache
  // local guarda só os metadados (id, título, artista, tom...). O conteúdo
  // completo vem da nuvem no carregamento; o cache local serve para listar e
  // buscar mesmo offline.
  const localSongsCache = useMemo(
    () =>
      songs.map((s) => ({
        ...s,
        content: undefined,
        simplifiedContent: undefined,
      })),
    [songs]
  );
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SONGS_KEY, JSON.stringify(localSongsCache));
    } catch (e) {
      // Cota estourada mesmo assim — tenta salvar só ids (melhor que nada)
      try {
        localStorage.setItem(
          LOCAL_STORAGE_SONGS_KEY,
          JSON.stringify(songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist })))
        );
      } catch (e2) {
        console.error('Error saving songs to localStorage:', e2);
      }
    }
  }, [localSongsCache, songs]);

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
        // Aplica os votos locais (fallback offline) sobre o acervo da nuvem
        setSongs(mergeLocalVotes(cloudSongs));
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

  // Carrega os votos do usuário atual (dedupe 1 voto por música)
  useEffect(() => {
    let cancelled = false;
    fetchMyVotes(voterId).then((votes) => {
      if (!cancelled) setMyVotes(votes);
    });
    return () => {
      cancelled = true;
    };
  }, [voterId]);

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

  // Vota/desvota numa música: atualiza a UI imediatamente (otimista) e
  // persiste em segundo plano. Se a nuvem falhar, reverte o estado local.
  // Usa updaters funcionais (estado anterior) para cliques rápidos não
  // derivarem do mesmo valor base e perderem voto.
  const handleVoteSong = (song: Song) => {
    const isVoted = myVotes.has(song.id);
    const vote = !isVoted;
    const delta = vote ? 1 : -1;

    trackEvent(vote ? 'song_vote' : 'song_unvote', {
      song_id: song.id,
      title: song.title,
      artist: song.artist,
    });

    // UI otimista (com base no estado anterior, não no prop velho)
    setMyVotes((prev) => {
      const next = new Set(prev);
      if (vote) next.add(song.id);
      else next.delete(song.id);
      return next;
    });
    setSongs((prev) =>
      prev.map((s) =>
        s.id === song.id
          ? { ...s, votes: Math.max(0, (s.votes ?? 0) + delta) }
          : s
      )
    );

    persistVote(song, voterId, vote).then((newCount) => {
      if (newCount === null) {
        // Falhou — reverte a UI
        setMyVotes((prev) => {
          const next = new Set(prev);
          if (vote) next.delete(song.id);
          else next.add(song.id);
          return next;
        });
        setSongs((prev) =>
          prev.map((s) =>
            s.id === song.id
              ? { ...s, votes: Math.max(0, (s.votes ?? 0) - delta) }
              : s
          )
        );
      } else {
        // Confirma o total vindo da nuvem (fonte da verdade)
        setSongs((prev) =>
          prev.map((s) => (s.id === song.id ? { ...s, votes: newCount } : s))
        );
      }
    });
  };

  // ── Rota /musica/:id — abre a cifra pela URL (links compartilháveis/SEO) ──
  // Ao carregar uma URL tipo /musica/abc, o app abre essa cifra direto.
  const openedUrlSongRef = useRef<string>('');
  useEffect(() => {
    const m = window.location.pathname.match(/^\/musica\/(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    if (openedUrlSongRef.current === id) return;
    const song = songs.find((s) => s.id === id);
    if (!song) return;
    openedUrlSongRef.current = id;
    setActiveTab('musicas');
    setSelectedSong(song);
    setViewMode('viewer');
  }, [songs]);

  // Botão voltar do navegador: volta para a lista quando sai de /musica/:id
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/musica\/(.+)$/);
      if (!m) {
        setViewMode((prev) => (prev === 'viewer' ? 'list' : prev));
        return;
      }
      const song = songs.find((s) => s.id === decodeURIComponent(m[1]));
      if (song) {
        setSelectedSong(song);
        setViewMode('viewer');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [songs]);

  // Fecha o viewer e sincroniza a URL (remove /musica/:id do histórico)
  // — senão o botão voltar do navegador reabriria a cifra fechada.
  const handleCloseViewer = () => {
    setViewMode('list');
    if (/^\/musica\//.test(window.location.pathname)) {
      window.history.pushState({}, '', '/');
    }
  };

  const handleSelectSong = (song: Song) => {
    const nextCount = songOpenCount + 1;
    setSongOpenCount(nextCount);

    // Convite automático de apoio (1x por sessão). Dispara só quando o
    // intersticial de anúncio NÃO abre nesta abertura (aberturas ímpares) —
    // evita dois modais sobrepostos (doação por cima do anúncio).
    if (nextCount >= 4 && nextCount % 2 !== 0 && !donationShownRef.current) {
      donationShownRef.current = true;
      // Pequeno atraso para o usuário já estar lendo a cifra.
      window.setTimeout(() => setDonationOpen(true), 4500);
    }

    // URL compartilhável da cifra (a Vercel serve a SPA; crawlers recebem
    // o prerender via api/musica.ts)
    if (window.location.pathname !== `/musica/${song.id}`) {
      window.history.pushState({}, '', `/musica/${song.id}`);
    }

    // Analytics: page_view virtual + evento de abertura de cifra
    trackPageView(`Cifra: ${song.title} — ${song.artist}`, `/musica/${song.id}`);
    trackEvent('song_view', {
      song_id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key || '',
      genre: song.category || '',
    });

    // Show interstitial ad gate on every 6th song view attempt — meio termo
    // (nem a cada 2 páginas, que irrita, nem tão raro que some a receita).
    // LIMITE DIÁRIO + intervalo mínimo: depois de N anúncios no dia (ou se
    // o último foi há menos de 3 min) o restante abre direto.
    const now = Date.now();
    const enoughTime = now - lastAdAtRef.current >= MIN_AD_INTERVAL_MS;
    if (nextCount % 6 === 0 && getAdsToday() < ADS_DAILY_LIMIT && enoughTime) {
      lastAdAtRef.current = now;
      bumpAdsToday();
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
    markAdOverlayIdle();
  };

  // Ao abrir o intersticial, avisa o coordenador de anúncios (a vignette
  // da Monetag espera este overlay fechar antes de abrir — nunca 2 overlays).
  useEffect(() => {
    if (isAdInterstitialOpen) {
      markAdOverlayActive();
    }
  }, [isAdInterstitialOpen]);

  // Fluxo de cadastro: primeiro captura o lead, depois abre o Clerk
  const handleOpenAuth = (mode?: 'signup' | 'login') => {
    trackEvent(mode === 'login' ? 'login_start' : 'signup_start');
    if (mode === 'login') {
      openSignIn();
      return;
    }
    setIsLeadCaptureOpen(true);
  };

  const handleLeadComplete = () => {
    setIsLeadCaptureOpen(false);
    trackEvent('lead_captured');
    openSignUp();
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

  // Analytics: page_view virtual ao trocar de aba/tela (SPA)
  useEffect(() => {
    const labels: Record<ActiveTab, string> = {
      dashboard: 'Dashboard / Repertório',
      musicas: 'Músicas da Comunidade',
      dicionario: 'Dicionário de Acordes',
      afinador: 'Afinador',
      ritmos: 'Ritmos e Batidas',
      admin: 'Admin',
    };
    trackPageView(labels[activeTab] || activeTab);
    trackEvent('tab_view', { tab: activeTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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
      {/* Splash de abertura — some sozinho após ~2s (fade out) */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* Monetag Ads (banners in-page) — script injetado no <head> */}
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
        donationOpen={donationOpen}
        onOpenDonation={() => setDonationOpen(true)}
        onCloseDonation={() => setDonationOpen(false)}
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
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isAdmin={isAdmin}
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
            {/* Suspense: fallback leve enquanto o lazy-load de uma tela baixa.
                ErrorBoundary: se um chunk falhar no 3G, mostra retry em vez
                de tela branca. */}
            <LazyErrorBoundary>
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-24">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-4 border-[#0E7C7B]/20 border-t-[#0E7C7B] animate-spin" />
                    <span className="text-xs font-bold text-slate-400">Carregando…</span>
                  </div>
                </div>
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
                onOpenAuth={handleOpenAuth}
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
                    myVotes={myVotes}
                    onVoteSong={handleVoteSong}
                    isAdmin={isAdmin}
                    isLoggedIn={!!isSignedIn}
                    onOpenAuth={handleOpenAuth}
                  />
                )}

                {viewMode === 'viewer' && selectedSong && (
                  <SongViewer
                    song={selectedSong}
                    onBack={handleCloseViewer}
                    onEdit={handleEditSong}
                    onAddToPlaylist={() => setViewMode('playlists')}
                    onDelete={handleDeleteSong}
                    isAdmin={isAdmin}
                    currentUser={currentUser}
                    isInRepertoire={repertoireSongIds.includes(selectedSong.id)}
                    onToggleRepertoire={() => handleToggleRepertoire(selectedSong.id)}
                    onOpenAuth={handleOpenAuth}
                    isVoted={myVotes.has(selectedSong.id)}
                    onVoteSong={handleVoteSong}
                  />
                )}

                {viewMode === 'editor' && (
                  <SongEditor
                    initialSong={isCreatingNew ? undefined : editingSong || undefined}
                    onSave={handleSaveSong}
                    onDelete={handleDeleteSong}
                    isAdmin={isAdmin}
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

            {/* Tab 6: Admin (scraping/cron) — apenas para o proprietário */}
            {activeTab === 'admin' && isAdmin && (
              <AdminScraper songs={songs} onImportSongs={handleImportSongs} />
            )}
            {activeTab === 'admin' && !isAdmin && (
              <div className="text-center py-16">
                <p className="text-sm font-bold text-slate-500">Acesso restrito ao proprietário.</p>
              </div>
            )}
            </Suspense>
            </LazyErrorBoundary>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-5 pb-6 text-center text-xs text-slate-500 mt-auto safe-bottom">
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">UkeMaster Pro</span> • Plataforma 100% Gratuita Mantida por Anúncios
          </div>
          <div className="flex items-center gap-4">
            <span>Afinação padrão G4 C4 E4 A4</span>
          </div>
        </div>
      </footer>

      {/* Sticky Bottom Ad Banner (mobile: apenas se houver conteúdo — hoje é placeholder) */}
      <StickyBottomAd />

      {/* Interstitial Ad Modal (Gates song opening periodically with countdown) */}
      <AdInterstitialModal
        isOpen={isAdInterstitialOpen}
        onComplete={handleCompleteAdInterstitial}
        title={pendingSongToView?.title}
        artist={pendingSongToView?.artist}
      />

      {/* Lead Capture Modal (antes do cadastro — nome/e-mail/WhatsApp) */}
      <LeadCaptureModal
        isOpen={isLeadCaptureOpen}
        onClose={() => setIsLeadCaptureOpen(false)}
        onComplete={handleLeadComplete}
      />
    </div>
  );
}
