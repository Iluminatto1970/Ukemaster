/**
 * Canal do YouTube do UkeMaster Pro — vídeos mais recentes do canal.
 *
 * Usa o feed RSS PÚBLICO do YouTube (sem API key) para listar os vídeos do
 * canal em ordem de publicação. O RSS não envia headers CORS, então quem
 * busca é o SERVIDOR (api/youtube-channel-videos.ts / server.ts) e o app
 * consome JSON — assim um vídeo novo aparece no painel automaticamente,
 * sem deploy e sem chave secreta.
 */
export interface ChannelVideo {
  /** ID do vídeo (11 caracteres). */
  id: string;
  title: string;
  url: string;
  /** URL da miniatura (hqdefault). */
  thumbnail: string;
  /** Data de publicação ISO 8601. */
  publishedAt: string;
}

/** ID do canal @ukemasterpro (resolvido da página oficial do canal). */
export const YOUTUBE_CHANNEL_ID = 'UC5XGoOjad_ayfsIIP9Habvg';
export const YOUTUBE_CHANNEL_HANDLE = '@ukemasterpro';
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL_HANDLE}`;
export const YOUTUBE_CHANNEL_FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`;

/**
 * Vídeo de SEGURANÇA: se o feed ficar indisponível (rede/YouTube fora), o
 * painel nunca fica vazio — mostra o vídeo oficial do portal.
 */
export const FALLBACK_VIDEOS: ChannelVideo[] = [
  {
    id: 'cckKeqLYQUs',
    title: 'O que é o UkemasterPro? | A Nova Era do Ukulele (Portal & Canal)',
    url: 'https://www.youtube.com/watch?v=cckKeqLYQUs',
    thumbnail: 'https://i.ytimg.com/vi/cckKeqLYQUs/hqdefault.jpg',
    publishedAt: new Date().toISOString(),
  },
];

/** Decodifica as entidades HTML básicas que o RSS usa (&amp;, &lt;...). */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extrai os vídeos do XML do feed RSS do YouTube (mais recente primeiro). */
export function parseYouTubeFeed(xml: string): ChannelVideo[] {
  const entries = xml.split(/<entry>/).slice(1);
  const videos: ChannelVideo[] = [];
  for (const entry of entries) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<media:title>([^<]*)<\/media:title>/)?.[1];
    const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    const thumbnail = entry.match(/<media:thumbnail url="([^"]+)"/)?.[1];
    if (!id || !title) continue;
    videos.push({
      id,
      title: decodeXmlEntities(title),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: publishedAt || new Date().toISOString(),
    });
  }
  // Garante ordem: mais recente primeiro (o feed já vem assim, mas não custa)
  return videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/** Busca os vídeos mais recentes do canal no feed RSS (só server-side). */
export async function fetchLatestChannelVideos(max = 6): Promise<ChannelVideo[]> {
  const res = await fetch(YOUTUBE_CHANNEL_FEED_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; UkeMasterPro/1.0; +https://ukemasterpro.com)',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Feed do YouTube respondeu HTTP ${res.status}.`);
  const videos = parseYouTubeFeed(await res.text());
  if (videos.length === 0) throw new Error('Feed do YouTube veio vazio.');
  return videos.slice(0, max);
}
