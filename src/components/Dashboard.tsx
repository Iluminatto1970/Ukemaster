/**
 * Repertórios privados do usuário: listagem, organização e compartilhamento público.
 */
import React, { useState } from 'react';
import { Song, Playlist } from '../types';
import { useT } from '../lib/i18n';
import { difficultyLabel } from '../utils/difficultyLabel';
import {
  FolderHeart,
  Sparkles,
  Lock,
  Globe,
  Plus,
  Music,
  CheckCircle2,
  BookOpen,
  User,
  Star,
  Search,
  ChevronRight,
  Trash2,
  Tag,
  Gauge,
  Award,
  Play,
  ShieldAlert,
  Download,
  Loader2,
} from 'lucide-react';

interface DashboardProps {
  currentUser: { name: string; email: string } | null;
  repertoireSongIds: string[];
  isRepertoirePublic: boolean;
  onToggleRepertoirePublic: () => void;
  songs: Song[];
  playlists: Playlist[];
  onSelectSong: (song: Song) => void;
  onRemoveFromRepertoire: (songId: string) => void;
  onOpenAuth: (mode?: 'signup' | 'login') => void;
  onGoToPublicSongs: () => void;
  /** Baixa o repertório completo (letra + diagramas de todas as cifras). */
  onDownloadRepertoire?: (title: string, songs: Song[]) => Promise<void> | void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  repertoireSongIds,
  isRepertoirePublic,
  onToggleRepertoirePublic,
  songs,
  playlists,
  onSelectSong,
  onRemoveFromRepertoire,
  onOpenAuth,
  onGoToPublicSongs,
  onDownloadRepertoire,
}) => {
  const { t } = useT();
  const [downloading, setDownloading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'estudando' | 'dominado'>('all');

  // Filter songs in private repertoire
  const repertoireSongs = songs.filter((s) => repertoireSongIds.includes(s.id));

  // Busca insensível a acentos (caetano == caetano) e maiúsculas
  const normalizeSearch = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const query = normalizeSearch(searchQuery.trim());

  const filteredRepertoire = repertoireSongs.filter((s) => {
    const matchSearch =
      !query ||
      normalizeSearch(s.title || '').includes(query) ||
      normalizeSearch(s.artist || '').includes(query) ||
      (s.category && normalizeSearch(s.category).includes(query));
    return matchSearch;
  });

  // Baixa o REPERTÓRIO COMPLETO (não só o filtrado pela busca ativa — o
  // arquivo "Meu Repertório" deve refletir a lista inteira do usuário).
  const handleDownloadRepertoire = async () => {
    if (downloading || !onDownloadRepertoire || repertoireSongs.length === 0) return;
    setDownloading(true);
    try {
      await onDownloadRepertoire('Meu Repertório', repertoireSongs);
    } finally {
      setDownloading(false);
    }
  };

  // If user is not logged in, show guest teaser screen for Private Dashboard
  if (!currentUser) {
    return (
      <div className="space-y-6 text-slate-900 animate-fade-in">
        {/* Banner Teaser */}
        <div className="bg-gradient-to-r from-[#1D2D44] via-[#0E7C7B] to-[#1D2D44] rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F26419] text-white text-xs font-black tracking-wider uppercase">
              <Lock className="w-3.5 h-3.5" />
              {t('dashboard.privateArea')}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {t('dashboard.dashboardTitle')}
            </h1>
            <p className="text-teal-100 text-sm leading-relaxed">
              {t('dashboard.dashboardDesc')}
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                onClick={() => onOpenAuth('signup')}
                className="px-6 py-3 rounded-2xl bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs tracking-wider uppercase shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {t('dashboard.createFreeAccount')}
              </button>
              <button
                onClick={() => onOpenAuth('login')}
                className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 font-extrabold text-xs tracking-wider uppercase transition-all cursor-pointer"
              >
                {t('dashboard.haveAccount')}
              </button>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#F26419] flex items-center justify-center font-bold">
              <FolderHeart className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">{t('dashboard.private')}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('dashboard.privateDesc')}
            </p>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0E7C7B] flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">{t('dashboard.evolution')}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('dashboard.evolutionDesc')}
            </p>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base">{t('dashboard.yours')}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {t('dashboard.yoursDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900 animate-fade-in">
      {/* User Dashboard Header */}
      <div className="bg-gradient-to-r from-[#1D2D44] via-[#0E7C7B] to-[#1D2D44] rounded-3xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F26419] text-white flex items-center justify-center font-black text-2xl shadow-md border-2 border-white/20">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-teal-200">
                  {t('dashboard.musicianDashboard')}
                </span>
                <span className="px-2 py-0.2 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold">
                  {t('dashboard.activeAccount')}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">{currentUser.name}</h1>
              <p className="text-xs text-teal-100/90">{currentUser.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onGoToPublicSongs}
              className="px-4 py-2.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs tracking-wider uppercase shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t('dashboard.explorePublic')}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <span className="text-[10px] text-teal-100 font-extrabold uppercase tracking-wider block">
              {t('dashboard.privateRepertoire')}
            </span>
            <span className="text-xl font-black text-white">{repertoireSongs.length} {t('dashboard.songsCount')}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <span className="text-[10px] text-teal-100 font-extrabold uppercase tracking-wider block">
              {t('dashboard.publicCatalog')}
            </span>
            <span className="text-xl font-black text-white">{songs.length} {t('dashboard.available')}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <span className="text-[10px] text-teal-100 font-extrabold uppercase tracking-wider block">
              {t('dashboard.playlistsPortal')}
            </span>
            <span className="text-xl font-black text-white">{playlists.length} {t('dashboard.lists')}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <span className="text-[10px] text-teal-100 font-extrabold uppercase tracking-wider block">
              {t('dashboard.accessStatus')}
            </span>
            <span className="text-sm font-black text-emerald-300">{t('dashboard.unlocked')}</span>
          </div>
        </div>
      </div>

      {/* Private Repertoire Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <FolderHeart className="w-5 h-5 text-[#F26419]" />
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {t('dashboard.myPrivateRepertoire')}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {t('dashboard.myPrivateDesc')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* Baixar repertório (letra + diagramas) */}
            {onDownloadRepertoire && (
              <button
                onClick={handleDownloadRepertoire}
                disabled={downloading || repertoireSongs.length === 0}
                title={filteredRepertoire.length === 0 ? t('dashboard.addSongsToDownload') : t('dashboard.downloadRepertoireTitle')}
                className="px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer bg-[#0E7C7B] text-white border-[#0E7C7B] shadow-xs hover:bg-[#0A5F5E] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {downloading ? t('dashboard.preparing') : t('dashboard.downloadRepertoire')}
              </button>
            )}

            {/* Public/Private Toggle */}
            <button
              onClick={onToggleRepertoirePublic}
              title={isRepertoirePublic ? t('dashboard.visibleCommunity') : t('dashboard.shareCommunity')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-all cursor-pointer ${
                isRepertoirePublic
                  ? 'bg-[#0E7C7B] text-white border-[#0E7C7B] shadow-xs hover:bg-[#0A5F5E]'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#0E7C7B] hover:text-[#0E7C7B]'
              }`}
            >
              {isRepertoirePublic ? (
                <>
                  <Globe className="w-4 h-4" /> {t('dashboard.publicRepertoire')}
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 text-slate-400" /> {t('dashboard.makePublic')}
                </>
              )}
            </button>

            {/* Search within Repertoire */}
            <div className="relative w-full sm:w-auto sm:min-w-[240px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('dashboard.search')}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Banner quando público */}
        {isRepertoirePublic && (
          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            <Globe className="w-4 h-4 shrink-0 mt-0.5 text-[#0E7C7B]" />
            <p className="text-xs font-bold leading-relaxed">
              {t('dashboard.publicBanner')}
            </p>
          </div>
        )}

        {/* Repertoire Songs List */}
        {filteredRepertoire.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
            <Music className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-extrabold text-slate-700">
              {searchQuery ? t('dashboard.noSearchResults') : t('dashboard.emptyRepertoire')}
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {t('dashboard.emptyHint')}
            </p>
            <button
              onClick={onGoToPublicSongs}
              className="px-4 py-2 rounded-xl bg-[#F26419] text-white font-extrabold text-xs transition-all cursor-pointer inline-flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" /> {t('dashboard.viewPublicSongs')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredRepertoire.map((song) => (
              <div
                key={song.id}
                className="bg-slate-50 border border-slate-200/90 hover:border-orange-300 rounded-xl p-3.5 transition-all group flex flex-col justify-between gap-3 hover:shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3
                      onClick={() => onSelectSong(song)}
                      className="font-black text-sm text-slate-900 group-hover:text-orange-600 transition-colors cursor-pointer truncate"
                    >
                      {song.title}
                    </h3>
                    <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 shrink-0">
                      {t('dashboard.key')} {song.key}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium">{song.artist}</p>

                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    {song.category && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-[#0E7C7B]/10 text-[#0E7C7B]">
                        {song.category}
                      </span>
                    )}
                    {song.difficulty && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {difficultyLabel(t, song.difficulty)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                  <button
                    onClick={() => onSelectSong(song)}
                    className="text-[#F26419] font-extrabold hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" /> {t('dashboard.play')}
                  </button>

                  <button
                    onClick={() => onRemoveFromRepertoire(song.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                    title={t('dashboard.removeFromRepertoire')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
