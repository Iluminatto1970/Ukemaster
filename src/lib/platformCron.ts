/**
 * Cron de plataformas de cifras — varre as plataformas ATÉ sincronizar tudo.
 *
 * Como funciona (cursor + histórico persistente no Supabase):
 *  - Cada execução processa UM OU MAIS artistas, respeitando um orçamento
 *    de tempo (um artista gigante pode ficar incompleto numa rodada).
 *  - ROTAÇÃO JUSTA: o progresso (índice do artista atual) é salvo na tabela
 *    `scrape_state` e SEMPRE avança para o próximo artista, mesmo em timeout
 *    — assim nenhum catálogo gigante monopoliza a fila. Na próxima execução
 *    continua do próximo artista; os incompletos são retomados quando a
 *    rotação completa o ciclo (o dedupe impede duplicatas).
 *  - Quando chega ao fim da lista de artistas, volta ao início (recomeça a
 *    varredura para pegar músicas novas publicadas no site de origem).
 *  - ANTI-DUPLICIDADE (3 camadas):
 *      1. `cron_imports` — histórico persistente de músicas já importadas
 *         (chave normalizada "titulo|artista"). A mesma música NUNCA é
 *         importada duas vezes, mesmo se a nuvem estiver indisponível.
 *      2. Acervo atual da tabela `songs` (título+artista já existentes).
 *      3. Dedupe em memória dentro da mesma rodada (scraper).
 *  - `cron_log` — histórico das execuções (o que cada rodada importou,
 *    pulou e errou, com duração).
 *  - Resultado: o acervo fica 100% alinhado com o site, sem duplicatas.
 */

import { scrapeArtistPage, isJunkArtistName, isJunkTitle } from './scraper';
import { CHORD_PLATFORMS } from './platforms';
import type { Song } from '../types';

export interface PlatformCronOptions {
  /** Roda uma plataforma/artista específico (uso manual/admin). */
  platformId?: string;
  artistUrl?: string;
  limit?: number;
  /** Pula delays (modo manual rápido). */
  fast?: boolean;
  /** Força recomeçar do início da fila. */
  reset?: boolean;
  /** Orçamento de tempo em ms (padrão 50s — dentro do limite Vercel 60s). */
  timeBudgetMs?: number;
}

export interface PlatformCronResult {
  ok: boolean;
  ranAt: string;
  message?: string;
  totalImported: number;
  totalDuplicates: number;
  totalErrors: number;
  /** Músicas já presentes no acervo/histórico (artista já sincronizado). */
  totalAlreadyKnown: number;
  artistsProcessed: number;
  cursor: { platformIndex: number; artistIndex: number } | null;
  results: {
    platform: string;
    artistUrl: string;
    imported: number;
    duplicates: number;
    errors: number;
    errorMessage?: string;
  }[];
}

interface ArtistJob {
  platformId: string;
  platformName: string;
  url: string;
  delayMs: number;
}

// ── Mapeamento Song (camelCase) ⇄ linha da tabela songs (snake_case) ────
// A tabela no Supabase usa colunas snake_case (created_at etc.); o frontend
// usa camelCase. O cron reusa o mesmo mapeamento do app (cloudSync.ts) para
// persistir corretamente.
function songToRow(s: Song) {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    key: s.key ?? null,
    tempo: s.tempo ?? null,
    strumming_pattern: s.strummingPattern ?? null,
    youtube_url: s.youtubeUrl ?? null,
    youtube_id: s.youtubeId ?? null,
    content: s.content ?? null,
    simplified_content: s.simplifiedContent ?? null,
    difficulty: s.difficulty ?? null,
    category: s.category ?? null,
    tags: s.tags ?? [],
    seo_description: s.seoDescription ?? null,
    hashtags: s.hashtags ?? [],
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

// ── Acesso Supabase (server-side, sem depender de import.meta.env) ────────
function getSupabaseEnv() {
  const url =
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';
  return { url: url.replace(/\/+$/, ''), key };
}

/**
 * Busca TODAS as linhas de uma tabela (paginação de 1000 em 1000).
 * Retorna [] se a tabela não existir ou a API falhar (degradação graciosa).
 */
async function fetchAllRows(
  url: string,
  key: string,
  table: string,
  columns: string,
  maxRows = 20_000
): Promise<any[]> {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    try {
      const res = await fetch(
        `${url}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=${pageSize}&offset=${offset}`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } }
      );
      if (!res.ok) return rows;
      const page = (await res.json()) as any[];
      rows.push(...page);
      if (page.length < pageSize) break;
    } catch {
      return rows;
    }
  }
  return rows;
}

