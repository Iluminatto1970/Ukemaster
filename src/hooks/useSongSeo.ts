import { useEffect, useMemo } from 'react';
import { generateSongSeo, updateDocumentMetaTags, SongSeoData, GeneratedSeoResult } from '../utils/seoUtils';

export interface UseSongSeoOptions extends SongSeoData {
  autoUpdateHead?: boolean; // When true, automatically updates page title and meta tags in <head>
}

/**
 * React hook that automatically generates SEO Title, Meta Description, Hashtags, and Keywords
 * based on 'title' and 'artist' (and optional song metadata) whenever a song is added, edited, or viewed.
 */
export function useSongSeo(options: UseSongSeoOptions): GeneratedSeoResult {
  const {
    title,
    artist,
    key,
    difficulty,
    chords,
    strummingPattern,
    category,
    autoUpdateHead = false,
  } = options;

  // Memoized SEO generation calculated whenever title or artist or other attributes change
  const seoResult = useMemo(() => {
    return generateSongSeo({
      title,
      artist,
      key,
      difficulty,
      chords,
      strummingPattern,
      category,
    });
  }, [title, artist, key, difficulty, chords, strummingPattern, category]);

  // Dynamically update document head metatags (title, meta description, og tags, twitter cards)
  useEffect(() => {
    if (autoUpdateHead) {
      updateDocumentMetaTags(seoResult);

      return () => {
        // Reset to default UkeMaster tags when unmounted
        updateDocumentMetaTags({});
      };
    }
  }, [autoUpdateHead, seoResult]);

  return seoResult;
}
