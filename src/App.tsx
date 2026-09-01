/**
 * Componente raiz: orquestra toda a experiência — acervo (Supabase + cache local), busca/filtros, votação, repertórios, playlists, modais de anúncio/doação/lead, rotas SPA (/musica/:id) e SEO.
 */
import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './auth';
import { Song, Playlist, ActiveTab } from './types';
import { DEFAULT_SONGS, DEFAULT_PLAYLISTS } from './data/defaultSongs';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SideWidgets } from './components/SideWidgets';
import { AdminSignupWatch } from './components/AdminSignupWatch';
import { MembersCount } from './components/MembersCount';
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
const Metronome = lazy(() =>
  import('./components/Metronome').then((m) => ({ default: m.Metronome }))
);
const VideosHub = lazy(() =>
  import('./components/VideosHub').then((m) => ({ default: m.VideosHub }))
);
const BlogTab = lazy(() =>
  import('./components/BlogTab').then((m) => ({ default: m.BlogTab }))
);
const LearningTrails = lazy(() =>
  import('./components/LearningTrails').then((m) => ({ default: m.LearningTrails }))
);
const CertificateVerify = lazy(() =>
  import('./components/CertificateVerify').then((m) => ({ default: m.CertificateVerify }))
);
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard }))
);
const AdminPanel = lazy(() =>
  import('./components/admin/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
// import { AdSenseSlot } from './components/AdSenseSlot'; // placeholder // placeholder
import { StickyBottomAd } from './components/StickyBottomAd';
import { useT } from './lib/i18n';
import { AdInterstitialModal } from './components/AdInterstitialModal';
import { Monetag } from './components/Monetag';
import { ConsentManager } from './components/ConsentManager';
import { SupportPrompt } from './components/SupportPrompt';
import { LeadCaptureModal } from './components/LeadCaptureModal';
import { SplashScreen } from './components/SplashScreen';
import { ADSENSE_APPROVED } from './config';

/** Máximo de anúncios intersticiais por dia (por dispositivo) — equilíbrio
 * entre receita e experiência: depois do limite, as ações abrem direto. */
const ADS_DAILY_LIMIT = 4;

/**
 * Cadência do intersticial por AÇÃO (contador por sessão): a ação abre o
 * modal quando contador % every === 0. Todas compartilham o limite diário
 * (ADS_DAILY_LIMIT) e o intervalo mínimo (MIN_AD_INTERVAL_MS) — é o
 * "sempre com limite diário".
 *
 * SUAVIZADO (ago/2026): cadências antigas (2ª/3ª) eram agressivas e
 * geravam reclamações. Agora o usuário consegue navegar com naturalidade
 * e só vê o intersticial em momentos de "pausa" entre ações.
 *   song       → abrir cifra: a cada 5ª vez
 *   download   → baixar cifra/coleção: a cada 3ª vez
 *   playlists  → abrir playlists: a cada 5ª vez
 *   tuner      → entrar no afinador: a cada 5ª vez
 *   metronome  → entrar no metrônomo: a cada 5ª vez
 */
type AdGateKey = 'song' | 'download' | 'playlists' | 'tuner' | 'metronome';
const AD_GATE_EVERY: Record<AdGateKey, number> = {
  song: 5,
  download: 3,
  playlists: 5,
  tuner: 5,
  metronome: 5,
};
import {
  loadRepertoire,
  saveRepertoire,
  loadRepertoirePublic,
  saveRepertoirePublic,
  setPublicRepertoire,
} from './lib/repertoires';
import {
  fetchSongsFromCloud,
  fetchSongsPreview,
  fetchSongsPage,
  fetchSongsCount,
  fetchSongFromCloud,
  pushSongsToCloud,
  fetchPlaylistsFromCloud,
  pushPlaylistsToCloud,
  fetchRepertoireFromCloud,
  pushRepertoireToCloud,
  deleteSongFromCloud,
  isSupabaseConfigured,
} from './lib/cloudSync';
import { patchRows } from './lib/supabase';
import { downloadCollectionHtml } from './lib/songExport';
import {
  fetchAffiliateLinks,
  fetchPartnerLinks,
} from './lib/affiliateContent';
import { fetchBlogPosts } from './lib/blogContent.tsx';
import { addRecentSong, getRecentSongs, type RecentSong } from './lib/recentSongs';
import type { AffiliateLink, PartnerLink, BlogPost } from './types';
import {
  getVoterId,
  mergeLocalVotes,
  fetchMyVotes,
  persistVote,
} from './lib/ratings';
import { logContribution } from './lib/contributions';
import { trackEvent, trackPageView } from './lib/analytics';
import { markAdOverlayActive, markAdOverlayIdle } from './lib/adCoordinator';
import { hydrateChordCache, schedulePersistGeneratedChords } from './lib/chordCache';
import { isLikelyAutomatedBrowser, markSessionAsBot } from './lib/antiBot';


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
  const { t } = useT();
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

  // Músicas abertas recentemente (localStorage, atualiza a cada abertura)
  const [recentSongs, setRecentSongs] = useState<RecentSong[]>(getRecentSongs);
  const refreshRecentSongs = useCallback(() => setRecentSongs(getRecentSongs()), []);

  // Autenticação real via Supabase (e-mail + senha, direto no banco)
  const { isSignedIn, user, openSignIn, openSignUp } = useAuth();

  const currentUser = useMemo(() => {
    if (!isSignedIn || !user) return null;
    return {
      id: user.id,
      name: user.name || user.email.split('@')[0] || 'Músico',
      email: user.email,
    };
  }, [isSignedIn, user]);

  // Ranking de contribuidores: cada contribuição da sessão incrementa a chave
  // e o widget "Maiores Contribuidores" re-busca as contagens do servidor.
  const [contributionsVersion, setContributionsVersion] = useState<number>(0);
  const bumpContributions = useCallback(() => {
    setContributionsVersion((v) => v + 1);
  }, []);
  // Loga a contribuição no banco (só quando autenticado) e pede refresh do
  // ranking. Falha silenciosa — nunca interrompe a ação principal.
  const recordContribution = useCallback(
    (action: 'song_new' | 'song_edit' | 'vote' | 'comment' | 'feedback' | 'playlist_new', targetType?: string, targetId?: string) => {
      if (!isSignedIn || !user) return;
      logContribution({
        userId: user.id,
        userName: currentUser?.name || 'Músico',
        action,
        targetType,
        targetId,
      });
      bumpContributions();
    },
    [isSignedIn, user, currentUser?.name, bumpContributions]
  );

  // Área ADMIN — visível apenas para o proprietário
  const isAdmin = currentUser?.email?.toLowerCase() === 'iluminatto@gmail.com';

  // ── Repertório INDIVIDUAL (cada usuário tem o seu) ───────────────────────
  // As MÚSICAS são públicas para todos; o REPERTÓRIO é chaveado pelo id do
  // usuário no Supabase (visitantes usam uma área "guest" separada). Toggle
  // para torná-lo público e compartilhar com a comunidade fica no Dashboard.
  const currentUserId = user?.id || 'guest';

  const [repertoireSongIds, setRepertoireSongIds] = useState<string[]>([]);
  const [repertoireLoadedFor, setRepertoireLoadedFor] = useState<string>('');
  const [isRepertoirePublic, setIsRepertoirePublic] = useState<boolean>(false);
  const [repertoirePublicLoadedFor, setRepertoirePublicLoadedFor] = useState<string>('');

  // Nuvem (Supabase): só habilita push depois do primeiro carregamento
  const [cloudReady, setCloudReady] = useState<boolean>(false);
  // Marca se o usuário editou dados locais antes do primeiro load da nuvem
  // terminar — nesse caso a nuvem NÃO sobrescreve a edição local.
  const localEditedRef = useRef<boolean>(false);

  // ── Carregamento do acervo + cifras sob demanda ─────────────────────
  // catalogLoading: o catálogo da nuvem (só metadados) ainda está chegando;
  // Enquanto o catálogo completo carrega em background, a UI mostra um
  // preview com as primeiras 200 músicas (resolução em <2s).
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  // Total real de músicas no banco (buscado via COUNT sem transferir dados)
  // — aparece no badge da sidebar enquanto o catálogo completo ainda baixa.
  const [catalogTotalCount, setCatalogTotalCount] = useState<number>(0);
  // Cifras completas baixadas ao ABRIR cada música (a lista só tem metadados
  // — buscar tudo seriam ~15MB e o acervo pareceria vazio em conexão lenta).
  const [songDetails, setSongDetails] = useState<
    Record<string, { content: string; simplifiedContent?: string }>
  >({});
  // Músicas cuja cifra NÃO existe no banco (fetch retornou vazio) — o viewer
  // mostra "Cifra indisponível" em vez de ficar carregando para sempre.
  const [unavailableSongIds, setUnavailableSongIds] = useState<Set<string>>(new Set());
  // Promessas de fetch em andamento por id — chamadas concorrentes para a
  // MESMA música (ex.: abrir e clicar em "Editar Cifra" antes de carregar)
  // aguardam o mesmo fetch em vez de duplicá-lo ou abrir o editor vazio.
  const inFlightSongContentRef = useRef<Record<string, Promise<Song | null>>>({});

  // ── Votação (rating): 1 voto por usuário por música ───────────────────────
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const voterId = useMemo(() => getVoterId(user?.id), [user?.id]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('musicas');

  // ── Conteúdo monetizável: links de AFILIADO + PARCEIROS ─────────────
  // Carregados do Supabase (leitura pública); o admin gerencia na aba Admin.
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [partnerLinks, setPartnerLinks] = useState<PartnerLink[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [aff, partners, posts] = await Promise.all([
        fetchAffiliateLinks(),
        fetchPartnerLinks(),
        fetchBlogPosts(),
      ]);
      if (cancelled) return;
      setAffiliateLinks(aff);
      setPartnerLinks(partners);
      setBlogPosts(posts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'list' | 'viewer' | 'editor' | 'playlists'>('list');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  // Total de usuários cadastrados (polling do AdminSignupWatch — badge no menu
  // ADMIN e resumo no painel; só o proprietário vê).
  const [adminUserCount, setAdminUserCount] = useState<number>(0);
  // Usuários online agora (login nos últimos 15 min) — topo do painel admin.
  const [adminOnlineCount, setAdminOnlineCount] = useState<number>(0);

  // Splash de abertura: mostra a marca + homenagem apenas 1x por DIA
  // (chave no localStorage com a data) — repetir a cada visita irrita o
  // público. O usuário que já viu hoje vai direto para o conteúdo.
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem('ukemaster_splash_seen') === today) return false;
      // Marca como vista JÁ no momento em que a splash começa — assim, se o
      // usuário fechar o navegador no meio da reprodução, ela não reabre na
      // mesma visita do dia (a chave só expira à meia-noite).
      localStorage.setItem('ukemaster_splash_seen', today);
      return true;
    } catch {
      return true;
    }
  });

  const finishSplash = () => {
    setShowSplash(false);
  };

  // Interstitial Ad State — gate genérico: guarda a AÇÃO que será liberada
  // após o anúncio (abrir cifra, baixar, abrir playlists, afinador,
  // metrônomo). Ao completar, handleCompleteAdInterstitial executa `run()`.
  const [isAdInterstitialOpen, setIsAdInterstitialOpen] = useState<boolean>(false);
  const [pendingAdAction, setPendingAdAction] = useState<{
    run: () => void;
    title?: string;
    artist?: string;
    openLabel?: string;
  } | null>(null);

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
  const MIN_AD_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos entre intersticiais (era 3)
  // Contadores por ação (sessão) — ver AD_GATE_EVERY
  const adGateCountersRef = useRef<Record<AdGateKey, number>>({
    song: 0,
    download: 0,
    playlists: 0,
    tuner: 0,
    metronome: 0,
  });
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

  // ── Gate genérico do intersticial ────────────────────────────────────
  // Toda ação "premium" (abrir cifra, baixar, abrir playlists, entrar no
  // afinador/metrônomo) passa por aqui: conforme a cadência da ação
  // (AD_GATE_EVERY) + limite diário + intervalo mínimo, ou executa DIRETO,
  // ou guarda a ação e abre o modal de anúncio — que ao completar executa
  // `run()` (handleCompleteAdInterstitial). Um contador por ação evita que
  // ações diferentes "estourem" umas as outras na mesma sessão.
  const gateAdAction = (
    key: AdGateKey,
    run: () => void,
    meta?: { title?: string; artist?: string; openLabel?: string }
  ) => {
    // Quando o AdSense é aprovado, a Monetag é desligada e o interstitial
    // da Monetag não existe mais — libera a ação direto sem gate.
    if (ADSENSE_APPROVED) {
      run();
      return;
    }
    adGateCountersRef.current[key] += 1;
    const count = adGateCountersRef.current[key];
    const now = Date.now();
    const enoughTime = now - lastAdAtRef.current >= MIN_AD_INTERVAL_MS;
    if (count % AD_GATE_EVERY[key] === 0 && getAdsToday() < ADS_DAILY_LIMIT && enoughTime) {
      lastAdAtRef.current = now;
      bumpAdsToday();
      setPendingAdAction({ run, ...meta });
      setIsAdInterstitialOpen(true);
    } else {
      run();
    }
  };

  // Troca de aba com gate: afinador e metrônomo são ações que podem
  // mostrar o intersticial antes (cadência própria); as demais abas abrem
  // direto (comportamento original).
  const handleSetActiveTab = (tab: ActiveTab) => {
    if (tab === 'afinador') {
      gateAdAction('tuner', () => setActiveTab('afinador'), {
        title: t('tab.tuner'),
        openLabel: t('ad.continue'),
      });
      return;
    }
    if (tab === 'metronomo') {
      gateAdAction('metronome', () => setActiveTab('metronomo'), {
        title: t('tab.metronome'),
        openLabel: t('ad.continue'),
      });
      return;
    }
    setActiveTab(tab);
    if (tab === 'musicas') {
      setViewMode('list');
    }
  };

  // Abrir a tela de Playlists também passa pelo intersticial (cadência
  // própria), com o mesmo limite diário.
  const handleOpenPlaylists = () => {
    gateAdAction(
      'playlists',
      () => {
        setActiveTab('musicas');
        setViewMode('playlists');
      },
      { title: t('playlist.title'), openLabel: t('ad.continue') }
    );
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

  // Acordes gerados pelo motor de voicings: carrega o cache conhecido
  // (localStorage + Supabase) e agenda a persistência dos que forem criados
  // na sessão (ex.: ao abrir uma cifra com "D7(9)" ou "Am7M").
  useEffect(() => {
    void hydrateChordCache().then(() => schedulePersistGeneratedChords(2000));
  }, []);

  // ── Nuvem (Supabase): carregamento inicial ──────────────────────────
  // Busca songs/playlists na nuvem. Se a nuvem tiver dados (acervo público
  // compartilhado), eles substituem o local. Se vazia/indisponível, mantém
  // o local e faz seed na nuvem via push (abaixo).
  //
  // ANTI-SCRAPING client-side: navegadores automatizados/headless não
  // recebem o catálogo completo da nuvem (ficam com os defaults) — reduz
  // o custo de raspagem em massa via navegador sem afetar usuários reais.
  const isAutomatedBrowser = useMemo(() => isLikelyAutomatedBrowser(), []);
  useEffect(() => {
    if (isAutomatedBrowser) markSessionAsBot();
  }, [isAutomatedBrowser]);
  // ── Carregamento progressivo ──────────────────────────────────────
  // 1) Preview rápido: 200 músicas + playlists → UI aparece em <2s.
  // 2) Contagem total em background → badge/subtítulo atualizam.
  // NÃO carrega o catálogo completo no entry — 200 são suficientes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isAutomatedBrowser) {
        setCatalogLoading(false);
        setCloudReady(true);
        return;
      }

      // ── Fase 1a: Preview rápido (primeiras 200 + playlists) ──
      // Busca PARALELA sem o count (que pode demorar no Supabase).
      const [previewSongs, cloudPlaylists] = await Promise.all([
        fetchSongsPreview(300),
        fetchPlaylistsFromCloud(),
      ]);
      if (cancelled) return;

      if (previewSongs && previewSongs.length > 0 && !localEditedRef.current) {
        setSongs(mergeLocalVotes(previewSongs));
      }
      if (cloudPlaylists && cloudPlaylists.length > 0 && !localEditedRef.current) {
        setPlaylists(cloudPlaylists);
      }
      setCatalogLoading(false);
      setCloudReady(true);

      // ── Contagem total (background, não bloqueia) ──
      // Mostra o total real no badge/subtítulo assim que chegar.
      fetchSongsCount().then((count) => {
        if (!cancelled && count > 0) setCatalogTotalCount(count);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Carregamento sob demanda: "Mostrar mais" busca a próxima página ──
  // Cada clique carrega mais 200 músicas do banco via cursor (id < último).
  const loadingMoreRef = useRef<boolean>(false);
  const handleLoadMoreSongs = useCallback(async () => {
    if (loadingMoreRef.current || songs.length === 0) return;
    loadingMoreRef.current = true;
    try {
      // Usa o menor id das músicas carregadas como cursor
      const lastId = songs.reduce((min, s) => (s.id < min ? s.id : min), songs[0].id);
      const more = await fetchSongsPage(lastId, 200);
      if (more && more.length > 0) {
        setSongs((prev) => {
          const existing = new Set(prev.map((s) => s.id));
          const newOnes = more.filter((s) => !existing.has(s.id));
          return [...prev, ...newOnes];
        });
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [songs]);

  // ── Cifra sob demanda: busca o conteúdo completo ao ABRIR a música ──
  // A lista carrega só metadados (~1,5MB); a cifra (content) vem por música
  // quando o usuário abre — e fica cacheada em memória na sessão.
  const ensureSongContent = useCallback(
    async (song: Song): Promise<Song | null> => {
      if (song.content) return song;
      const cached = songDetails[song.id];
      if (cached) {
        return { ...song, content: cached.content, simplifiedContent: cached.simplifiedContent };
      }
      // Fetch já em andamento para esta música? Aguarda a MESMA promessa
      // (ex.: "Editar Cifra" clicado enquanto a cifra ainda está baixando).
      const inFlight = inFlightSongContentRef.current[song.id];
      if (inFlight) return inFlight;
      const promise = (async () => {
        try {
          const full = await fetchSongFromCloud(song.id);
          if (full && full.content) {
            setSongDetails((prev) => ({
              ...prev,
              [song.id]: {
                content: full.content,
                simplifiedContent: full.simplifiedContent,
              },
            }));
            return full;
          }
          setUnavailableSongIds((prev) => new Set(prev).add(song.id));
          return null;
        } finally {
          delete inFlightSongContentRef.current[song.id];
        }
      })();
      inFlightSongContentRef.current[song.id] = promise;
      return promise;
    },
    [songDetails]
  );

  // Toda vez que uma música é aberta (lista, ranking, URL /musica/:id),
  // garante que a cifra completa estará disponível no viewer.
  useEffect(() => {
    if (!selectedSong) return;
    ensureSongContent(selectedSong);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSong?.id]);

  // O indicador "Carregando..." aparece enquanto a Fase 1 (preview) não
  // terminou — depois disso, a UI já tem 200 músicas para mostrar.
  const showCatalogLoading = catalogLoading;

  // ── Cifra em Destaque (sidebar): escolha determinística do dia ────────
  // Sorteia entre as 60 mais votadas do acervo com seed pela data — a mesma
  // música aparece para todos no dia, e muda à meia-noite (sem depender de
  // aleatório por cliente).
  const featuredSong = useMemo(() => {
    if (songs.length === 0) return null;
    const pool = [...songs]
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, 60);
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return pool[h % pool.length] ?? null;
  }, [songs]);

  // Música selecionada com a cifra resolvida (da seed local ou do cache de
  // detalhes baixado sob demanda) — o viewer mostra loading enquanto busca.
  const resolvedSelectedSong = useMemo(() => {
    if (!selectedSong) return null;
    if (selectedSong.content) return selectedSong;
    const details = songDetails[selectedSong.id];
    if (details) {
      return {
        ...selectedSong,
        content: details.content,
        simplifiedContent: details.simplifiedContent,
      };
    }
    return selectedSong;
  }, [selectedSong, songDetails]);

  // "Carregando cifra…" enquanto o conteúdo ainda não chegou e a busca não
  // falhou — sem o flash de "Cifra indisponível" no primeiro frame.
  const selectedSongContentLoading =
    !!selectedSong &&
    !selectedSong.content &&
    !songDetails[selectedSong.id] &&
    !unavailableSongIds.has(selectedSong.id);

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

  // Push (debounce) songs/playlists para a nuvem a cada alteração.
  // REGRA: só usuários LOGADOS enviam dados ao acervo (nunca contribuir sem
  // logar) — o RLS de songs/playlists passa a exigir login. Visitantes usam
  // o catálogo da nuvem como leitura; alterações locais deles ficam locais.
  useEffect(() => {
    if (!cloudReady || !isSignedIn) return;
    const t = setTimeout(() => {
      pushSongsToCloud(songs);
    }, 1000);
    return () => clearTimeout(t);
  }, [songs, cloudReady, isSignedIn]);

  useEffect(() => {
    if (!cloudReady || !isSignedIn) return;
    const t = setTimeout(() => {
      pushPlaylistsToCloud(playlists);
    }, 1000);
    return () => clearTimeout(t);
  }, [playlists, cloudReady, isSignedIn]);

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
    if (isRepertoirePublic && isSignedIn && user) {
      setPublicRepertoire(currentUserId, {
        userId: currentUserId,
        name: user.name || 'Músico',
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
    user,
    repertoirePublicLoadedFor,
  ]);

  // Nuvem: espelha o repertório do usuário (só contas reais, não guest)
  useEffect(() => {
    if (repertoireLoadedFor !== currentUserId) return;
    if (currentUserId === 'guest') return;
    if (!isSupabaseConfigured()) return;
    const name =
      isSignedIn && user
        ? user.name || 'Músico'
        : 'Músico';
    pushRepertoireToCloud(currentUserId, name, repertoireSongIds, isRepertoirePublic);
  }, [
    repertoireSongIds,
    isRepertoirePublic,
    currentUserId,
    repertoireLoadedFor,
    isSignedIn,
    user,
  ]);

  // Viewer em TELA CHEIA no mobile: ao abrir uma música, a cifra ocupa toda
  // a área do dispositivo — sem o "card" branco, sem o padding lateral e sem
  // o chrome de navegação (header/barra de apoio/footer). No desktop a
  // experiência continua em card dentro do layout normal.
  const isFullscreenViewer = activeTab === 'musicas' && viewMode === 'viewer';

  // Altura do topo fixo (banner laranja + header) — a sidebar desktop cola
  // logo abaixo dele. Mede dinamicamente (ResizeObserver) para acompanhar
  // quebras de linha do banner em telas estreitas.
  const topFixedRef = useRef<HTMLDivElement>(null);
  const [topFixedHeight, setTopFixedHeight] = useState<number>(101);
  useEffect(() => {
    const el = topFixedRef.current;
    if (!el) return;
    const update = () => setTopFixedHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  //
  // REGRA: votar é CONTRIBUIR → exige login (nunca contribuir sem logar).
  const handleVoteSong = (song: Song) => {
    if (!isSignedIn) {
      handleOpenAuth('login');
      return;
    }
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

    // Registra o voto como contribuição (ranking) — só quando de fato votou
    if (vote) {
      recordContribution('vote', 'song', song.id);
    }
  };

  // ── Rotas de aba pela URL (SEO): /dicionario, /afinador, /ritmos ──────
  // A Vercel reescreve essas rotas para a SPA (index.html). Aqui o app
  // reconhece o pathname e abre a aba correspondente — senão o usuário/crawler
  // cairia sempre na home (soft-404: URL diz "dicionario", conteúdo mostra home).
  useEffect(() => {
    const pathToTab: Record<string, string> = {
      '/dicionario': 'dicionario',
      '/trilhas': 'trilhas',
      '/afinador': 'afinador',
      '/ritmos': 'ritmos',
    };
    const tab = pathToTab[window.location.pathname];
    if (tab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rota /verificar/:code — página pública de verificação de certificado ──
  // A Vercel reescreve /verificar/* para a SPA; aqui o app detecta o código
  // e abre a tela de verificação em tela cheia (overlay), como o viewer.
  const [verifyCode, setVerifyCode] = useState<string | null>(null);
  useEffect(() => {
    const m = window.location.pathname.match(/^\/verificar\/(.+)$/);
    setVerifyCode(m ? decodeURIComponent(m[1]) : null);
    if (m) document.title = `Verificação de Certificado | UkeMaster Pro`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Abertura por URL (link compartilhado/SEO) também conta na "Mais Acessadas"
    bumpViews(song);
    setActiveTab('musicas');
    setSelectedSong(song);
    setViewMode('viewer');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Mais Acessadas: contador de visualizações. UI otimista + persistência
  // silenciosa no banco. Um ref por música evita que abrir a MESMA cifra 2x
  // seguidas use o valor stale (prop antiga) e perca a contagem.
  const viewsCountRef = useRef<Record<string, number>>({});
  const bumpViews = useCallback((song: Song) => {
    const prev = viewsCountRef.current[song.id] ?? song.views ?? 0;
    const next = prev + 1;
    viewsCountRef.current[song.id] = next;
    setSongs((songsState) =>
      songsState.map((s) => (s.id === song.id ? { ...s, views: next } : s))
    );
    // A coluna views fica na tabela songs, cujo UPDATE agora exige login
    // (migration-ukemater-cron.sql). Visitantes contam localmente na sessão;
    // o PATCH na nuvem só é enviado por usuários autenticados.
    if (isSupabaseConfigured() && isSignedIn) {
      patchRows('songs', `?id=eq.${encodeURIComponent(song.id)}`, { views: next });
    }
  }, [isSignedIn]);

  const handleSelectSong = (song: Song) => {
    const nextCount = songOpenCount + 1;
    setSongOpenCount(nextCount);
    bumpViews(song);
    addRecentSong(song);
    refreshRecentSongs();

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

    // Show interstitial ad gate on every 3rd song view attempt — meio termo
    // (aumentado de 6ª para 3ª a pedido do proprietário, mantendo limite
    // diário + intervalo). LIMITE DIÁRIO + intervalo mínimo: depois de N
    // anúncios no dia (ou se o último foi há menos de 3 min) abre direto.
    gateAdAction(
      'song',
      () => {
        setSelectedSong(song);
        setViewMode('viewer');
      },
      { title: song.title, artist: song.artist }
    );
  };

  const handleCompleteAdInterstitial = () => {
    if (pendingAdAction) {
      pendingAdAction.run();
      setPendingAdAction(null);
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

  // Fluxo de cadastro: primeiro captura o lead, depois abre o cadastro Supabase
  const handleOpenAuth = (mode?: 'signup' | 'login') => {
    trackEvent(mode === 'login' ? 'login_start' : 'signup_start');
    if (mode === 'login') {
      openSignIn();
      return;
    }
    setIsLeadCaptureOpen(true);
  };

  const handleLeadComplete = (lead?: { name?: string; email?: string; whatsapp?: string }) => {
    setIsLeadCaptureOpen(false);
    trackEvent('lead_captured');
    openSignUp({
      name: lead?.name,
      email: lead?.email,
      whatsapp: lead?.whatsapp,
    });
  };

  const handleCreateNewSong = () => {
    // Criar cifra é CONTRIBUIR → exige login (nunca contribuir sem logar)
    if (!isSignedIn) {
      handleOpenAuth('login');
      return;
    }
    setEditingSong(null);
    setIsCreatingNew(true);
    setViewMode('editor');
  };

  const handleEditSong = async (song: Song) => {
    // Editar cifra é CONTRIBUIR → exige login (nunca contribuir sem logar)
    if (!isSignedIn) {
      handleOpenAuth('login');
      return;
    }
    // Garante a cifra completa antes de abrir o editor (a lista só tem metadados)
    const full = await ensureSongContent(song);
    setEditingSong(full ?? song);
    setIsCreatingNew(false);
    setViewMode('editor');
  };

  const handleSaveSong = (savedSong: Song) => {
    markLocalEdited();
    const isNewSong = !songs.some((s) => s.id === savedSong.id);
    setSongs((prev) => {
      const exists = prev.some((s) => s.id === savedSong.id);
      if (exists) {
        return prev.map((s) => (s.id === savedSong.id ? savedSong : s));
      } else {
        return [savedSong, ...prev];
      }
    });
    // Registrar contribuição (nova cifra ou edição) para o ranking
    recordContribution(isNewSong ? 'song_new' : 'song_edit', 'song', savedSong.id);

    setSelectedSong(savedSong);
    setViewMode('viewer');
    setEditingSong(null);
    setIsCreatingNew(false);
  };

  // ── Download de coleções (playlist/repertório): garante a cifra completa
  // de cada música (a lista só tem metadados) e gera o documento com letra +
  // diagramas de acordes. Busca em sequência para não estourar rate limit.
  // Download de coleções (playlist/repertório): também passa pelo gate do
  // intersticial (a cada 2º, com limite diário) antes de gerar o arquivo.
  const handleDownloadCollection = (title: string, list: Song[]) => {
    gateAdAction(
      'download',
      async () => {
        const resolved: Song[] = [];
        for (const s of list) {
          try {
            const full = await ensureSongContent(s);
            resolved.push(full ?? s);
          } catch {
            resolved.push(s); // mantém metadados — seção avisa que não há cifra
          }
        }
        downloadCollectionHtml(title, resolved);
      },
      { title, openLabel: t('viewer.download') }
    );
  };

  const handleDeleteSong = (songId: string) => {
    markLocalEdited();
    const targetSong = songs.find((s) => s.id === songId);
    const title = targetSong ? targetSong.title : 'Música';

    // Exclusão definitiva no banco (somente admin — a UI já restringe o
    // botão; o RLS no Supabase exige o JWT do admin para o DELETE).
    if (isAdmin && isSupabaseConfigured()) {
      deleteSongFromCloud(songId).catch(() => {
        // Falha (rede/401): a música volta no próximo fetch da nuvem — o
        // push é UPSERT-only e nunca deleta, então não há risco de apagar
        // o acervo compartilhado por engano.
      });
    }

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
      trilhas: 'Trilhas de Aprendizado',
      afinador: 'Afinador',
      ritmos: 'Ritmos e Batidas',
      metronomo: 'Metrônomo',
      videos: 'Vídeo Aulas',
      blog: 'Blog',
      admin: 'Admin',
    };
    const paths: Record<ActiveTab, string> = {
      dashboard: '/dashboard',
      musicas: '/musicas',
      dicionario: '/dicionario',
      trilhas: '/trilhas',
      afinador: '/afinador',
      ritmos: '/ritmos',
      metronomo: '/metronomo',
      videos: '/videos',
      blog: '/blog',
      admin: '/admin',
    };
    trackPageView(labels[activeTab] || activeTab, paths[activeTab]);
    trackEvent('tab_view', { tab: activeTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Analytics: scroll depth — rastrea o quanto o usuário rola em cada página.
  // Dados de scroll depth ajudam a otimizar posições de anúncio:
  //  - Se 80% dos usuários rolam até 500px, colocar ads nessa altura maximiza impressões.
  //  - Se a maioria não passa de 300px, ads no final da página são desperdício.
  useEffect(() => {
    let maxScrollPercent = 0;
    let sent = false;

    const onScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;
      const percent = Math.round((window.scrollY / scrollHeight) * 100);
      if (percent > maxScrollPercent) maxScrollPercent = percent;
    };

    const onBeforeUnload = () => {
      if (sent || maxScrollPercent === 0) return;
      sent = true;
      // Envia a faixa de scroll (buckets: 25, 50, 75, 90, 100)
      const bucket = maxScrollPercent >= 100 ? '100' : maxScrollPercent >= 90 ? '90' : maxScrollPercent >= 75 ? '75' : maxScrollPercent >= 50 ? '50' : maxScrollPercent >= 25 ? '25' : '0';
      trackEvent('scroll_depth', { percent: bucket, max_percent: maxScrollPercent });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('beforeunload', onBeforeUnload);
      onBeforeUnload(); // envia ao desmontar (troca de tab)
    };
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
    recordContribution('playlist_new', 'playlist', newPl.id);
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
    // Só conta como contribuição as músicas NOVAS (não duplicatas/edições)
    const newOnes = importedSongs.filter(
      (imp) =>
        !songs.some(
          (m) =>
            m.id === imp.id ||
            (m.title.trim().toLowerCase() === imp.title.trim().toLowerCase() &&
              m.artist.trim().toLowerCase() === imp.artist.trim().toLowerCase())
        )
    );
    if (newOnes.length > 0) {
      // Registra no ranking (limite de 25 por lote para não disparar um
      // volume alto de POSTs num único import — o resto entra no acervo
      // normalmente, só não conta pontos extras no ranking).
      newOnes.slice(0, 25).forEach((s) => recordContribution('song_new', 'song', s.id));
    }
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

  // ── AdSense: só exibe anúncios em telas com conteúdo editorial ───────
  // Evita violação de política do Google AdSense ("valuable content").
  // Telas SEM conteúdo: editor, playlists, dashboard, admin.
  // Telas COM conteúdo: lista de músicas, cifra, dicionário, ritmos,
  //   trilhas, vídeos, blog, afinador, metrônomo.
  const hasEditorialContent = useMemo(() => {
    if (verifyCode) return false;
    // Telas SEM conteúdo editorial (ferramentas, edição, config):
    if (activeTab === 'dashboard' || activeTab === 'admin') return false;
    if (activeTab === 'musicas' && (viewMode === 'editor' || viewMode === 'playlists')) return false;
    // Ferramentas (afinador, metrônomo) não são conteúdo editorial —
    // exibir anúncios aqui viola a política do Google AdSense.
    if (activeTab === 'afinador' || activeTab === 'metronomo') return false;
    return true;
  }, [activeTab, viewMode, verifyCode]);

  return (
    <div className="min-h-screen bg-bg-brand text-slate-900 font-sans antialiased flex flex-col">
      {/* Splash de abertura — aparece 1x por dia, some sozinha (fade out) */}
      {showSplash && <SplashScreen onFinish={finishSplash} />}

      {/* Consent Management Platform (CMP) — GDPR/TCF v2 para visitantes europeus */}
      <ConsentManager />

      {/* Monetag Ads (banners in-page) — script injetado no <head> */}
      <Monetag />

      {/* Alerta de novo cadastro + contagem de usuários — retorna null para
          quem não é o proprietário; o endpoint valida admin server-side. */}
      <AdminSignupWatch
        isAdmin={isAdmin}
        onUserCount={setAdminUserCount}
        onOnlineCount={setAdminOnlineCount}
      />

      {/* Topo FIXO: banner laranja (APOIA.se) + header de navegação ficam
          SEMPRE visíveis, independente da rolagem (sticky top-0). Somem no
          mobile quando o viewer de cifra está em tela cheia. */}
      <div
        ref={topFixedRef}
        className={`safe-top sticky top-0 z-20 ${
          isFullscreenViewer ? 'hidden md:block' : ''
        }`}
      >
        <SupportPrompt />
        <Header
          setActiveTab={handleSetActiveTab}
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
      </div>

      {/* Main Container Layout with Sidebar + Workspace — sem padding no
          mobile quando o viewer de cifra está em tela cheia */}
      <div
        className={`flex-1 flex flex-wrap w-full max-w-[1600px] mx-auto gap-6 ${
          isFullscreenViewer ? 'px-0 py-0 sm:px-6 sm:py-6' : 'px-3 sm:px-6 py-4 sm:py-6'
        } lg:pl-[304px] md:pb-14`}
      >
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleSetActiveTab}
          topOffset={topFixedHeight}
          songsCount={catalogTotalCount > 0 ? catalogTotalCount : songs.length}
          catalogLoading={showCatalogLoading}
          playlistsCount={playlists.length}
          viewMode={viewMode}
          onOpenPlaylists={handleOpenPlaylists}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isAdmin={isAdmin}
          adminUserCount={adminUserCount}
        />

        {/* Right Main Content Panel */}
        <main className="flex-1 min-w-0">
          {/* Tab Views — lista de músicas fica sem wrapper branco (layout do
              template); demais telas mantêm o card. No mobile, o VIEWER de
              cifra abre em TELA CHEIA (sem card, ocupando toda a área do
              dispositivo); no desktop volta ao card do layout. */}
          <div
            className={
              isFullscreenViewer
                ? 'ukemaster-viewer-fullscreen pt-[env(safe-area-inset-top,0px)] md:pt-0 md:min-h-[600px] md:bg-white md:border md:border-slate-200/90 md:rounded-2xl md:p-6 md:shadow-2xs'
                : activeTab === 'musicas' && viewMode === 'list'
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
                recentSongs={recentSongs}
                onSelectSong={handleSelectSong}
                    onRemoveFromRepertoire={handleToggleRepertoire}
                    onOpenAuth={handleOpenAuth}
                    onGoToPublicSongs={() => {
                      setActiveTab('musicas');
                      setViewMode('list');
                    }}
                    onDownloadRepertoire={handleDownloadCollection}
                  />
            )}

            {/* Tab 2: Public Songs & Playlists Catalog */}
            {activeTab === 'musicas' && (
              <>
                {viewMode === 'list' && (
                  <SongList
                    songs={songs}
                    playlists={playlists}
                    affiliateLinks={affiliateLinks}
                    partnerLinks={partnerLinks}
                    blogPosts={blogPosts}
                    onOpenBlog={() => setActiveTab('blog')}
                    onOpenPlaylists={handleOpenPlaylists}
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
                    catalogLoading={showCatalogLoading}
                    totalCount={catalogTotalCount}
                    onLoadMore={handleLoadMoreSongs}
                    currentUser={
                      currentUser ? { id: currentUser.id, name: currentUser.name } : null
                    }
                    contributionsRefreshKey={contributionsVersion}
                  />
                )}

                {viewMode === 'viewer' && resolvedSelectedSong && (
                  <SongViewer
                    song={resolvedSelectedSong}
                    contentLoading={selectedSongContentLoading}
                    affiliateLinks={affiliateLinks}
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
                    onGateDownload={(run) =>
                      gateAdAction('download', run, {
                        title: resolvedSelectedSong.title,
                        artist: resolvedSelectedSong.artist,
                        openLabel: t('viewer.download'),
                      })
                    }
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
                    onDownloadPlaylist={handleDownloadCollection}
                    isLoggedIn={!!isSignedIn}
                    onOpenAuth={handleOpenAuth}
                  />
                )}
              </>
            )}

            {/* Tab 2b: Trilhas de Aprendizado */}
            {activeTab === 'trilhas' && (
              <LearningTrails
                songs={songs}
                onSelectSong={handleSelectSong}
                userName={currentUser?.name}
                userId={currentUser?.id}
              />
            )}

            {/* Tab 3: Chord Dictionary */}
            {activeTab === 'dicionario' && <ChordDictionary />}

            {/* Tab 4: Ukulele Tuner */}
            {activeTab === 'afinador' && <Tuner />}

            {/* Tab 5: Strumming & Rhythm Guide */}
            {activeTab === 'ritmos' && <StrummingGuide />}

            {/* Tab 5b: Metrônomo */}
            {activeTab === 'metronomo' && <Metronome />}

            {/* Tab 5c: Vídeo Aulas (parceiros + pedir videoaula) */}
            {activeTab === 'videos' && <VideosHub partnerLinks={partnerLinks} />}

            {/* Tab 5d: Blog (artigos do proprietário) */}
            {activeTab === 'blog' && <BlogTab posts={blogPosts} />}

            {/* Tab 6: Admin (scraping/cron + conteúdo monetizável) — apenas p/ proprietário */}
            {activeTab === 'admin' && isAdmin && (
              <AdminPanel
                songs={songs}
                onSongsChange={setSongs}
                onImportSongs={handleImportSongs}
                affiliateLinks={affiliateLinks}
                onAffiliateChange={setAffiliateLinks}
                partnerLinks={partnerLinks}
                onPartnerChange={setPartnerLinks}
                blogPosts={blogPosts}
                onBlogChange={setBlogPosts}
                userCount={adminUserCount}
                onlineCount={adminOnlineCount}
              />
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

        {/* Widgets do lado DIREITO (Cifra do Dia, Dica, WhatsApp) — um
            SORTEADO aleatoriamente por vez, com botão para sortear outro.
            Em telas < xl quebra para baixo do conteúdo (flex-wrap). */}
        <SideWidgets
          featuredSong={featuredSong}
          onSelectFeaturedSong={(song) => {
            // Vem de qualquer aba (Dicionário, Blog...) — garante que a cifra
            // abre na aba de músicas, senão o clique pareceria não fazer nada.
            setActiveTab('musicas');
            setViewMode('list');
            handleSelectSong(song);
          }}
          showAd={hasEditorialContent}
        />
      </div>

      {/* Footer — barra laranja: copyright + 100% gratuito */}
      {/* Footer — barra laranja: copyright + 100% gratuito. FIXO no fundo da
          tela no desktop (md+); no mobile fica no fluxo para não colidir com
          o anúncio fixo de rodapé (StickyBottomAd). */}
      <footer
        className={`${
          isFullscreenViewer ? 'hidden md:block' : ''
        } bg-gradient-to-r from-[#F26419] to-[#E2540F] py-3 text-white text-xs mt-auto safe-bottom md:fixed md:bottom-0 md:inset-x-0 md:z-30`}
      >
        <div className="max-w-[1600px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-1.5 text-center">
          <span className="font-bold tracking-wide">
            © {new Date().getFullYear()}{' '}
            <a
              href="https://iluminattodev.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/50 underline-offset-2 hover:text-[#FFE3D0] transition-colors cursor-pointer"
            >
              Iluminatto Moraes
            </a>{' '}
            — {t('footer.free')}
          </span>
          <span className="opacity-90 font-medium flex items-center gap-3">
            <MembersCount label={t('footer.members')} />
            <span aria-hidden className="opacity-40">•</span>
            {t('footer.tuning')}
            <a
              href="/privacidade.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/50 underline-offset-2 hover:text-[#FFE3D0] transition-colors cursor-pointer"
            >
              Privacidade
            </a>
            <span aria-hidden className="opacity-40">•</span>
            <a
              href="/termos.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/50 underline-offset-2 hover:text-[#FFE3D0] transition-colors cursor-pointer"
            >
              Termos de Uso
            </a>
          </span>
        </div>
      </footer>

      {/* Sticky Bottom Ad Banner (mobile) — só em telas com conteúdo editorial */}
      <StickyBottomAd show={hasEditorialContent} />

      {/* Interstitial Ad Modal — gate genérico: libera a ação pendente
          (cifra, download, playlists, afinador, metrônomo) após o anúncio */}
      <AdInterstitialModal
        isOpen={isAdInterstitialOpen}
        onComplete={handleCompleteAdInterstitial}
        title={pendingAdAction?.title}
        artist={pendingAdAction?.artist}
        openLabel={pendingAdAction?.openLabel}
      />

      {/* Lead Capture Modal (antes do cadastro — nome/e-mail/WhatsApp) */}
      <LeadCaptureModal
        isOpen={isLeadCaptureOpen}
        onClose={() => setIsLeadCaptureOpen(false)}
        onComplete={handleLeadComplete}
      />

      {/* Verificação pública de certificado (/verificar/UKM-...) — overlay
          em tela cheia quando a rota é detectada */}
      {verifyCode && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0E7C7B]/95">
              <p className="text-white font-bold text-sm">{t('misc.loading')}</p>
            </div>
          }
        >
          <LazyErrorBoundary>
            <CertificateVerify
              code={verifyCode}
              onBack={() => {
                setVerifyCode(null);
                window.history.replaceState({}, '', '/');
              }}
            />
          </LazyErrorBoundary>
        </Suspense>
      )}
    </div>
  );
}
