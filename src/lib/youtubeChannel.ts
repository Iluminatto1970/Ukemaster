/**
 * Canal do YouTube do UkeMaster Pro — vídeos E shorts mais recentes.
 *
 * Fontes SEM API key:
 * 1. Feed RSS oficial (https://www.youtube.com/feeds/videos.xml?channel_id=…)
 *    — lista TODAS as publicações (vídeos e shorts) com título, data de
 *    publicação e miniatura. É a fonte da ordem "mais recentes primeiro".
 * 2. innertube (API interna pública do site do YouTube) — as abas "Vídeos"
 *    e "Shorts" do canal trazem o número de visualizações de cada item (o
 *    RSS não traz views). Usado para o rank "Mais vistos".
 * 3. Fallback de tipo: se o innertube falhar, um GET em /shorts/<id> (sem
 *    seguir redirect) distingue short (200) de vídeo normal (303 → /watch).
 *
 * O RSS não envia headers CORS, então quem busca é o SERVIDOR
 * (api/youtube-channel-videos.ts / server.ts) e o app consome JSON — assim
 * uma publicação nova aparece no painel automaticamente, sem deploy e sem
 * chave secreta.
 */
export type ChannelVideoKind = 'video' | 'short';

export interface ChannelVideo {
  /** ID do vídeo (11 caracteres). */
  id: string;
  title: string;
  /** URL de destino: /shorts/<id> para shorts, /watch?v=<id> para vídeos. */
  url: string;
  /** URL da miniatura (hqdefault / hq720 do RSS — 16:9, serve nos cards). */
  thumbnail: string;
  /** Data de publicação ISO 8601. */
  publishedAt: string;
  kind: ChannelVideoKind;
  /** Visualizações (null quando o innertube não respondeu). */
  views: number | null;
}

/** ID do canal @ukemasterpro (resolvido da página oficial do canal). */
export const YOUTUBE_CHANNEL_ID = 'UC5XGoOjad_ayfsIIP9Habvg';
export const YOUTUBE_CHANNEL_HANDLE = '@ukemasterpro';
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL_HANDLE}`;
export const YOUTUBE_CHANNEL_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const shortsUrl = (id: string) => `https://www.youtube.com/shorts/${id}`;
const hqThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/**
 * Publicações de SEGURANÇA: se o feed ficar indisponível (rede/YouTube
 * fora), o painel nunca fica vazio — mostra as últimas publicações reais
 * do canal (1 vídeo + 1 short), com os mesmos títulos e dados públicos.
 */
export const FALLBACK_VIDEOS: ChannelVideo[] = [
  {
    id: 'cckKeqLYQUs',
    title: 'O que é o UkemasterPro? | A Nova Era do Ukulele (Portal & Canal)',
    url: watchUrl('cckKeqLYQUs'),
    thumbnail: hqThumb('cckKeqLYQUs'),
    publishedAt: '2026-08-12T11:23:06+00:00',
    kind: 'video',
    views: 3,
  },
  {
    id: 'OoVkWmzQcJA',
    title: 'O Que É O UkemasterPro? | A Nova Era do Ukulele (Portal & Canal)',
    url: shortsUrl('OoVkWmzQcJA'),
    thumbnail: hqThumb('OoVkWmzQcJA'),
    publishedAt: '2026-08-10T09:29:28+00:00',
    kind: 'short',
    views: 12,
  },
];

// ── innertube (sem API key — mesma chamada que o site do YouTube faz) ────
const INNERTUBE_BROWSE = 'https://www.youtube.com/youtubei/v1/browse';
/** Chave pública embutida no site do YouTube (web client) — sem segredo. */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
/**
 * Params das abas do canal. A aba de Shorts mudou em 2025 (o antigo
 * `EgZzaG9ydHM=` foi descontinuado); estes são os params atuais extraídos
 * da página real do canal.
 */
const TAB_VIDEOS = 'EgZ2aWRlb3PyBgQKAjoA';
const TAB_SHORTS = 'EgZzaG9ydHPyBgUKA5oBAA==';

/** Decodifica as entidades HTML básicas que o RSS usa (&amp;, &lt;...). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extrai os vídeos do XML do feed RSS do YouTube (mais recente primeiro).
 * O feed inclui vídeos E shorts; o tipo (kind) e as views vêm do
 * enriquecimento (innertube) — aqui ficam os dados básicos.
 */
export function parseYouTubeFeed(xml: string): Omit<ChannelVideo, 'url' | 'kind' | 'views'>[] {
  const entries = xml.split(/<entry>/).slice(1);
  const videos: Omit<ChannelVideo, 'url' | 'kind' | 'views'>[] = [];
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<media:title>([^<]*)<\/media:title>/)?.[1];
    const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1];
    if (!id || !title) continue;
    videos.push({
      id,
      title: decodeXmlEntities(title),
      thumbnail: thumbnail || hqThumb(id),
      publishedAt: publishedAt || new Date().toISOString(),
    });
  }
  // Garante ordem: mais recente primeiro (o feed já vem assim, mas não custa)
  return videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/**
 * Converte o texto de visualizações do YouTube ("12 visualizações",
 * "1,2 mil visualizações", "2,5 mi visualizações"…) em número. Retorna
 * null quando não dá para interpretar.
 */
