/**
 * Área ADMIN (só iluminatto@gmail.com): importação em massa, scraping por URL/artista e disparo do cron de plataformas.
 */
import React, { useState } from 'react';
import { Song } from '../types';
import { CHORD_PLATFORMS } from '../lib/platforms';
import {
  ShieldCheck,
  Globe,
  Search,
  Loader2,
  AlertCircle,
  Sparkles,
  Link2,
  ListChecks,
  RefreshCw,
  Music,
  ExternalLink,
} from 'lucide-react';
import { findDuplicateSong } from '../utils/chordUtils';
import { getSessionAccessToken } from '../lib/supabase';

/**
 * Headers comuns das chamadas admin: envia o JWT da sessão Supabase para o
 * servidor autorizar pelo e-mail do admin (NUNCA um secret no bundle).
 */
function adminHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getSessionAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Lê a resposta de uma chamada admin e devolve o JSON parseado.
 *
 * A Vercel, quando a serverless function crasha antes do handler (ex.:
 * módulo não resolvido) ou estoura o tempo, devolve uma página de erro em
 * TEXTO PURO ("A server error occurred...") em vez de JSON. Nesses casos o
 * `res.json()` explodiria com "Unexpected token... is not valid JSON" e o
 * usuário não saberia o que aconteceu. Aqui lemos o texto primeiro: se for
 * JSON válido, retornamos os dados; senão, lançamos um erro com o corpo real.
 */
async function readAdminJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Corpo não-JSON (erro da plataforma). Mensagem amigável + corpo real.
    const preview = text.replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(
      `O servidor respondeu sem JSON (HTTP ${res.status}): ${preview || 'resposta vazia'}. Se for "A server error", a função estourou tempo ou crashou — tente de novo ou veja os logs da Vercel.`
    );
  }
  if (!res.ok) {
    throw new Error(data?.error || data?.message || `Falha na requisição (HTTP ${res.status}).`);
  }
  return data as T;
}

interface AdminScraperProps {
  songs: Song[];
  onImportSongs: (songs: Song[]) => void;
}

interface DiscoveredLink {
  url: string;
  title: string;
  artist: string;
}

