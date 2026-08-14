/**
 * DEMO do painel admin "Acervo" — renderiza o componente REAL (AdminCatalogStats)
 * com o catálogo real do Supabase, para visualização sem login de admin.
 */
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Song } from '../src/types';
import { AdminCatalogStats } from '../src/components/admin/AdminCatalogStats';
import { fetchSongsFromCloud } from '../src/lib/cloudSync';

const root = createRoot(document.getElementById('root')!);

function Demo() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSongsFromCloud()
      .then((s) => {
        if (!cancelled && s) setSongs(s);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-extrabold border border-rose-200 uppercase tracking-wider">
            Demo do painel admin
          </span>
          <span className="text-xs text-slate-400 font-medium">
            Admin → Acervo — componente real, dados reais do Supabase
          </span>
          {loading && (
            <span className="text-[10px] text-slate-400 font-bold animate-pulse">
              carregando catálogo…
            </span>
          )}
        </div>
        <AdminCatalogStats songs={songs} onSongsChange={setSongs} />
      </div>
    </div>
  );
}

root.render(<Demo />);
