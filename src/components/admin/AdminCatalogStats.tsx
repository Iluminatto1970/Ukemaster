/**
 * Área ADMIN — Acervo.
 *
 * Contagem de músicas EM TEMPO REAL (polling de 30s direto no Supabase via
 * PostgREST `Prefer: count=exact` — 1 requisição leve, NÃO passa pela Vercel)
 * + histórico de crescimento do acervo por dia, calculado no cliente a partir
 * do catálogo já carregado no app (campo created_at de cada música) — os
 * gráficos não custam nenhuma chamada extra.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Database,
  RefreshCw,
  Loader2,
  TrendingUp,
  CalendarDays,
  Layers,
} from 'lucide-react';
import { Song } from '../../types';
import { getSupabase } from '../../lib/supabase';
import { fetchSongsFromCloud } from '../../lib/cloudSync';

interface AdminCatalogStatsProps {
  songs: Song[];
  onSongsChange: React.Dispatch<React.SetStateAction<Song[]>>;
}

/** Contagem EXATA de músicas no banco (header content-range do PostgREST). */
async function fetchLiveCount(): Promise<number | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const res = await fetch(`${sb.url}/rest/v1/songs?select=id&limit=1`, {
      headers: {
        apikey: sb.anonKey,
        Authorization: `Bearer ${sb.anonKey}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) return null;
    const range = res.headers.get('content-range');
    const m = range ? range.match(/\/(\d+)$/) : null;
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;

const LANG_LABELS: Record<string, string> = {
  pt: 'Português',
  en: 'Inglês',
  ja: 'Japonês',
  de: 'Alemão',
  es: 'Espanhol',
  fr: 'Francês',
  it: 'Italiano',
  multi: 'Multi-idioma',
};

export const AdminCatalogStats: React.FC<AdminCatalogStatsProps> = ({ songs, onSongsChange }) => {
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Contagem em tempo real (polling de 30s) ───────────────────────────
  const refreshCount = useCallback(async () => {
    const n = await fetchLiveCount();
    if (n != null) {
      setLiveCount(n);
      setLastSync(new Date());
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 30_000);
    return () => clearInterval(id);
  }, [refreshCount]);

  // ── Atualizar tudo (contagem + catálogo em memória) ───────────────────
  const handleRefreshAll = useCallback(async () => {
    setRefreshing(true);
    await refreshCount();
    try {
      const fresh = await fetchSongsFromCloud();
      if (fresh && fresh.length > 0) onSongsChange(fresh);
    } catch {
      /* mantém o atual */
    }
    setRefreshing(false);
  }, [onSongsChange, refreshCount]);

  // ── Distribuição por dia (a partir do created_at do catálogo) ─────────
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of songs) {
      const t = s.createdAt ? new Date(s.createdAt).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      const k = dayKey(new Date(t));
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [songs]);

  const last30 = useMemo(() => {
    const days: { key: string; label: string; added: number; cumulative: number }[] = [];
    let cumulative = 0;
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const k = dayKey(d);
      const added = byDay.get(k) || 0;
      cumulative += added;
      days.push({
        key: k,
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        added,
        cumulative,
      });
    }
    return days;
  }, [byDay]);

  const cumulative60 = useMemo(() => {
    const points: { x: number; y: number; label: string; total: number }[] = [];
    let cumulative = 0;
    const today = new Date();
    const max = 58; // linhas de 60 dias — o acumulado achataria com 16k no topo
    for (let i = max; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      cumulative += byDay.get(dayKey(d)) || 0;
      points.push({
        x: (max - i) / max,
        y: cumulative,
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        total: cumulative,
      });
    }
    return points;
  }, [byDay]);

  const todayAdded = last30[last30.length - 1]?.added || 0;
  const weekAdded = last30.slice(-7).reduce((acc, d) => acc + d.added, 0);
  const monthAdded = last30.reduce((acc, d) => acc + d.added, 0);

  const topDays = useMemo(
    () =>
      [...byDay.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => ({
          date: new Date(`${k}T12:00:00`).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          count: v,
        })),
    [byDay]
  );

  // ── Distribuições (categoria / dificuldade / idioma) ──────────────────
  const breakdown = useMemo(() => {
    const cat = new Map<string, number>();
    const diff = new Map<string, number>();
    const lang = new Map<string, number>();
    for (const s of songs) {
      cat.set(s.category || 'Sem categoria', (cat.get(s.category || 'Sem categoria') || 0) + 1);
      diff.set(s.difficulty || 'Sem nível', (diff.get(s.difficulty || 'Sem nível') || 0) + 1);
      lang.set(s.lang || 'sem idioma', (lang.get(s.lang || 'sem idioma') || 0) + 1);
    }
    const sorted = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      category: sorted(cat).slice(0, 8),
      difficulty: sorted(diff),
      lang: sorted(lang).slice(0, 6),
    };
  }, [songs]);

  const latest = useMemo(
    () =>
      [...songs]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 8),
    [songs]
  );

  const maxBar = Math.max(...last30.map((d) => d.added), 1);
  const maxCat = Math.max(...breakdown.category.map(([, v]) => v), 1);
  const maxDiff = Math.max(...breakdown.difficulty.map(([, v]) => v), 1);
  const maxLang = Math.max(...breakdown.lang.map(([, v]) => v), 1);

  // Polilinha do acumulado (60 dias) — escala no maior total.
  const lineMax = Math.max(...cumulative60.map((p) => p.y), 1);
  const W = 640;
  const H = 140;
  const pts = cumulative60
    .map((p) => `${(p.x * W).toFixed(1)},${(H - 10 - (p.y / lineMax) * (H - 24)).toFixed(1)}`)
    .join(' ');

  const statCards = [
    {
      label: 'No banco (tempo real)',
      value: liveCount,
      icon: <Database className="w-5 h-5" />,
      color: 'bg-[#0E7C7B]/10 text-[#0E7C7B] border-[#0E7C7B]/25',
      live: true,
    },
    {
      label: 'No app (carregado)',
      value: songs.length,
      icon: <Layers className="w-5 h-5" />,
      color: 'bg-indigo-50 text-indigo-600 border-indigo-200',
      live: false,
    },
    {
      label: 'Adicionadas hoje',
      value: todayAdded,
      icon: <CalendarDays className="w-5 h-5" />,
      color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      live: false,
    },
    {
      label: 'Últimos 7 dias',
      value: weekAdded,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-orange-50 text-[#F26419] border-orange-200',
      live: false,
    },
  ];

  return (
    <div className="space-y-5 text-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Acervo do Site</h1>
            <p className="text-xs text-slate-500 font-medium">
              Contagem em tempo real + crescimento do catálogo por dia.
            </p>
          </div>
        </div>
        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[#0E7C7B] text-white text-xs font-extrabold px-3.5 py-2 hover:bg-[#0a6564] transition-colors disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Atualizando...' : 'Atualizar dados'}
        </button>
      </div>

      {/* Cards de métricas */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className={`rounded-2xl border p-4 ${c.color}`}>
            <div className="flex items-center gap-2">
              {c.icon}
              {c.live && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
              )}
            </div>
            <p className="mt-3 text-2xl font-black leading-none">
              {c.value == null ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              ) : (
                c.value.toLocaleString('pt-BR')
              )}
            </p>
            <p className="mt-1.5 text-[11px] font-bold text-slate-600">{c.label}</p>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-slate-400 font-medium -mt-2">
        {lastSync
          ? `Última verificação no banco: ${lastSync.toLocaleTimeString('pt-BR')} (atualiza a cada 30s)`
          : 'Verificando o banco…'}
      </p>

      {/* Gráfico: adicionadas por dia (30 dias) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            📈 Adicionadas por dia — últimos 30 dias
          </h2>
          <span className="text-[10px] font-black text-[#0E7C7B]">
            {monthAdded.toLocaleString('pt-BR')} no mês
          </span>
        </div>
        <div className="mt-4 flex items-end gap-[3px] h-36">
          {last30.map((d) => (
            <div
              key={d.key}
              title={`${d.label}: ${d.added} adicionada(s)`}
              className="flex-1 bg-[#0E7C7B]/70 hover:bg-[#0E7C7B] rounded-t-sm transition-colors min-w-0"
              style={{ height: `${Math.max((d.added / maxBar) * 100, d.added > 0 ? 4 : 1)}%` }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-slate-400 font-bold">
          <span>{last30[0]?.label}</span>
          <span>{last30[14]?.label}</span>
          <span>{last30[29]?.label}</span>
        </div>
      </div>

      {/* Linha: acumulado (60 dias) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            🗓️ Crescimento acumulado — últimos 60 dias
          </h2>
          <span className="text-[10px] font-black text-[#0E7C7B]">
            {cumulative60[cumulative60.length - 1]?.total.toLocaleString('pt-BR') || '—'} total
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full h-36" preserveAspectRatio="none">
          <defs>
            <linearGradient id="catArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0E7C7B" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0E7C7B" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={(H - 10 - f * (H - 24)).toFixed(1)}
              y2={(H - 10 - f * (H - 24)).toFixed(1)}
              stroke="#E2E8F0"
              strokeWidth="1"
            />
          ))}
          <polygon
            points={`0,${H - 8} ${pts} ${W},${H - 8}`}
            fill="url(#catArea)"
          />
          <polyline
            points={pts}
            fill="none"
            stroke="#0E7C7B"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={W}
            cy={(H - 10 - (lineMax / lineMax) * (H - 24)).toFixed(1)}
            r="4"
            fill="#F26419"
          />
        </svg>
        <div className="mt-1 flex justify-between text-[9px] text-slate-400 font-bold">
          <span>{cumulative60[0]?.label}</span>
          <span>{cumulative60[cumulative60.length - 1]?.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Maiores dias de importação */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider border-b border-slate-100 pb-3">
            🚀 Maiores dias de importação
          </h2>
          <div className="mt-2 divide-y divide-slate-100">
            {topDays.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-400 font-bold">
                Sem dados ainda.
              </p>
            )}
            {topDays.map((d, i) => (
              <div key={d.date} className="flex items-center gap-3 py-2.5">
                <span className="w-6 text-[11px] font-black text-slate-400">{i + 1}º</span>
                <span className="flex-1 text-xs font-extrabold text-slate-800">{d.date}</span>
                <span className="text-xs font-black text-[#0E7C7B]">
                  +{d.count.toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Categoria / Dificuldade / Idioma */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider border-b border-slate-100 pb-3">
            🎸 Por categoria
          </h2>
          <div className="mt-3 space-y-2.5">
            {breakdown.category.map(([k, v]) => (
              <div key={k}>
                <div className="flex justify-between text-[11px] font-extrabold text-slate-700 mb-1">
                  <span className="truncate">{k}</span>
                  <span className="text-slate-400">{v.toLocaleString('pt-BR')}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#0E7C7B]"
                    style={{ width: `${(v / maxCat) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider border-b border-slate-100 pb-3">
            🎚️ Nível e idioma
          </h2>
          <div className="mt-3 space-y-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                Dificuldade
              </p>
              <div className="space-y-2.5">
                {breakdown.difficulty.map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[11px] font-extrabold text-slate-700 mb-1">
                      <span className="truncate">{k}</span>
                      <span className="text-slate-400">{v.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${(v / maxDiff) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                Idioma
              </p>
              <div className="space-y-2.5">
                {breakdown.lang.map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[11px] font-extrabold text-slate-700 mb-1">
                      <span className="truncate">{LANG_LABELS[k] || k}</span>
                      <span className="text-slate-400">{v.toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400"
                        style={{ width: `${(v / maxLang) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Últimas importadas */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            🎵 Últimas músicas importadas
          </h2>
        </div>
        <div className="mt-2 divide-y divide-slate-100">
          {latest.length === 0 && (
            <p className="py-6 text-center text-xs text-slate-400 font-bold">
              Nenhuma música ainda.
            </p>
          )}
          {latest.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold text-slate-900 truncate">{s.title}</p>
                <p className="text-[10px] text-slate-400 truncate">
                  {s.artist} · {s.category || 'Sem categoria'}
                </p>
              </div>
              <span className="text-[10px] text-slate-400 font-medium shrink-0">
                {s.createdAt ? new Date(s.createdAt).toLocaleString('pt-BR') : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
