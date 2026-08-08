# 🚀 UkeMaster Pro — Checklist de Lançamento (Go-Live)

> **Domínio:** https://ukemasterpro.com (antigo `ukemasterpro.vercel.app`, migrado 08.08.2026 — aponta para o mesmo projeto Vercel `ukemaster`)
> **Meta:** deixar o site 100% monetizado, indexado e com tráfego antes da divulgação ampla.
> Use este checklist na ordem: **Fundação → Anúncios → SEO → Analytics → Redes → Lançamento**.

---

## 1. 🏗️ Fundação (já feita — só confira)

- [ ] Site no ar: `https://ukemasterpro.com` responde 200 (apex + www com SSL automático da Vercel)
- [ ] `/robots.txt`, `/sitemap.xml`, `/sw.js` e `/manifest.json` respondem 200 (PWA)
- [ ] Acervo com +4.000 cifras e busca funcionando
- [ ] Login (Clerk) + repertórios + votos funcionando
- [ ] `.env` com todas as chaves configuradas na Vercel (Project Settings → Environment Variables):
  - `VITE_ADSENSE_CLIENT_ID` (já configurado: `ca-pub-7409769323856107`)
  - `VITE_GA_MEASUREMENT_ID` (GA4 — passo 3)
  - `VITE_PLAUSIBLE_DOMAIN` (Plausible — opcional)
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

---

## 2. 💰 Anúncios (AdSense + Monetag)

### Google AdSense
- [ ] **Cadastro aprovado** — https://adsense.google.com → status "Aprovado" (sem a aprovação, os blocos não exibem anúncios reais)
- [ ] **Domínio verificado** no AdSense: adicione `https://ukemasterpro.com` → "Meus sites" → "Verificar site"
- [ ] **sw.js na raiz** servido com 200 (já confirmado — necessário para o AdSense verificar o domínio)
- [ ] **Políticas**: sem cliques próprios, no máx. 3 blocos visíveis por tela
- [ ] (Opcional) Criar **unidades de anúncio** específicas (Display, In-article, Multplex) e anotar os `data-ad-slot` para ajustar os componentes

### Monetag
- [ ] Painel: https://publisher.monetag.com → verificar **domínio aprovado** (`ukemasterpro.com` — substituir `ukemasterpro.vercel.app` adicionado em 04.08.2026)
- [ ] **Zonas ativas** no `Monetag.tsx` (3 ligadas + 1 opcional, configuráveis via flags no topo do arquivo):
  - Push (permissão): zona `11500772` — injetado após a 1ª interação ✅
  - Vignette: zona `11510035` — injetada no **intersticial de ações** (10s de contagem) e também aos 75s de sessão ✅
  - In-page push: zona `11510029` — toast na página após 45s ✅
  - Popunder/tag: zona `267181` — **desligado** (sequestrava cliques; religar só com frequency capping no painel)
- [ ] **Intersticial estendido** (App.tsx, `AD_GATE_EVERY`): abrir cifra (a cada 3ª, aumentado de 6ª a pedido), **downloads** (a cada 2º), **abrir playlists** (a cada 3ª) e **entrar no afinador/metrônomo** (a cada 2ª) — todos com o mesmo limite diário (6/dia) e intervalo mínimo (3 min). Cadência por ação ajustável no topo do App.tsx.
- [ ] No painel Monetag, conferir que as zonas `11500772` e `11510029` estão como **Web Push / In-Page Push** (não Popunder) e ajustar frequency capping da vignette (ela agora também dispara no intersticial do app — com 1x/sessão, só a 1ª ação do dia monetiza com vignette; para mais impressões, suba a frequência no painel)
- [ ] `sw.js` na raiz (a Monetag exige para push) — já verificado
- [ ] Teste de tráfego real: **após o lançamento**, verificar no painel se as zonas estão "recebendo" (impressões)

### APOIA.se (doações)
- [ ] Página da comunidade ativa: https://apoia.se/ukemasterpro (ou o link real)
- [ ] Link de doação testado no banner do topo e no botão do header

---

## 3. 🔍 Google Search Console (indexação)

