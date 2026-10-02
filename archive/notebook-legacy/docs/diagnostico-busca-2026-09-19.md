# Diagnóstico — Busca do UkeMaster Pro (ukemasterpro.com)

> Data: 19/09/2026 · Analisado a partir do bundle de produção `assets/index-BRTGN-Xb.js`
> e da API REST pública do Supabase (`asvjdjawaenxrlwdyziy.supabase.co`).

## Sintoma relatado
"A busca não acha; a página recarrega e volta ao início do site."

## Causa raiz (3 problemas encadeados)

### 1. A busca só enxerga uma fatia minúscula do catálogo
O app **não busca no servidor**. Ele baixa no máximo **500 músicas** para memória
(300 no carregamento inicial via `_w(300)` + lotes de 200 via "carregar mais" `zw(id, 200)`)
e filtra **localmente** (`Ut`): título, artista, categoria, tags, tom e conteúdo,
tudo normalizado sem acento (`Ct`).

O catálogo real tem **394.313 músicas** (`Content-Range: 0-999/394313`).
Ou seja: **99,87% do acervo é invisível para a busca** — por isso "não acha".

### 2. A ordem do catálogo não é relevância — é ordem de scraping
Os IDs das músicas são `scraped-<timestamp>-<aleatório>` (**394.309 registros**; só 4 são
manuais: `song-1` … `song-4`). Como o app ordena por `order=id.desc`, a "primeira página"
do site é o **lote mais recente de scraping**, sem relação com relevância ou alfabeto.
A busca local só varre essa fatia aleatória de 500 itens.

### 3. A sensação de "recarregou e voltou ao início"
Cada tecla digitada no input do header chama `setSearchQuery`, que no App faz:

```js
setSearchQuery: N => { Bt(N), N && (ue !== "musicas" && ge("musicas"), Me !== "editor" && Ce("list")) }
```

Ou seja: **a cada caractere** o app troca a aba ativa para `musicas` e a view para `list`.
A Biblioteca **remonta**, exibe "Carregando…" (`catalogLoading`) e o scroll reseta para o topo —
exatamente a impressão de "a página recarregou e voltou ao início". Não é submit nativo
(não há `<form>` na busca, só nos modais de auth/leads), nem `location.reload()`.
Também **não há debounce**: nada de milissegundos entre a tecla e a remontagem.

### Agravante: dados inconsistentes no banco
O scraping gerou artistas às vezes **sem** acento ("Legiao Urbana") e às vezes **com**
("Alceu Valença", "Você É Linda"). Um filtro client-side sem acento resolve parcialmente,
mas uma busca server-side por `ilike` "valenca" **não encontra** "Valença".
A normalização precisa viver no banco (ou a busca precisa testar as duas variantes).

## Evidências
- `Content-Range: 0-999/394313` na tabela `songs` (total exato).
- Contagem por padrão de ID: `scraped-*` = 394.309 · `song-*` = 4 · outros = 0.
- Colunas carregadas na listagem (sem `content`, correto): `gd="id,title,artist,key,tempo,strumming_pattern,youtube_url,youtube_id,difficulty,category,lang,tags,seo_description,hashtags,votes,views,created_at,updated_at"`.
- Busca server-side via REST funciona hoje (ex.: `or=(title.ilike.*legiao*,artist.ilike.*legiao*)` retorna Legião Urbana instantaneamente).
- Filtro local existe e é razoável (sem acento, multi-campo) — o problema é o volume, não a lógica.
- `location.reload()` só aparece no ErrorBoundary ("Não foi possível carregar esta tela").

## Recomendações

### Correção rápida (frontend, sem migration) — *implementada como referência em `src/services/search.js`*
1. Buscar no servidor via PostgREST: `GET /rest/v1/songs?select=...&or=(title.ilike.*q*,artist.ilike.*q*)&order=votes.desc.nullslast,title.asc&limit=N`.
2. Disparar a busca com **debounce de ~300 ms** e também no **Enter** (sem trocar de aba a cada tecla — trocar apenas quando a busca retorna algo, ou só no primeiro caractere).
3. Consultar **duas variantes** do termo (com e sem acento) em paralelo e mesclar, contornando a inconsistência dos dados.
4. Exibir contador real de resultados (`Prefer: count=exact` → header `Content-Range`).

