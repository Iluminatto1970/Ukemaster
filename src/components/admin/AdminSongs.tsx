/**
 * Área ADMIN — Músicas (CRUD).
 * Busca, criação, edição (SongEditor reutilizado) e exclusão de músicas
 * do acervo. A persistência segue o fluxo do App: edição → setSongs (o
 * effect de pushSongsToCloud grava no Supabase); exclusão → deleteSongFromCloud.
 */
import React, { useMemo, useState } from 'react';
import { Music, Search, Loader2, Trash2, Pencil, Plus, ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { Song } from '../../types';
import { SongEditor } from '../SongEditor';
import { deleteSongFromCloud } from '../../lib/cloudSync';

interface AdminSongsProps {
  songs: Song[];
  onSongsChange: React.Dispatch<React.SetStateAction<Song[]>>;
}

const PER_PAGE = 25;

export const AdminSongs: React.FC<AdminSongsProps> = ({ songs, onSongsChange }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Song | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        (s.category || '').toLowerCase().includes(q)
    );
  }, [songs, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  // Ordena a lista pela data (mais recentes primeiro) para a página 1
  const sortedPageRows = useMemo(
    () => [...pageRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    [pageRows]
  );

  const handleSave = (savedSong: Song) => {
    onSongsChange((prev) => {
      const exists = prev.some((s) => s.id === savedSong.id);
      return exists
        ? prev.map((s) => (s.id === savedSong.id ? savedSong : s))
        : [savedSong, ...prev];
    });
    setEditing(null);
    setCreating(false);
  };

  const handleDelete = async (songId: string) => {
    setDeletingId(songId);
    setError(null);
    try {
      await deleteSongFromCloud(songId);
      onSongsChange((prev) => prev.filter((s) => s.id !== songId));
    } catch {
      setError('Falha ao excluir no Supabase — a música voltará no próximo sync.');
      onSongsChange((prev) => prev.filter((s) => s.id !== songId));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Modo editor (criar/editar)
  if (creating || editing) {
    return (
      <div className="space-y-4 text-slate-900">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">
              {creating ? 'Nova Música' : `Editar: ${editing?.title || ''}`}
            </h1>
            <p className="text-xs text-slate-500 font-medium">Editor completo de cifra — salve para publicar no acervo.</p>
          </div>
        </div>
        <SongEditor
          initialSong={editing ?? undefined}
          isAdmin
          onSave={handleSave}
          onCancel={() => {
            setEditing(null);
            setCreating(false);
          }}
          onDelete={(id) => {
            handleDelete(id).then(() => {
              setEditing(null);
              setCreating(false);
            });
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
            <Music className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Músicas do Acervo</h1>
            <p className="text-xs text-slate-500 font-medium">
              {songs.length.toLocaleString('pt-BR')} músicas — crie, edite ou exclua.
            </p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-extrabold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#0E7C7B]/20 self-start"
        >
          <Plus className="w-4 h-4" /> Nova Música
        </button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por título, artista ou categoria..."
          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
        />
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 text-xs font-bold">{error}</div>
      )}

      {/* Lista */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {sortedPageRows.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs font-bold">
            {search ? 'Nenhuma música encontrada para essa busca.' : 'Nenhuma música no acervo.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-black">Música</th>
                  <th className="px-3 py-3 font-black">Tom</th>
                  <th className="px-3 py-3 font-black">Categoria</th>
                  <th className="px-3 py-3 font-black">Nível</th>
                  <th className="px-3 py-3 font-black">Votos</th>
                  <th className="px-3 py-3 font-black text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPageRows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 min-w-0">
                      <p className="font-extrabold text-slate-900 truncate max-w-[280px]">{s.title}</p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[280px]">{s.artist}</p>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-bold whitespace-nowrap">{s.key || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium whitespace-nowrap">{s.category || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium whitespace-nowrap">{s.difficulty || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 font-medium whitespace-nowrap">{s.votes ?? 0}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {confirmDeleteId === s.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(s.id)}
                              disabled={deletingId === s.id}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[10px] font-extrabold transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {deletingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditing(s)}
                              title="Editar música"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#0E7C7B] hover:bg-[#0E7C7B]/10 transition-colors cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(s.id)}
                              title="Excluir música"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] transition-colors cursor-pointer disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span>
            {filtered.length.toLocaleString('pt-BR')} resultados · página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#0E7C7B] transition-colors cursor-pointer disabled:opacity-40"
          >
            Próxima <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
        <Music2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        As edições são salvas no Supabase automaticamente (sync do app). Excluir remove a música do acervo definitivamente.
      </p>
    </div>
  );
};
