# 📌 Histórico de Continuidade — UkeMaster Pro

> **Como retomar o trabalho de onde paramos em outra máquina.**
> Última atualização: **2026-08-07** · Branch de trabalho: **`analysis-work`**

---

## 1. Como continuar em outra máquina (5 passos)

```bash
git clone https://github.com/Iluminatto1970/UkuMaster.git
git checkout analysis-work
npm install
# 1) copiar o .env.local da máquina atual (chaves do Supabase — NUNCA commitar)
#    → VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, ADMIN_SECRET
npm run dev          # servidor local (porta 5173)
```

- **Deploy produção:** `npx vercel deploy --prod --yes --project ukemaster` (domínio `ukemasterpro.vercel.app`)
- **Validar antes do deploy:** `npx tsc --noEmit && npm run build`
- **Credenciais do cron:** ver `CRON_DEPLOYMENT.md` e `scripts/cron/cron.env.example`
- **Religar máquinas Acer/Desktop (Linux Mint):** ver `docs/CHECKLIST_RELIGAR_MAQUINAS.md`

---

## 2. Estado atual (08/2026)

| Item | Estado |
|---|---|
| **Produção** | `ukemasterpro.vercel.app` (projeto Vercel: `ukemaster`) |
| **Banco** | Supabase `asvjdjawaenxrlwdyziy` — acervo com **~13.250 músicas** |
| **Acervo por idioma** | pt 7.091 · en 3.824 · es 2.255 · fr 67 · de 11 · ja 2 (coluna `lang`) |
| **Cron Vercel** | Registrado (`0 9 * * *`), mas **não dispara no plano Hobby** — cobertura via máquinas + painel admin |
| **Máquinas** | Acer + Desktop (**Linux Mint**, Tailscale, ex-Windows) rodam `dist-cron/ukemaster-cron.mjs` a cada 30 min; **precisam do bundle novo** (`git pull && npm run build:cron` + `CRON_WORKER_NAME=acer\|desktop` no `dist-cron/.env`) |

---

## 3. Trabalhos desta sessão (2026-08-07)

1. **Letras com entidades HTML decodificadas** — `src/lib/scraper.ts` usa `decodeEntities` completo (`&#x27;` → `'`); artista do U-FRET (JA) extraído corretamente. Commit `eeae6aa` **deployado**.
2. **Limpeza em massa das letras quebradas** — **3.907 músicas** com `&#x27;` corrigidas no banco preservando ids/votos (count final 0). Foi aplicação do `decodeEntities` no content, sem re-scrape (sem risco de rate limit).
3. **UkuTabs desabilitado** — 0 importações históricas; Cloudflare bloqueia o fetch do Node (fingerprint TLS) e IPs de datacenter. Só curl com IP residencial passaria (avaliado). `src/lib/platforms.ts`.
4. **Ultimate-Guitar registrado** (desabilitado, aguardando extrator) — validado 2026-08 em HTML puro: página de artista `/tabs/{artista}_tabs.htm` tem `js-store` → `other_tabs[]` com `tab_url` (Adele = 569 tabs); página de música tem `store.page.data.wiki_tab.content` com cifra completa em `[ch]X[/ch]`. **Melhor fonte EN do mundo — prioridade alta.**
5. **Sugestões por idioma** — campo `lang` na `Song`/tabela `songs` (aplicado no banco), gravação automática por plataforma no `platformCron`, retrofill das 13.250 existentes por heurística, e a home (Mais Votadas, Em Alta, Mais Acessadas, Novidades, ranking hero) agora **filtra pelo idioma da interface**; a **busca continua global**. ⚠️ **Ainda NÃO deployado.**

---

## 4. Pendências (o que falta — prioridade)

- [ ] **P1 — Deploy da feature de idiomas** (SongList/cloudSync/platformCron/types/schema — mudanças não commitadas desta sessão, ver §5).
- [ ] **P1 — U-FRET (JA) não persiste no banco**: importações reportam sucesso mas só 2 músicas japonesas no acervo. Investigar a persistência (talvez upsert falhando ou dedupe).
- [ ] **P1 — Extrator do Ultimate-Guitar**: parse do `js-store` (`other_tabs` + `wiki_tab.content`, converter `[ch]X[/ch]` → `[X]`), habilitar `ultimate-guitar-en` e testar importação real da Adele.
- [ ] **P2 — Máquinas com bundle novo**: `git pull && npm run build:cron` no Acer/Desktop + `CRON_WORKER_NAME` (sem isso, o card "Status das Máquinas" mostra "NUNCA RODOU" e a fila `worker_commands` fica pendente).
- [ ] **P2 — 340 músicas com conteúdo vazio**: repair em andamento via rodadas das máquinas (modo `--repair`).
- [ ] **P3 — Cron Vercel Hobby**: não dispara; opções: plano Pro ou manter só máquinas + disparos manuais do painel.
- [ ] **P3 — Fallback curl no fetchHtml**: destravaria UkuTabs, mas SÓ nas máquinas (IP residencial); na Vercel não adianta (IP de datacenter bloqueado).

---

## 5. Mudanças pendentes de commit (working tree, 07/08)

| Arquivo | O quê |
|---|---|
| `src/types.ts` | campo `lang?: string` na `Song` |
| `src/lib/cloudSync.ts` | `lang` no mapeamento Song ⇄ linha e nos metadados baixados |
| `src/lib/platformCron.ts` | `platformLangById` + gravação do idioma na importação/repair |
| `src/components/SongList.tsx` | sugestões da home filtradas por idioma (busca global) |
| `supabase/schema.sql` | coluna `lang` na tabela `songs` (já aplicada no banco) |
| `src/lib/platforms.ts` | UkuTabs desabilitado + Ultimate-Guitar registrado |
| `src/lib/scraper.ts` | `decodeEntities` exportado (reuso) |

---

## 6. Atalhos úteis

- **Consulta ao banco (REST):** chaves em `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); tabela `songs` tem `id,title,artist,key,category,lang,content,simplified_content,medium_content,votes,views`.
- **Painel admin** (`/admin`): rodada imediata nas máquinas (fila `worker_commands`), status dos workers (card "Status das Máquinas"), scraping manual.
- **Documentação de apoio:** `CRON_DEPLOYMENT.md` · `GO_LIVE_CHECKLIST.md` · `docs/CHECKLIST_RELIGAR_MAQUINAS.md` · `SUPABASE_SETUP.md` · `supabase/google-oauth-setup.md` (login Google: URIs de redirect já cadastrados para localhost e `ukemasterpro.vercel.app`).