export function parseViewCountText(text: string | undefined | null): number | null {
  if (!text) return null;
  // Remove separadores de milhar e normaliza a vírgula decimal.
  const cleaned = text.replace(/\./g, '').replace(/,/g, '.').trim();
  // Só aceita texto que COMEÇA com o número ("há 9 horas" não passa).
  const m = cleaned.match(/^([\d.]+)\s*([a-zà-úä-üçñ]+)?/i);
  if (!m || !m[1]) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('tril') || unit.startsWith('tri')) n *= 1e12;
  else if (unit.startsWith('bilh') || unit.startsWith('bi')) n *= 1e9;
  else if (unit.startsWith('milh')) n *= 1e6;
  else if (unit.startsWith('mil')) n *= 1e3;
  else if (unit.startsWith('mi')) n *= 1e6;
  return Math.round(n);
}

/** Percorre o JSON do innertube chamando cb para cada objeto. */
function walkObjects(node: unknown, cb: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const v of node) walkObjects(v, cb);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    cb(obj);
    for (const v of Object.values(obj)) walkObjects(v, cb);
  }
}

/** Lê um caminho pontilhado dentro de um objeto JSON (tolerante a nulos). */
function path(obj: Record<string, unknown> | undefined, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Busca UMA aba do canal no innertube e devolve { id → { kind, views } }.
 * Aceita os dois layouts de card (lockupViewModel para vídeos e
 * shortsLockupViewModel para shorts).
 */
async function fetchInnertubeTab(
  params: string
): Promise<Record<string, { kind: ChannelVideoKind; views: number | null }>> {
  const res = await fetch(`${INNERTUBE_BROWSE}?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: {
        client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'pt', gl: 'BR' },
      },
      browseId: YOUTUBE_CHANNEL_ID,
      params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`innertube respondeu HTTP ${res.status}.`);
  const data: unknown = await res.json();

  const map: Record<string, { kind: ChannelVideoKind; views: number | null }> = {};
  walkObjects(data, (obj) => {
    // Vídeos: lockupViewModel
    const lockup = obj['lockupViewModel'] as Record<string, unknown> | undefined;
    if (lockup) {
      const id = lockup['contentId'] as string | undefined;
      if (!id) return;
      const meta = lockup['metadata'] as Record<string, unknown> | undefined;
      const rows = path(meta ?? {}, 'lockupMetadataViewModel.metadata.contentMetadataViewModel.metadataRows') as
        | unknown[]
        | undefined;
      const firstPart = path(rows?.[0] as Record<string, unknown> | undefined, 'metadataParts.0.text.content');
      const contentType = String(lockup['contentType'] || '');
      map[id] = {
        kind: contentType.includes('SHORTS') ? 'short' : 'video',
        views: parseViewCountText(typeof firstPart === 'string' ? firstPart : undefined),
      };
    }
    // Shorts: shortsLockupViewModel
    const shorts = obj['shortsLockupViewModel'] as Record<string, unknown> | undefined;
    if (shorts) {
      const entityId = String(shorts['entityId'] || '');
      const id = entityId.match(/shorts-shelf-item-([\w-]{11})/)?.[1];
      if (!id) return;
      const overlay = shorts['overlayMetadata'] as Record<string, unknown> | undefined;
      const viewsText = path(overlay ?? {}, 'secondaryText.content');
      map[id] = {
        kind: 'short',
        views: parseViewCountText(typeof viewsText === 'string' ? viewsText : undefined),
      };
    }
  });
  return map;
}

/**
 * Distingue short de vídeo consultando /shorts/<id> SEM seguir redirect:
 * short responde 200, vídeo normal responde 303 → /watch?v=<id>. Fallback
 * usado quando o innertube não respondeu.
 */
async function detectKind(id: string): Promise<ChannelVideoKind> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${id}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(6000),
    });
    return res.status >= 300 ? 'video' : 'short';
  } catch {
    return 'video';
  }
}

/**
 * Busca as publicações mais recentes do canal (vídeos + shorts, mais
 * recentes primeiro) enriquecidas com tipo e visualizações. Só roda
 * server-side.
 */
export async function fetchLatestChannelVideos(max = 8): Promise<ChannelVideo[]> {
  const res = await fetch(YOUTUBE_CHANNEL_FEED_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UkeMasterPro/1.0; +https://ukemasterpro.com)',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Feed do YouTube respondeu HTTP ${res.status}.`);
  const raw = parseYouTubeFeed(await res.text());
  if (raw.length === 0) throw new Error('Feed do YouTube veio vazio.');

  // Enriquecimento: tipo (short/vídeo) + visualizações via innertube.
  let info: Record<string, { kind: ChannelVideoKind; views: number | null }> = {};
  try {
    const [videos, shorts] = await Promise.all([
      fetchInnertubeTab(TAB_VIDEOS),
      fetchInnertubeTab(TAB_SHORTS),
    ]);
    info = { ...videos, ...shorts };
  } catch {
    // innertube fora — seguimos sem views; tipo cai no fallback por redirect
  }

  const videos: ChannelVideo[] = [];
  for (const item of raw) {
    const known = info[item.id];
    const kind = known?.kind ?? (await detectKind(item.id));
    videos.push({
      ...item,
      url: kind === 'short' ? shortsUrl(item.id) : watchUrl(item.id),
      kind,
      views: known?.views ?? null,
    });
  }
  return videos
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, max);
}