### Correção definitiva (banco — Supabase)
1. Coluna gerada + índice:
   ```sql
   alter table songs add column search_text text
     generated always as (unaccent(lower(title || ' ' || artist || ' ' || category || ' ' || array_to_string(tags, ' ')))) stored;
   create extension if not exists pg_trgm;
   create index songs_search_trgm on songs using gin (search_text gin_trgm_ops);
   ```
2. RPC `search_songs(q text, lim int default 30)` com ranking (`similarity()` ou
   `websearch_to_tsquery('portuguese', q)`) e expor via PostgREST — a UI passa a chamar
   `/rest/v1/rpc/search_songs` com debounce.
3. Script de higienização dos dados (restaurar acentos corretos de artistas/títulos).

### Outros pontos
- `fetchAllRows` (AdminPanel) tem teto de **300 páginas × 1000** — insuficiente para 394 mil
  registros; trocar por contagem exata (`count=exact`, já existe em `Bw()`).
- O filtro local também procura em `content`, mas o catálogo não baixa `content` — campo sempre
  vazio na listagem; na busca server-side, incluir `content` no `search_text` resolve.

## Impacto esperado
Busca encontra qualquer uma das 394 mil músicas em < 100 ms, sem remontar a Biblioteca
a cada tecla e sem a sensação de reload.

---

## ✅ Correção definitiva APLICADA (19/09/2026, projeto `asvjdjawaenxrlwdyziy`)

**Desvio do plano original (importante):** em vez de coluna gerada `search_text`, foi criado
um **índice GIN trigram sobre expressão** centralizada em `ukm_song_search_text(...)`. Motivo:
a tabela `songs` tem **685 MB** — a coluna gerada forçaria um rewrite completo da tabela,
bloqueando o cron de importação (61.682 registros em `cron_imports`) por vários minutos.
A expressão é reavaliada automaticamente a cada INSERT/UPDATE — o índice se mantém
atualizado sozinho, com a mesma performance.

### O que foi criado
1. Extensões: `unaccent` + `pg_trgm` (schema `extensions`).
2. `ukm_immutable_unaccent(text)` — unaccent IMMUTABLE (requisito p/ índice).
3. `ukm_norm(text)` — minúsculas, sem acento, espaços colapsados.
4. `ukm_song_search_text(title, artist, category, tags, lang)` — expressão do índice
   (assinatura fixa; RPC e índice devem usá-la).
5. Índice `songs_search_trgm_idx` — GIN `gin_trgm_ops` sobre a expressão.
6. RPC `search_songs(q text, lim int default 30, off int default 0)`:
   - Multi-palavra com **AND** (todas as palavras devem casar);
   - **Acento-insensível** nos dois lados (consulta e dados);
   - **Ranking**: título exato (4) > prefixo do título (3) > título contém (2) >
     artista prefixo (1.5) > demais (1), multiplicado por boost de votos;
   - Escape de `%`/`_`/`\` contra injeção de padrões LIKE; `lim` clampado 1..50;
   - `grant execute` para `anon` e `authenticated` (RLS de songs já cobre leitura).
7. SQL espelhado no repo: `supabase/migrations/20260919120000_ukm_search.sql`.

### Validações executadas (todas OK)
- `search_songs('legiao urbana')` → encontra "Legiao Urbana" **e** "Legião Urbana".
- `search_songs('valença')` → encontra "Alceu Valença" (dado sem acento também acha).
- `search_songs('que país é este')` via REST → "Que País É Este | Legião Urbana".
- `EXPLAIN`: **Bitmap Index Scan em `songs_search_trgm_idx`** (índice sendo usado).
- REST: `POST /rest/v1/rpc/search_songs {"q":"...","lim":N}` funcionando com a chave anon.

### Código cliente
- `src/services/search.js` atualizado: caminho primário via RPC, fallback automático
  para `ilike` duplo-variante se a RPC não existir (ex.: ambiente sem a migration).
- Testes: 22/22 passando (`npx jest --coverage`).