- [ ] Acessar https://search.google.com/search-console → "Adicionar propriedade"
- [ ] Escolher **"Prefixo de URL"** e digitar `https://ukemasterpro.com`
- [ ] **Verificação por tag HTML**: copiar o meta `google-site-verification=...` e pedir para inserir no `index.html` (o projeto é nosso, inserimos em 2 min)
- [ ] Após verificado: **enviar o sitemap** → Sitemaps → `https://ukemasterpro.com/sitemap.xml`
- [ ] Pedir **indexação das principais URLs** (URL Inspection → "Solicitar indexação"): `/` e 3–5 cifras populares
- [ ] Acompanhar por 2–3 dias: "Cobertura" e "Páginas" no relatório (indexadas vs. com erro)

> ⚠️ O `sitemap.xml` é dinâmico (gerado no `server.ts` com as cifras do banco). Se o Google mostrar "não encontrado", conferir se a rota responde 200 em produção.

---

## 4. 📊 Analytics

### Google Analytics 4 (recomendado — grátis e completo)
- [ ] Criar propriedade GA4: https://analytics.google.com → Admin → Criar propriedade → nome **"UkeMaster Pro"**
- [ ] Copiar o **Measurement ID** (formato `G-XXXXXXXXXX`)
- [ ] Adicionar `VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX` no painel Vercel (Environment Variables)
- [ ] **Redeploy** da Vercel (o código já injeta o gtag automaticamente)
- [ ] Testar: abrir o site, ver em tempo real https://analytics.google.com → Tempo real → deve aparecer 1 usuário

### Plausible (opcional — alternativa privada)
- [ ] Criar conta em https://plausible.io → adicionar site `ukemasterpro.com`
- [ ] Copiar o domínio do script e adicionar `VITE_PLAUSIBLE_DOMAIN=ukemasterpro.com` + redeploy
- [ ] Como ver os dados: painel do Plausible (simples) ou GA4 → Relatórios → Tempo real / Aquisição

---

## 5. 📱 Redes Sociais (divulgação)

> Sugestão: centralizar todas as redes com o mesmo handle **@ukemasterpro**.

### Criar os perfis
- [ ] **Instagram** — https://instagram.com/ukemasterpro (conteúdo: vídeos curtos tocando ukulele, dicas, "cifra do dia")
- [ ] **TikTok** — https://tiktok.com/@ukemasterpro (formatos: 15–30s tocando músicas populares com link na bio)
- [ ] **YouTube** — https://youtube.com/@ukemasterpro (aulas + tocar junto com as cifras do site)
- [ ] **Facebook** — página + grupo "Ukulelistas do Brasil" (postagens diárias)
- [ ] **WhatsApp/Telegram** — grupo de comunidade (usar a base de leads capturada no cadastro!)

### Bio padrão
```
🎸 UkeMaster Pro — cifras de ukulele grátis
🎵 4.000+ músicas | Afinador | Dicionário
🔗 link na bio → https://ukemasterpro.com
```

### Ações de divulgação (pós-go-live)
- [ ] Postar nos **grupos de ukulele** do Facebook e WhatsApp ("acabei de criar um site grátis de cifras de uke")
- [ ] **Vídeo de lançamento** no TikTok/Reels mostrando o site funcionando
- [ ] **Pilar de conteúdo**: "cifra da semana" toda semana com link
- [ ] **SEO contínuo**: pedir para o Google indexar via Search Console a cada nova leva de cifras
- [ ] Colher **feedback** dos primeiros usuários (bugs, músicas que faltam)

---

## 6. 🎬 Dia do lançamento

- [ ] Verificar anúncios exibindo em produção (abrir 2–3 cifras como visitante)
- [ ] Verificar Analytics capturando (Tempo real)
- [ ] Verificar Search Console sem erros críticos
- [ ] Postar o anúncio de lançamento nas redes
- [ ] Responder comentários e incentivá-los a **se cadastrar** (base de leads + repertórios)
- [ ] **Monitorar por 24h**: erros no console, anúncios, uptime

---

### ✅ Sinal verde para lançar quando:
1. AdSense **aprovado** (senão só Monetag monetiza)
2. Search Console **verificado** + sitemap enviado
3. GA4 **capturando** dados
4. Perfis de redes **criados** com o link na bio
5. Acervo sem cifras vazias aparentes (repair do cron finalizado ou filtrado)

> **Lembrete:** dá para divulgar o site **hoje** mesmo (ele já está no ar e funcional) — o checklist garante que cada visitante seja monetizado e que o Google passe a indexar as 4.000+ cifras.
