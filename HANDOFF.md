# 🤝 HANDOFF — Estado Vivo do Projeto

> **LEIA PRIMEIRO.** Qualquer agente de IA (Claude Code, Codex, Gemini CLI, Cursor, Cline,
> Freebuff, etc.) deve ler este arquivo ao iniciar uma sessão, junto com `AGENTS.md`.
> Ele contém: onde paramos, o raciocínio das decisões e os próximos passos.
> **Atualize este arquivo ao terminar cada sessão** (ou peça ao agente para atualizá-lo).

- **Última atualização:** 2026-08-05 (sessão: recuperação do acervo vazio)
- **Branch:** `analysis-work`
- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 + Express (server.ts) + Supabase (Postgres/PostgREST)
- **Produção:** https://ukemasterpro.vercel.app (projeto Vercel: `ukemaster`)
- **Cron de plataformas:** roda em 2 máquinas Tailscale (ver `CRON_DEPLOYMENT.md`)

---

## ✅ Estado atual (2026-08-05 — após deploy 7294b71)

- **Reparo do acervo**: vazias caíram de 3987 → **514** (cron `--repair` no acer a cada 30min; segue rodando).
- **Bugs corrigidos**: catálogo `/musicas.html` (bug de profundidade), dedupe upsert (erro 21000), preservação de metadados no repair, Chitãozinho restaurado (398 músicas), Tom Jobim re-importado (119).
- **Monetização**: AdSenseSlot real, intersticial 10s, sticky mobile, 3 novas zonas Monetag (11510035, 11510029, 267181).
- **UX**: HOME, ESTUDO DE RITMOS, exclusão só admin (iluminatto@gmail.com), enviar/importar só logado, CONFIGURAÇÕES removido.

## 🔴 TRABALHO EM ANDAMENTO (sessão atual)

### Incidente: acervo inteiro com `content` vazio (CRÍTICO)

**Sintoma:** a página da música Coldplay abria vazia → investigação revelou que **TODAS as
4335 músicas** do banco estavam com `content = ''`.

**Causa raiz (confirmada):**
1. `pushSongsToCloud` fazia **upsert do acervo inteiro** a cada alteração (debounce 1s no App.tsx);
2. o cache local (`localStorage`) guarda músicas **sem `content`** de propósito (cota ~5MB);
3. quando o fetch inicial da nuvem falha, o app roda com dados locais sem conteúdo — e
   qualquer voto/edição disparava o push **apagando o `content` de todas as músicas**.

**Correções já aplicadas no código (ainda NÃO deployadas):**
- `src/lib/cloudSync.ts` — `pushSongsToCloud` agora **filtra músicas sem `content`** (nunca envia vazio) ✅
- `src/lib/scraper.ts` — descarta cifra vazia/bloqueada; normaliza título com `\n`/espaços ✅
- `api/musica.ts`, `api/sitemap.ts`, `api/robots.ts` — reescritos **inline** (imports de `src/` quebravam no runtime ESM da Vercel) ✅
- `api/scrape.ts`, `api/scrape-platforms.ts` — imports com extensão `.ts` explícita ✅
- **NOVO:** `src/lib/platformCron.ts` — modo **`repairContent`**: re-scrapeia e atualiza (upsert
  pelo mesmo `id`) músicas com conteúdo vazio, **preservando IDs** (votos/playlists intactos) ✅
- `scripts/cron-runner.ts` — flag `--repair` ✅
- `dist-cron/run-cron.cmd` — wrapper agora roda com `--repair` ✅

**Validação feita:**
- `npm run lint` ✅ | `npm run build:cron` ✅ (bundle `9f1251c...`)
- Teste real: `--repair` no artista Alceu Valença → **15 músicas reparadas** com cifras reais, IDs preservados ✅
- Banco: 4335 total, **4320 ainda vazias** (reparo em andamento)

### ✅ FAZER AGORA (próximos passos, em ordem)

- [ ] **1. Deploy do cron novo** nas 2 máquinas (`dist-cron/ukemaster-cron.mjs` + `run-cron.cmd` novo) e re-agendar com `--repair`
- [ ] **2. Rodar o reparo** até zerar as 4320 vazias (máquinas a cada 30min + execuções manuais)
- [ ] **3. Build + deploy Vercel** (corrige o push + APIs + scraper em produção)
- [ ] **4. Validar** a página Coldplay ao vivo com conteúdo
- [ ] **5. Commit + push** no branch `analysis-work`

---

## 🧠 LINHA DE RACIOCÍNIO (decisões e porquês)

| Decisão | Porquê |
|---|---|
| **Reparo preserva IDs** (upsert pelo mesmo id) em vez de deletar/re-importar | `song_votes` e `playlists` referenciam `song_id`; deletar quebraria votos/playlists |
| **Push nunca envia música sem content** | o cache local é propositalmente sem conteúdo; o envio apagava a nuvem |
| **APIs da Vercel inline/`.ts` explícito** | Vercel compila `api/*.ts` como ESM; import sem extensão → `ERR_MODULE_NOT_FOUND` (500) |
| **Dedupe em 3 camadas** (`cron_imports` + acervo + memória) | impede duplicatas mesmo com nuvem indisponível |
| **Cursor justo com rotação** | artistas gigantes (Roberto Carlos ~617) não monopolizam a fila |
| **Modo reparo é opt-in (`--repair`)** | no modo normal o dedupe deve continuar pulando músicas existentes |

