/**
 * useSearchSuggestions: autocomplete enquanto o usuário digita.
 *
 * Mesma RPC `search_songs`, porém com limite pequeno (payload mínimo
 * id/title/artist) e debounce curto (200ms — a resposta é só um dropdown).
 *
 * Padrão "last-writer-wins" igual ao useServerSearch: cada tecla reinicia
 * o timer e respostas de termos que já trocaram são descartadas. Termos
 * abaixo de 3 letras não disparam RPC (padrões curtos não geram trigramas
 * e forçariam Seq Scan — ver MIN_SUGGEST_LEN em searchServer.ts).
 *
 * A decisão de EXIBIR o dropdown (foco, dismiss com Esc, termo mínimo)
 * fica no Header; este hook só cuida da busca.
 */
import { useEffect, useState } from 'react';
import { searchSuggestionsServer, SearchSuggestion } from './searchServer';

const DEBOUNCE_MS = 200;
/** Limite pedido à RPC: folga para o dedupe por (título, artista) podar. */
const RPC_LIM = 12;
/** Máximo exibido no dropdown. */
const MAX_SUGGESTIONS = 8;

export interface SearchSuggestionsState {
  suggestions: SearchSuggestion[];
  /** True entre a tecla e a resposta do banco (o dropdown não pisca por isso). */
  loading: boolean;
}

export function useSearchSuggestions(rawQuery: string): SearchSuggestionsState {
  const termo = rawQuery.trim();

  const [state, setState] = useState<SearchSuggestionsState>({
    suggestions: [],
    loading: false,
  });

  useEffect(() => {
    // < 3 letras: zera na hora (sem RPC, sem dropdown — guarda do Seq Scan).
    if (termo.length < 3) {
      setState({ suggestions: [], loading: false });
      return;
    }

    let vigente = true;
    setState((s) => (s.loading ? s : { ...s, loading: true }));

    const timer = setTimeout(async () => {
      const res = await searchSuggestionsServer(termo, RPC_LIM);
      if (!vigente) return; // termo trocou: resposta antiga no lixo
      setState({
        suggestions: res ? res.slice(0, MAX_SUGGESTIONS) : [],
        loading: false,
      });
    }, DEBOUNCE_MS);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [termo]);

  return state;
}