/**
 * Enriquecimento com vídeo: busca a videoaula no YouTube (Data API v3) para
 * as músicas recém-importadas e grava youtube_id/youtube_url. Opcional — roda
 * SÓ se YOUTUBE_API_KEY estiver no ambiente (senão é no-op, zero custo).
 *
 * Cota: a API gratuita dá ~10.000 unidades/dia; cada busca = 100 unidades.
 * O maxPerRun (padrão 20) limita a ~2.000 unidades por execução. O app roda
 * a cada 30 min, então em 1 dia preenche o acervo novo sem estourar a cota.
 */
async function enrichWithYoutubeVideos(
  url: string,
  key: string,
  songs: Song[],
  maxPerRun = 20
): Promise<void> {
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey || songs.length === 0) return;

  const updates: { id: string; youtube_id: string; youtube_url: string }[] = [];
  let done = 0;
  for (const s of songs) {
    if (done >= maxPerRun) break;
    try {
      const q = encodeURIComponent(`${s.title} ${s.artist} cifra ukulele`);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${q}&key=${encodeURIComponent(ytKey)}`
      );
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      const data = (await res.json()) as { items?: { id?: { videoId?: string } }[] };
      const videoId = data?.items?.[0]?.id?.videoId;
      if (videoId) {
        updates.push({
          id: s.id,
          youtube_id: videoId,
          youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
        });
        done++;
      }
      // Respeita a cota/rate limit do Google
      await new Promise((r) => setTimeout(r, 300));
    } catch {
      // segue sem vídeo — nunca derruba o cron
    }
  }

  if (updates.length > 0) {
    try {
      await fetch(`${url}/rest/v1/songs`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(updates),
      });
    } catch {
      // não derruba o cron
    }
  }
}

/** Upsert em lote com `resolution=merge-duplicates` (idempotente). */
async function upsertRows(url: string, key: string, table: string, rows: any[]): Promise<boolean> {
  if (!rows.length) return true;
  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase upsert em ${table} falhou (${res.status}): ${text.slice(0, 200)}`);
    }
    return true;
  } catch (e) {
    // Tabela pode não existir ainda (schema não executado) — não derruba o cron
    return false;
  }
}

async function fetchExistingSongs(url: string, key: string): Promise<Song[]> {
  const rows = await fetchAllRows(url, key, 'songs', 'id,title,artist');
  return rows as Song[];
}

/** Chaves ("titulo|artista" normalizado) do histórico de importações. */
async function fetchCronImportKeys(url: string, key: string): Promise<Set<string>> {
  const rows = await fetchAllRows(url, key, 'cron_imports', 'song_key');
  return new Set(rows.map((r) => r.song_key as string));
}