---

## 📚 COMO LER O CÓDIGO (documentação em massa)

- **Todos os arquivos TS/TSX têm cabeçalho JSDoc** explicando o papel do módulo (gerado por `scripts/add-doc-headers.mjs` — idempotente; rode ao criar arquivos novos).
- **Ordem sugerida de leitura:** `src/types.ts` (domínio) → `src/config.ts` → `src/lib/supabase.ts` + `src/lib/cloudSync.ts` (dados) → `src/lib/scraper.ts` + `src/lib/platformCron.ts` (cron/importação) → `src/App.tsx` (orquestração) → `src/components/`.
- Camadas de dados: `ratings.ts` (votos/rankings), `repertoires.ts` (repertórios privados), `leads.ts` (captura de lead do cadastro).
- Monetização: `AdSenseSlot`, `AdInterstitialModal` (limite diário de 6), `StickyBottomAd`, `Monetag` (4 zonas), `DonationModal`/`SupportPrompt` (APOIA.se + Pix).

## 🗂️ MAPA DO PROJETO

| Caminho | O que é |
|---|---|
| `src/App.tsx` | App principal (estado, sync nuvem/local, votos, rotas) |
| `src/components/` | UI: SongList, SongViewer, Dashboard, modais, Tuner, etc. |
| `src/lib/supabase.ts` | Cliente Supabase REST (fetchRows, upsertRows, patchRows) |
| `src/lib/cloudSync.ts` | Sync nuvem↔localStorage (songs, playlists, repertoires) |
| `src/lib/scraper.ts` | Scraping de cifras (CifraClub BR + GuitarTabs INT) + filtro de lixo |
| `src/lib/platformCron.ts` | Cron de plataformas (cursor, dedupe, `--repair`) |
| `src/lib/ratings.ts` | Votos (PATCH em `songs.votes` + tabela `song_votes`) |
| `src/lib/platforms.ts` | Registro de plataformas (CifraClub/GuitarTabs; UG/E-chords desativados) |
| `server.ts` | Servidor Express (SSR/SEO, sitemap, robots) |
| `api/` | Vercel Serverless Functions (sitemap, robots, musica, scrape, scrape-platforms) |
| `supabase/schema.sql` | Schema: songs, playlists, repertoires, song_votes, cron_imports, cron_log, scrape_state |
| `scripts/cron-runner.ts` | Entry do bundle do cron (flags: `--fast`, `--reset`, `--repair`, `--platform`, `--budget`) |
| `CRON_DEPLOYMENT.md` | Guia de deploy do cron em qualquer máquina |
| `SUPABASE_SETUP.md` | Guia de setup/keys do Supabase |

## 🔑 AMBIENTE / CHAVES

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL=https://asvjdjawaenxrlwdyziy.supabase.co`
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_w7Wr47WNSZmbDShcnJy8Uw_9TNM0Rdj`
  (chave publishable — pública por design; o schema tem RLS permissivo p/ leitura+escrita do acervo)
- **Clerk:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (no `.env.local` / Vercel)
- **YouTube (opcional):** `YOUTUBE_API_KEY` — enriquece músicas com videoaula (20/execução)
- Copiar de: `.env.local` → Vercel / `dist-cron/.env`

## ⚙️ COMANDOS ÚTEIS

```bash
npm run dev          # dev server (tsx server.ts, porta 3001)
npm run lint         # tsc --noEmit
npm run build        # vite build + server.cjs
npm run build:cron   # gera dist-cron/ukemaster-cron.mjs
npm run cron:test    # teste rápido local
npx vercel --prod --yes   # deploy produção
node dist-cron/ukemaster-cron.mjs --repair --fast --budget 45000 --platform cifraclub-br --artist '<URL>'
```

## 🖥️ MÁQUINAS DO CRON (Tailscale)

| Máquina | Usuário | Pasta | Agendamento |
|---|---|---|---|
| 100.122.20.11 (DWT, Windows 11) | `ilumi` / senha `1a7g3c` | `C:\Users\ilumi\ukemaster-cron\` | `schtasks` `ukemaster-cron` a cada 30min → `run-cron.cmd` (`--repair`) |
| 100.95.254.71 (ACER, Linux) | `iluminatto` / senha `1a7g3c` | `~/ukemaster-cron/` (Linux) | crontab `*/30 * * * *` → `node ukemaster-cron.mjs --repair` |

SSH: `ssh ilumi@100.122.20.11` (Windows — usar `SSH_ASKPASS` p/ senha) | `ssh iluminatto@100.95.254.71` (Linux).

> **2ª máquina (DWT) atualizada em 2026-08-05**: bundle novo (md5 `1caca88e…`) + `.env` copiados; `run-cron.cmd` agora roda com `--repair`; tarefa `schtasks /tn ukemaster-cron /sc minute /mo 30` criada (estado: Pronto). Confirmado que o cron roda e conecta no Supabase (varre a fila; dedupe por `cron_imports` evita reimport).

---

## 📝 COMO ATUALIZAR ESTE ARQUIVO

Ao terminar uma sessão, atualize: (1) data; (2) status do "TRABALHO EM ANDAMENTO" (feito/faltando);
(3) decisões novas na tabela de raciocínio; (4) arquivos alterados. Mantenha conciso (≤ ~150 linhas).