export const AdminScraper: React.FC<AdminScraperProps> = ({ songs, onImportSongs }) => {
  const [urlInput, setUrlInput] = useState<string>('');
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [links, setLinks] = useState<DiscoveredLink[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scraping, setScraping] = useState<boolean>(false);
  const [scrapeProgress, setScrapeProgress] = useState<{ done: number; total: number } | null>(null);
  const [resultLog, setResultLog] = useState<{ ok: boolean; message: string }[]>([]);
  const [error, setError] = useState<string>('');

  // Cron state
  const [cronRunning, setCronRunning] = useState<boolean>(false);
  const [cronResult, setCronResult] = useState<string>('');
  // Modo ATUALIZAÇÃO: re-scrapeia e renova o que JÁ EXISTE no acervo
  // (conteúdo, dificuldade, tom, categoria, SEO) + importa as variações
  // simplificadas novas. Sem ele, o cron só adiciona músicas novas.
  const [cronUpdateExisting, setCronUpdateExisting] = useState<boolean>(false);

  const handleDiscover = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setError('');
    setLinks([]);
    setSelected(new Set());
    setResultLog([]);
    setDiscovering(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ discover: url }),
      });
      const data = await readAdminJson<{ links?: DiscoveredLink[] }>(res);
      if (!data) throw new Error('Falha na descoberta.');
      setLinks(data.links || []);
      setSelected(new Set((data.links || []).map((l: DiscoveredLink) => l.url)));
    } catch (e: any) {
      setError(e?.message || 'Erro ao descobrir músicas. Verifique a URL (CifraClub costuma funcionar).');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === links.length) return new Set();
      return new Set(links.map((l) => l.url));
    });
  };

  const toggleOne = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleScrapeSelected = async () => {
    const urls = links.filter((l) => selected.has(l.url)).map((l) => l.url);
    if (!urls.length) return;
    setScraping(true);
    setResultLog([]);
    const imported: Song[] = [];
    let duplicatesSkipped = 0;
    const BATCH = 4;

    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      setScrapeProgress({ done: Math.min(i + BATCH, urls.length), total: urls.length });
      try {
        const res = await fetch('/api/scrape', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ songs: batch }),
        });
        const data = await readAdminJson<{ results?: any[] }>(res);
        if (!data) throw new Error('Falha no scrape.');
        for (const r of data.results || []) {
          if (r.song) {
            // Dedupe no ato de adicionar: se já existe no acervo, não duplica
            const alreadyExists = findDuplicateSong(r.song.title, r.song.artist, songs);
            if (alreadyExists) {
              duplicatesSkipped++;
              setResultLog((prev) => [
                ...prev,
                { ok: false, message: `⏭ ${r.song.title} — ${r.song.artist} (já existe no acervo)` },
              ]);
              continue;
            }
            imported.push(r.song as Song);
            setResultLog((prev) => [...prev, { ok: true, message: `✓ ${r.song.title} — ${r.song.artist}` }]);
          } else {
            setResultLog((prev) => [...prev, { ok: false, message: `✗ ${r.error || 'Erro ao processar'}` }]);
          }
        }
      } catch (e: any) {
        setResultLog((prev) => [...prev, { ok: false, message: `✗ Lote ${i / BATCH + 1} — ${e?.message}` }]);
      }
    }

    setScrapeProgress(null);
    setScraping(false);

    if (imported.length > 0) {
      onImportSongs(imported);
      setResultLog((prev) => [
        ...prev,
        { ok: true, message: `✅ ${imported.length} música(s) adicionadas ao acervo!` },
      ]);
    }
    if (duplicatesSkipped > 0) {
      setResultLog((prev) => [
        ...prev,
        { ok: false, message: `⏭ ${duplicatesSkipped} duplicada(s) ignorada(s) — nada foi sobrescrito.` },
      ]);
    }
  };

  const handleRunCron = async (platformId?: string, artistUrl?: string) => {
    setCronRunning(true);
    setCronResult('');
    try {
      const res = await fetch('/api/scrape-platforms', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(
          platformId
            ? { platformId, artistUrl, fast: true, updateExisting: cronUpdateExisting }
            : { fast: true, updateExisting: cronUpdateExisting }
        ),
      });
      const data = await readAdminJson<{
        results?: { artistUrl: string; imported: number; updated?: number; duplicates: number; errors: number }[];
        totalImported?: number;
        totalUpdated?: number;
        totalDuplicates?: number;
        totalErrors?: number;
      }>(res);
      if (!data) throw new Error('Falha no cron.');
      const lines = (data.results || []).map(
        (r: any) =>
          `${r.artistUrl.split('/').filter(Boolean).pop()} → +${r.imported} novas, ${r.updated ?? 0} atualizadas, ${r.duplicates} dup, ${r.errors} err`
      );
      setCronResult(
        `Cron executado: ${data.totalImported} nova(s), ${data.totalUpdated ?? 0} atualizada(s), ${data.totalDuplicates} duplicada(s), ${data.totalErrors} erro(s).\n` +
          lines.join('\n')
      );
    } catch (e: any) {
      setCronResult(`Erro: ${e?.message}`);
    } finally {
      setCronRunning(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Área do Administrador</h1>
            <p className="text-xs text-slate-500 font-medium">
              Visível apenas para o proprietário (iluminatto@gmail.com) — importação em massa e cron de plataformas.
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-extrabold border border-rose-200 uppercase tracking-wider self-start">
          🔒 Restrito
        </span>
      </div>

      {/* ── Importação de um site de cifras ─────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Globe className="w-5 h-5 text-[#0E7C7B]" />
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            Importar de um Site de Cifras
          </h2>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Cole a URL da página de um <strong>artista</strong> (ex.:{' '}
          <code className="text-[#0E7C7B] font-mono">https://www.cifraclub.com.br/alceu-valenca/</code>) ou de uma{' '}
          <strong>música</strong>. O sistema descobre as cifras, converte para o formato do app (acordes [C], tom,
          dificuldade) e gera o SEO automaticamente.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
              placeholder="https://www.cifraclub.com.br/artista/"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
            />
          </div>
          <button
            onClick={handleDiscover}
            disabled={discovering || !urlInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#0E7C7B]/20"
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {discovering ? 'Descobrindo...' : 'Descobrir Músicas'}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-600">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Lista de links descobertos */}
        {links.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-[#F26419]" /> {links.length} música(s) encontrada(s)
              </span>
              <button
                onClick={toggleAll}
                className="text-[10px] text-[#0E7C7B] font-bold hover:underline cursor-pointer"
              >
                {selected.size === links.length ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>

            <div className="max-h-[340px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {links.map((link) => {
                const isSelected = selected.has(link.url);
                const duplicate = findDuplicateSong(link.title, link.artist, songs);
                return (
                  <label
                    key={link.url}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-slate-50 ${
                      isSelected ? 'bg-[#0E7C7B]/5' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(link.url)}
                      className="w-4 h-4 accent-[#0E7C7B] shrink-0 cursor-pointer"
                    />
                    <Music className="w-4 h-4 text-[#F26419] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{link.title}</p>
                      <p className="text-[10px] text-slate-400 truncate">{link.artist}</p>
                    </div>
                    {duplicate && (
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-extrabold border border-amber-200 shrink-0">
                        JÁ EXISTE
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <button
              onClick={handleScrapeSelected}
              disabled={scraping || selected.size === 0}
              className="w-full py-3 rounded-xl bg-[#F26419] hover:bg-[#D9530D] disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg shadow-[#F26419]/25"
            >
              {scraping ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                  {scrapeProgress && ` (${scrapeProgress.done}/${scrapeProgress.total})`}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Importar {selected.size} Música(s) Selecionada(s)
                </>
              )}
            </button>
          </div>
        )}

        {/* Log de resultados */}
        {resultLog.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 max-h-[260px] overflow-y-auto space-y-1 font-mono">
            {resultLog.map((r, i) => (
              <p
                key={i}
                className={`text-[10px] leading-relaxed ${
                  r.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {r.message}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── Cron de Plataformas ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-[#F26419]" />
            <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
              Cron de Plataformas de Cifras
            </h2>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold uppercase tracking-wider">
            Diário • 09:00 (UTC)
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          O cron roda automaticamente 1x/dia na Vercel, com <strong>rotação diária de artistas</strong> (cada dia varre
          um subconjunto, cobrindo todos ao longo da semana). Músicas novas são adicionadas ao acervo com detecção de
          cifra e SEO automáticos. Plataformas com anti-bot (Ultimate-Guitar, E-chords) ficam desligadas por padrão.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CHORD_PLATFORMS.map((platform) => (
            <div
              key={platform.id}
              className={`border rounded-xl p-3.5 space-y-2 ${
                platform.enabled ? 'border-slate-200 bg-slate-50/60' : 'border-slate-100 bg-slate-50/40 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Globe className={`w-3.5 h-3.5 ${platform.enabled ? 'text-[#0E7C7B]' : 'text-slate-400'}`} />
                  {platform.name}
                </span>
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider border ${
                    platform.enabled
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  {platform.enabled ? `Ativa • ${platform.artistPages.length} artistas` : 'Desligada (anti-bot)'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {platform.region === 'BR' ? '🇧🇷 Nacional' : '🌎 Internacional'} • {platform.limitPerArtist} músicas/artista
              </p>
              {platform.enabled && (
                <button
                  onClick={() => handleRunCron(platform.id)}
                  disabled={cronRunning}
                  className="text-[10px] px-3 py-1.5 rounded-lg bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-50 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {cronRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Rodar agora
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleRunCron()}
            disabled={cronRunning}
            className="px-5 py-2.5 rounded-xl bg-[#1D2D44] hover:bg-[#0F2537] disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 transition-colors cursor-pointer"
          >
            {cronRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {cronRunning ? 'Executando cron...' : 'Executar Cron Completo (rotacionado)'}
          </button>
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors select-none ${
              cronUpdateExisting
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
            }`}
            title="Re-scrapeia o que já existe no acervo: renova conteúdo, dificuldade, tom, categoria e SEO; também importa as variações Simplificadas novas. Preserva ids/votos/playlists."
          >
            <input
              type="checkbox"
              checked={cronUpdateExisting}
              onChange={(e) => setCronUpdateExisting(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
            />
            <span className="text-[11px] font-extrabold flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Atualizar o que já temos
            </span>
          </label>
          <a
            href="https://vercel.com/docs/cron-jobs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#0E7C7B] font-bold hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Sobre os crons da Vercel
          </a>
        </div>

        {cronResult && (
          <pre className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-[10px] text-emerald-300 font-mono whitespace-pre-wrap">
            {cronResult}
          </pre>
        )}
      </div>

      {/* Aviso legal */}
      <div className="flex items-start gap-2 text-[10px] text-slate-400 leading-relaxed">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Use com moderação e respeite os sites de origem (delay entre requisições já configurado). Verifique os direitos
          autorais das cifras/letras antes de publicar conteúdo protegido. O acervo é público e 100% gratuito.
        </span>
      </div>
    </div>
  );
};