async function readCursor(url: string, key: string): Promise<{ platformIndex: number; artistIndex: number }> {
  try {
    const res = await fetch(`${url}/rest/v1/scrape_state?key=eq.platform_cursor&select=value`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return { platformIndex: 0, artistIndex: 0 };
    const rows = (await res.json()) as { value: any }[];
    const v = rows?.[0]?.value;
    if (v && typeof v.platformIndex === 'number' && typeof v.artistIndex === 'number') {
      return { platformIndex: v.platformIndex, artistIndex: v.artistIndex };
    }
  } catch {
    // tabela pode não existir ainda → recomeça
  }
  return { platformIndex: 0, artistIndex: 0 };
}

async function writeCursor(
  url: string,
  key: string,
  cursor: { platformIndex: number; artistIndex: number }
): Promise<void> {
  try {
    await fetch(`${url}/rest/v1/scrape_state`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          key: 'platform_cursor',
          value: cursor,
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  } catch {
    // se falhar, o cron ainda roda — só não persiste o progresso
  }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

const songKey = (s: { title: string; artist: string }) => normalize(`${s.title}|${s.artist}`);

/** Constrói a fila de artistas a partir das plataformas habilitadas. */
function buildArtistQueue(): ArtistJob[] {
  const queue: ArtistJob[] = [];
  for (const platform of CHORD_PLATFORMS) {
    if (!platform.enabled) continue;
    for (const artistPage of platform.artistPages) {
      queue.push({
        platformId: platform.id,
        platformName: platform.name,
        url: artistPage,
        delayMs: platform.delayMs,
      });
    }
  }
  return queue;
}

/** Roda o cron. Retorna um resumo estruturado (nunca lança). */
export async function runPlatformCron(options: PlatformCronOptions = {}): Promise<PlatformCronResult> {
  const ranAt = new Date().toISOString();
  const timeBudgetMs = options.timeBudgetMs ?? 50_000;
  const startedAt = Date.now();

  const result: PlatformCronResult = {
    ok: true,
    ranAt,
    totalImported: 0,
    totalDuplicates: 0,
    totalErrors: 0,
    totalAlreadyKnown: 0,
    artistsProcessed: 0,
    cursor: null,
    results: [],
  };

  const sb = getSupabaseEnv();
  const hasDb = Boolean(sb.url && sb.key);

  // Fila de artistas (todas as plataformas habilitadas)
  const queue = buildArtistQueue();
  if (queue.length === 0) {
    result.message = 'Nenhuma plataforma habilitada no registro.';
    return result;
  }

  // Posição inicial: cursor persistido OU manual (plataforma/artista)
  let cursor = { platformIndex: 0, artistIndex: 0 };
  if (options.reset) {
    cursor = { platformIndex: 0, artistIndex: 0 };
  } else if (options.platformId || options.artistUrl) {
    cursor = { platformIndex: 0, artistIndex: 0 };
  } else if (hasDb) {
    cursor = await readCursor(sb.url, sb.key);
  }
  result.cursor = { ...cursor };

  // Camadas anti-duplicidade: acervo atual + histórico persistente de importações
  const existing = hasDb ? await fetchExistingSongs(sb.url, sb.key) : [];
  const existingKeys = new Set(existing.map(songKey));
  const cronKeys = hasDb ? await fetchCronImportKeys(sb.url, sb.key) : new Set<string>();

  // Modo manual: fila só com o solicitado
  let jobs: ArtistJob[] = [];
  if (options.artistUrl) {
    const platform = queue.find((q) => q.platformId === options.platformId) || queue[0];
    jobs = [{ ...platform, url: options.artistUrl, delayMs: options.fast ? 0 : platform.delayMs }];
  } else if (options.platformId) {
    jobs = queue.filter((q) => q.platformId === options.platformId);
  } else {
    // Modo automático: começa do cursor e gira pela fila inteira
    const startFlat = cursor.platformIndex * 1000 + cursor.artistIndex;
    for (let flat = 0; flat < queue.length; flat++) {
      const idx = (startFlat + flat) % queue.length;
      jobs.push(queue[idx]);
    }
  }

  // Histórico a gravar no final (cron_log) + novas importações (cron_imports)
  const runLogRows: any[] = [];
  const importHistoryRows: any[] = [];

  // Processa até estourar o orçamento de tempo (sempre ao menos 1 artista)
  let wrapped = false;
  let timedOutLast = false;
  for (const item of jobs) {
    if (jobs.length > 1 && Date.now() - startedAt > timeBudgetMs && result.artistsProcessed > 0) {
      break;
    }

    const artistStart = Date.now();
    const entry = {
      platform: item.platformName,
      artistUrl: item.url,
      imported: 0,
      duplicates: 0,
      errors: 0,
    } as {
      platform: string;
      artistUrl: string;
      imported: number;
      duplicates: number;
      errors: number;
      errorMessage?: string;
    };

    try {
      // Processa o artista com timeout educado: se o tempo estiver perto do
      // limite, para NO MEIO do artista sem perder o que já importou (o dedupe
      // pula as já existentes na próxima passada).
      const remainingMs = Math.max(10_000, timeBudgetMs - (Date.now() - startedAt));
      const { songs, errors, duplicates, timedOut } = await scrapeArtistPage(item.url, {
        // Catálogo completo: artistas grandes passam de 300 (Roberto Carlos
        // tem ~617). O timeout educado encerra no meio sem perder progresso.
        limit: 2000,
        delayMs: options.fast ? 0 : item.delayMs,
        timeoutMs: options.fast ? 0 : remainingMs,
      });
      timedOutLast = timedOut;

      entry.duplicates = duplicates;
      entry.errors = errors.length;

      // Dedupe em 3 camadas: histórico de importações + acervo atual.
      // Rede de segurança extra: descarta lixo (artista/título inválido)
      // que porventura tenha escapado do scraper.
      const fresh = songs.filter((s) => {
        if (isJunkArtistName(s.artist) || isJunkTitle(s.title)) return false;
        const k = songKey(s);
        return !cronKeys.has(k) && !existingKeys.has(k);
      });

      if (fresh.length > 0 && hasDb) {
        const upsertOk = await upsertRows(sb.url, sb.key, 'songs', fresh.map(songToRow));
        if (upsertOk) {
          // Vídeo do YouTube (opcional, requer YOUTUBE_API_KEY) — enriquece
          // as novas importações desta rodada sem travar o loop do cron.
          await enrichWithYoutubeVideos(sb.url, sb.key, fresh);
          fresh.forEach((s) => {
            existingKeys.add(songKey(s));
            cronKeys.add(songKey(s));
          });
          entry.imported = fresh.length;

          // Registra no histórico anti-duplicidade (se a tabela existir)
          fresh.forEach((s) => {
            importHistoryRows.push({
              song_key: songKey(s),
              url: item.url,
              platform: item.platformName,
              imported_at: new Date().toISOString(),
            });
          });
        } else {
          entry.errorMessage = 'Falha ao persistir no Supabase (tabela songs ausente?).';
          entry.errors += fresh.length;
        }
      } else if (fresh.length > 0) {
        entry.imported = fresh.length;
        entry.errorMessage = 'Supabase não configurado — músicas detectadas mas não persistidas.';
      } else if (songs.length > 0) {
        // Nada novo: o artista já está 100% sincronizado (no-op saudável)
        result.totalAlreadyKnown += songs.length;
      }

      if (songs.length === 0 && errors.length > 0) {
        entry.errorMessage = errors[0]?.error || entry.errorMessage;
      }
      if (timedOut) {
        entry.errorMessage = 'Tempo esgotado — artista incompleto; será retomado na próxima rotação da fila.';
      }
    } catch (e: any) {
      entry.errorMessage = e?.message || 'Erro desconhecido';
      entry.errors = 1;
    }

    result.results.push(entry);
    result.totalImported += entry.imported;
    result.totalDuplicates += entry.duplicates;
    result.totalErrors += entry.errors;
    result.artistsProcessed++;

    // Linha de log da execução deste artista (histórico do cron)
    runLogRows.push({
      id: `run-${ranAt}-${result.artistsProcessed}`,
      ran_at: new Date().toISOString(),
      platform: item.platformName,
      artist_url: item.url,
      imported: entry.imported,
      duplicates: entry.duplicates,
      errors: entry.errors,
      duration_ms: Date.now() - artistStart,
      message: entry.errorMessage || null,
    });

    // Persiste o progresso (rotação justa): o cursor SEMPRE avança para o
    // próximo artista, mesmo quando o atual estourou o tempo (catálogo
    // gigante). Antes, um artista enorme (ex.: Roberto Carlos ~617 músicas)
    // monopolizava a fila para sempre — todos os artistas seguintes ficavam
    // sem cobertura. Agora cada execução cobre uma fatia de artistas
    // DIFERENTES, e o gigante é retomado incrementalmente quando a rotação
    // voltar a ele (o dedupe por título|artista impede duplicatas).
    if (!options.artistUrl) {
      const flatNow = queue.findIndex((q) => q.url === item.url);
      if (flatNow >= 0) {
        const nextFlat = (flatNow + 1) % queue.length;
        const next = { platformIndex: Math.floor(nextFlat / 1000), artistIndex: nextFlat % 1000 };
        if (nextFlat <= flatNow) wrapped = true; // voltou ao início
        cursor = next;
        result.cursor = { ...next };
        if (hasDb) await writeCursor(sb.url, sb.key, next);
      }
    }

    // Orçamento de tempo: encerra a execução no limite (o cursor já avançou)
    if (timedOutLast) break;
  }

  if (wrapped && result.artistsProcessed > 0) {
    result.message = 'Varredura completa do ciclo atingida — recomeçando do início.';
  } else if (result.artistsProcessed === 0) {
    result.message = 'Nenhum artista processado (orçamento de tempo muito curto).';
  }

  // Grava o histórico (nunca derruba a execução se as tabelas não existirem)
  if (hasDb) {
    if (importHistoryRows.length > 0) {
      await upsertRows(sb.url, sb.key, 'cron_imports', importHistoryRows);
    }
    if (runLogRows.length > 0) {
      await upsertRows(sb.url, sb.key, 'cron_log', runLogRows);
    }
  }

  // ok = o cron cumpriu o papel (progresso real, artista já sincronizado OU
  // zero erros). Erros por link (versões não-cifra, 404) são benignos e não
  // marcam a rodada como falha.
  result.ok =
    result.artistsProcessed > 0 &&
    (result.totalImported > 0 ||
      result.totalAlreadyKnown > 0 ||
      result.totalDuplicates > 0 ||
      result.totalErrors === 0);

  return result;
}
