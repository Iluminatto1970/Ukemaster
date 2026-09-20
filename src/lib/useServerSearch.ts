/**
 * useServerSearch: busca server-side com debounce de 300ms + paginação.
 *
 * Padrão "last-writer-wins": cada tecla reinicia o timer; somente a última
 * consulta dispara a chamada — sem spam de rede e sem corrida de respostas
 * fora de ordem. Se o termo ficar vazio, zera os resultados na hora.
 *
 * `termo` devolvido é o termo para o qual o estado atual responde — o
 * chamador compara com o input para só usar resultados que casam com o
 * que está na tela (evita mostrar resposta antiga numa digitação rápida).
 *
 * Paginação: `loadMore()` busca a página seguinte DIRETO do banco (offset)
 * e acumula em `songs`. `hasMore` diz se há mais matches além dos carregados.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { searchSongsServer } from './searchServer';
import { Song } from '../types';

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

export interface ServerSearchState {
  /** Páginas já carregadas (acumuladas) para o termo atual; null = sem RPC. */
  songs: Song[] | null;
  /** Total de matches no banco; null = ainda há mais páginas. */
  total: number | null;
  searching: boolean;
  loadingMore: boolean;
  /** Termo (trim) que o estado atual responde; '' quando vazio. */
  termo: string;
  /** Há mais resultados no banco além dos já carregados? */
  hasMore: boolean;
  /** Busca a próxima página do banco e acumula (no-op se não há mais). */
  loadMore: () => void;
}

export function useServerSearch(rawQuery: string): ServerSearchState {
  const termo = rawQuery.trim();

  const [state, setState] = useState<ServerSearchState>({
    songs: null,
    total: null,
    searching: false,
    loadingMore: false,
    termo: '',
    hasMore: false,
  });

  // Espelhos para os callbacks assíncronos: descartam respostas/páginas de
  // um termo que já trocou e sabem o offset atual sem depender do closure.
  const termoRef = useRef('');
  termoRef.current = termo;
  const songsRef = useRef<Song[] | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!termo) {
      songsRef.current = null;
      setState({
        songs: null,
        total: null,
        searching: false,
        loadingMore: false,
        termo: '',
        hasMore: false,
      });
      return;
    }

    let vigente = true;
    setState((s) => ({ ...s, searching: true }));

    const timer = setTimeout(async () => {
      const outcome = await searchSongsServer(termo, PAGE_SIZE, 0);
      if (!vigente || termoRef.current !== termo) return;
      songsRef.current = outcome.songs;
      setState({
        songs: outcome.songs,
        total: outcome.total,
        searching: false,
        loadingMore: false,
        termo,
        // RPC respondeu (songs !== null) e não veio total exato → há mais.
        hasMore: outcome.songs !== null && outcome.total === null,
      });
    }, DEBOUNCE_MS);

    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [termo]);

  const loadMore = useCallback(() => {
    const t = termoRef.current;
    const atual = songsRef.current;
    if (!t || !atual || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setState((s) => ({ ...s, loadingMore: true }));

    (async () => {
      const outcome = await searchSongsServer(t, PAGE_SIZE, atual.length);
      loadingMoreRef.current = false;
      if (termoRef.current !== t) return; // termo trocou: descarta silenciosamente

      if (outcome.songs === null) {
        setState((s) => ({ ...s, loadingMore: false, hasMore: false }));
        return;
      }

      const vistos = new Set(atual.map((x) => x.id));
      const novos = outcome.songs.filter((x) => !vistos.has(x.id));
      const acumulado = [...atual, ...novos];
      songsRef.current = acumulado;
      setState((s) => ({
        ...s,
        songs: acumulado,
        total: outcome.total,
        loadingMore: false,
        hasMore: outcome.total === null,
      }));
    })();
  }, []);

  return state;
}
