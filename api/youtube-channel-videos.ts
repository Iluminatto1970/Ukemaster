/**
 * Endpoint PÚBLICO — GET /api/youtube-channel-videos
 * Publicações mais recentes do canal do UkeMaster Pro no YouTube — vídeos
 * E shorts — lidas do feed RSS oficial + innertube para visualizações
 * (tudo sem API key). Cache em memória (5 min) para não bater no YouTube a
 * cada visita; uma publicação nova aparece no painel em até ~5 min depois
 * de publicada, sem deploy.
 *
 * Cada item traz `kind: 'video' | 'short'` (a URL já aponta para /shorts/
 * ou /watch) e `views` (null se o innertube não respondeu). Se o feed
 * estiver indisponível, devolve as publicações de segurança (fallback)
 * para o painel nunca ficar vazio.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  fetchLatestChannelVideos,
  FALLBACK_VIDEOS,
  YOUTUBE_CHANNEL_ID,
  YOUTUBE_CHANNEL_HANDLE,
  YOUTUBE_CHANNEL_URL,
} from '../src/lib/youtubeChannel.js';

let cache: { videos: unknown[]; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') {
    return send(res, 405, { error: 'Use GET.' });
  }

  const channel = {
    id: YOUTUBE_CHANNEL_ID,
    handle: YOUTUBE_CHANNEL_HANDLE,
    url: YOUTUBE_CHANNEL_URL,
  };

  try {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return send(res, 200, {
        channel,
        videos: cache.videos,
        source: 'cache',
        fetchedAt: new Date(cache.at).toISOString(),
      });
    }
    const videos = await fetchLatestChannelVideos();
    cache = { videos, at: Date.now() };
    return send(res, 200, {
      channel,
      videos,
      source: 'live',
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    // Feed indisponível — painel continua com o vídeo de segurança.
    return send(res, 200, {
      channel,
      videos: FALLBACK_VIDEOS,
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
    });
  }
}
