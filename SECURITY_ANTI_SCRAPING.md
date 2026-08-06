# Segurança do UkeMaster Pro — modelo de ameaças e defesas

Documento de referência do pacote de segurança implementado (jun/2026).
Cobre **anti-scraping + segurança geral**, organizado por camada e com o
modelo de ameaças de cada defesa.

---

## 1. Modelo de ameaças (o que protegemos)

| Ameaça | O que o atacante tenta | Defesa principal |
|---|---|---|
| **Raspagem em massa do acervo** | Baixar as ~5.000 cifras via API/rotas repetindo requisições | Rate limit por IP (Edge + Express), bloqueio de UA de ferramentas, noindex em /api/* |
| **SSRF pelo proxy de importação** | Usar `/api/fetch-url` para alcançar rede interna/metadata cloud (169.254.169.254) | Allowlist de domínios de cifra + guarda de redirecionamento (cada hop revalidado) |
| **Abuso das rotas admin/cron** | Disparar scraping ou escrita não autorizada | JWT Supabase + `x-admin-secret` + `x-vercel-cron` (fail-closed em produção) |
| **XSS via conteúdo importado** | Letra/cifra com HTML/script malicioso | Escapes em toda a exportação + CSP rígida no documento baixado + React (escapamento nativo) |
| **Clickjacking / embedding** | Embutir o site em iframe de terceiros para cliques falsos | `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'none'` |
| **MIME sniffing** | Servir HTML disfarçado de JS/CSS | `X-Content-Type-Options: nosniff` |
| **Cadastros falsos / spam de leads** | Automação preenchendo formulários | Honeypot invisível nos formulários + rate limit |
| **Varredura de vulnerabilidades** | Procurar /wp-admin, /.env, /phpmyadmin etc. | Honeypot → 404 idêntico ao "não existe" |
| **Vazamento de dados via referrer** | Saber a URL exata de onde o usuário veio | `Referrer-Policy: strict-origin-when-cross-origin` |
| **Ataque à camada de dados (RLS)** | Ler/escrever tabelas sem permissão | Row Level Security no Supabase (todas as políticas) |
| **Credenciais vazadas no bundle** | Extrair chaves do JS servido | Nenhum segredo no client (só `anon` key pública); service_role só no servidor |

---

## 2. Defesas por camada

### 2.1 Borda (Vercel Edge) — `middleware.ts`
- **Bloqueio de bots de raspagem** em `/api/*` e `/musica/*` (403). Crawlers de
  SEO/redes sociais (Googlebot, WhatsApp, etc.) passam **sempre** — indexação
  e links compartilhados intactos.
- **Rate limit por IP**: `/api/*` 120/min, `/musica/*` 240/min, páginas 900/5min.
- **Isenções legítimas**: cron da Vercel (`x-vercel-cron: 1`) e chamadas admin
  com `x-admin-secret` válido.
- **Headers extras** + `X-Robots-Tag: noindex` em `/api/*`.

### 2.2 Express local / self-host — `server.ts`
Espelha o Edge: honeypot de varredura (404), bloqueio de scrapers, rate limit
global 600/min, noindex em `/api/*`. Headers de segurança em todas as respostas.

### 2.3 Headers HTTP — `src/lib/security.ts`
CSP pragmática (Supabase + AdSense + YouTube + Monetag, sem `unsafe-eval`),
nosniff, `X-Frame-Options`, COOP/CORP, Permissions-Policy, HSTS (produção),
`X-XSS-Protection: 0` (o filtro legado pode introduzir falhas; o CSP protege).

### 2.4 Anti-SSRF — `src/lib/security.ts`
- `isAllowedFetchUrl`: só http(s) de domínios de cifra conhecidos; bloqueia
  IPs literais, localhost, IPs "camuflados" (decimal/hex) e o metadata cloud.
- `fetchWithRedirectGuard`: revalida **cada hop** de redirecionamento (máx. 4),
  limita tamanho (2MB) e valida Content-Type.

### 2.5 APIs serverless — `api/*.ts`
- `fetch-url`: rate limit 20/min, bloqueio de bots, guarda de redirect, headers
  próprios (`default-src 'none'`, `frame-ancestors 'none'`, noindex).
- `robots`: `Disallow: /api/` + bloqueio educado de ferramentas de raspagem.
- `scrape` / `scrape-platforms`: JWT admin/cron + rate limit + anti-SSRF.

### 2.6 Cliente — `src/lib/antiBot.ts`
Detecção de headless/automação (WebDriver, CDP, Phantom, Puppeteer...) com
janela de verificação e "challenge" leve; sinais suspeitos apenas registrados
(telemetria) — nunca bloqueia usuário real por engano.

### 2.7 Formulários — honeypot
`LeadCaptureModal` e cadastro do `AuthModal` têm campo invisível (`position:
absolute; left: -9999px` + `tabindex=-1` + `autocomplete=off`). Preenchido =
bot → rejeita silenciosamente (lead/cadastro descartados).

### 2.8 Exportação — `src/lib/songExport.ts`
Documentos HTML baixados/impressos têm **CSP rígida** (`default-src 'none'`,
só `data:` para imagem/estilo) — mesmo que um conteúdo malicioso passasse dos
escapes, ele não executa. Todos os campos já são escapados com `escapeHtml`.

### 2.9 Dados — Supabase RLS
`supabase/security-policies.sql` aplica RLS em todas as tabelas; o app usa a
chave `anon` (público) + políticas por `auth.uid()`; rotas admin exigem JWT.
Credenciais do cron (`CRON_UKEMATER_*`) vivem apenas em env das máquinas.

---

## 3. O que NÃO está no código (opcional, por decisão)

- **WAF de terceiros** (Cloudflare): se o tráfego crescer, mover DNS para o
  Cloudflare dá challenge/rate limit por reputação de IP sem código.
- **CAPTCHA no cadastro**: o honeypot cobre bots burros; um reCAPTCHA v3
  (invisível) cobriria automação avançada — custo de privacidade.
- **Rate limit distribuído** (Upstash/Redis): o atual é por instância; com
  múltiplas instâncias o limite é "best effort". Só necessário em escala.
- **Alertas de bloqueio** (email/Slack quando um IP passa do limite): fácil de
  adicionar no middleware, mas ruído operacional.

---

## 4. Como validar (checklist manual)

```bash
# 1. Headers de segurança presentes?
curl -sI https://ukemasterpro.vercel.app/ | grep -iE 'content-security|x-frame|nosniff|hsts'

# 2. /api/* noindex e sem cache?
curl -sI https://ukemasterpro.vercel.app/api/health | grep -iE 'x-robots-tag|cache-control'

# 3. Bots de scraping bloqueados no edge?
curl -s -o /dev/null -w '%{http_code}\n' -A 'curl/8.0' https://ukemasterpro.vercel.app/api/health   # → 403
curl -s -o /dev/null -w '%{http_code}\n' -A 'python-requests/2.31' https://ukemasterpro.vercel.app/musica/x  # → 403

# 4. Crawlers de SEO seguem passando?
curl -s -o /dev/null -w '%{http_code}\n' -A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' https://ukemasterpro.vercel.app/musica/x  # → 200

# 5. Rate limit do fetch-url?
for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://ukemasterpro.vercel.app/api/fetch-url -H 'Content-Type: application/json' -d '{"url":"https://www.cifraclub.com.br/foo"}'; done  # … 429

# 6. SSRF bloqueado?
curl -s -X POST https://ukemasterpro.vercel.app/api/fetch-url -H 'Content-Type: application/json' -d '{"url":"http://169.254.169.254/latest/meta-data"}'  # → 403 SSRF_ERROR

# 7. Honeypot do cadastro: preencher o campo oculto e submeter → nada é salvo.
```

---

## 5. Controles de rotas protegidas

| Rota | Auth exigida | Rate limit |
|---|---|---|
| `POST /api/fetch-url` | — (bot check) | 20/min/IP |
| `POST /api/scrape` | JWT admin | 10/min/IP |
| `POST /api/scrape-platforms` | JWT admin / cron / secret | 6/min/IP |
| `POST /api/cron/*` | `x-vercel-cron: 1` + secret | — |
| `GET /api/musica` | anon (prerender) | 240/min/IP no edge |
| `POST /api/musica` (editor) | JWT + RLS | 120/min/IP no edge |
