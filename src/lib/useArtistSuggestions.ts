/**
 * useArtistSuggestions: artistas que casam com o termo digitado.
 *
 * Usa a RPC search_artists (grupos dedupe por ukm_norm + contagem real de
 * músicas) com o MESMO debounce/last-writer-wins do useSearchSuggestions.
 * É ela que permite "ver TODAS as músicas do artista" a partir da busca —
 * sem ela, o autocomplete só sugere músicas individuais.
 *
 * Devolve [] para termos abaixo de 3 letras e null quando a RPC está
 * indisponível (o Header então esconde a seção ARTISTAS do dropdown).
 */
import { useEffect, useState } from 'react';
import { searchArtistsServer, ArtistSearchResult } from './searchServer';

const DEBOUNCE_MS = 200;
const RPC_LIM = 5;

export interface ArtistSuggestionsState {
  artists: ArtistSearchResult[];
  loading: boolean;
  /** RPC indisponível → a UI esconde a seção de artistas. */
  unavailable: boolean;
}

export function useArtistSuggestions(rawQuery: string): ArtistSuggestionsState {
  const termo = rawQuery.trim();

  const [state, setState] = useState<ArtistSuggestionsState>({
    artists: [],
    loading: false,
    unavailable: false,
  });

  useEffect(() => {
    if (termo.length < 3) {
      setState({ artists: [], loading: false, unavailable: false });
      return;
    }

    let vigente = true;
    setState((s) => (s.loading ? s : { ...s, loading: true }));

    const timer = setTimeout(async () => {
      const res = await searchArtistsServer(termo, RPC_LIM);
      if (!vigente) return;
      setState({
        artists: res ?? [],
        loading: false,
        unavailable: res === null,
      });
    }, DEBOUNCE_MS);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [termo]);

  return state;
}
