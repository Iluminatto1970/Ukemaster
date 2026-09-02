-- 2026-09-02 — ÍNDICE COMPOSTO: busca por artista + título.
--
-- Já existem songs_artist_idx e songs_title_idx (single-column). Para queries
-- que filtram pelos DOIS (ex.: "todas as músicas do artista X cujo título
-- começa com Y") o planejador pode usar varredura por artista + filtro em
-- título, mas o índice composto cobre ambas as colunas numa só estrutura,
-- acelerando ORDER BY artist, title e buscas com prefixo em ambos.
--
-- Os índices single-column existentes NÃO são removidos: continuam úteis
-- para filtros que usam só uma das colunas.
create index if not exists songs_artist_title_idx
  on public.songs (artist, title);
