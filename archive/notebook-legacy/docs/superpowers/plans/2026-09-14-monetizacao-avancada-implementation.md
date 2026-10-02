# Monetização Avançada – Plano de Implementação

> **For agentic workers:** REQUIRED SUB‑SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task‑by‑task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implantar uma estratégia híbrida de geração de receita que combine AdTech avançada, área de membros premium e programa de afiliados, mantendo 100 % de conformidade com as políticas do Google AdSense.

**Architecture:**   
- **Camada de anúncios** – componentes React (`AdInContent`, `StickyAd`) que carregam o script AdSense apenas em páginas de conteúdo editorial.   
- **Camada premium** – rotas protegidas (`/premium`) com autenticação via Firebase Auth e pagamentos via Stripe.   
- **Camada afiliados** – widget `AffiliateLinks` que injeta links com tracking IDs.

**Tech Stack:** React, Node.js/Express, Firebase Auth, Stripe, Prebid.js, Google AdSense.

**Spec:** [docs/superpowers/specs/2026-09-14-monetizacao-avancada-design.md](docs/superpowers/specs/2026-09-14-monetizacao-avancada-design.md)

## Global Constraints
- Não mais que 3 blocos de anúncios por página (conforme política AdSense).
- Sticky ads somente em telas > 768 px e com `max-height: 90px`.
- Área de membros deve ser **sem anúncios**.
- Todos os novos componentes devem ter cobertura de testes unitários ≥ 80 %.
- Usar TypeScript estrito (`strict: true`).

---

### Task 1: Auditoria de Posicionamento Atual
**Files:**
- Create: `scripts/audit_ad_positions.js`

**Interfaces:**
- Produz: `ad_positions_report.json` (lista de slots de anúncios atuais).

- [ ] **Step 1:** Escreva teste que verifica se o script gera um JSON válido.
- [ ] **Step 2:** Implemente o scanner que busca por `adsbygoogle` nos componentes.
- [ ] **Step 3:** Execute e valide o relatório.
- [ ] **Step 4:** Commit `scripts/audit_ad_positions.js`.

### Task 2: Componente `AdInContent`
**Files:**
- Create: `src/components/AdInContent.js`

**Interfaces:**
- Props: `{ adSlotId: string }`
- Consome: `AdSenseLoader` para inserir script se `pageType !== 'listing' && pageType !== 'premium'`.

- [ ] **Step 1:** Teste de renderização com mock de `window.adsbygoogle`.
- [ ] **Step 2:** Implementação do componente (ins tag + push).
- [ ] **Step 3:** Integre ao `Listing` (ex.: a cada 5 itens).
- [ ] **Step 4:** Commit.

### Task 3: Componente `StickyAd`
**Files:**
- Create: `src/components/StickyAd.js`

**Interfaces:**
- Exibe apenas em telas > 768 px e quando `pageType === 'article'` ou `home`.

- [ ] **Step 1:** Teste de renderização condicional (window.innerWidth).
- [ ] **Step 2:** Implementação com CSS `position: sticky`.
- [ ] **Step 3:** Adicione ao layout global (`App.js`).
- [ ] **Step 4:** Commit.

### Task 4: Header Bidding via Prebid.js
**Files:**
- Create: `public/prebid-config.js`
- Modify: `src/components/AdSenseLoader.js` para chamar `window.pbjs.requestBids` antes de `adsbygoogle`.

- [ ] **Step 1:** Teste de existência de `window.pbjs`.
- [ ] **Step 2:** Configuração básica (size 300x250, 728x90).
- [ ] **Step 3:** Integração e validação em staging.
- [ ] **Step 4:** Commit.

### Task 5: Área de Membros Premium
**Files:**
- Create: `src/pages/PremiumPage.js`
- Create: `src/components/MembershipProvider.js`
- Create: `src/utils/stripe.ts`

**Interfaces:**
- Usa Firebase Auth para validar login.
- Usa Stripe Checkout (sessionId) para pagamento.

- [ ] **Step 1:** Teste de rota protegida (redireciona se não autenticado).
- [ ] **Step 2:** Implementação de UI (lista de cifras premium).
- [ ] **Step 3:** Integração Stripe (checkout button).
- [ ] **Step 4:** Atualizar `AdSenseLoader` para `pageType === 'premium'` → não carregar anúncios.
- [ ] **Step 5:** Commit.

### Task 6: Widget de Links Afiliados
**Files:**
- Create: `src/components/AffiliateLinks.js`

**Interfaces:**
- Props: `{ productIds: string[] }`
- Consome: API de afiliados (ex.: Amazon Product Advertising API).

- [ ] **Step 1:** Teste de chamada mockada à API.
- [ ] **Step 2:** Renderiza grid de banners com `data-affiliate-id`.
- [ ] **Step 3:** Inserir widget nas páginas de artigos relevantes.
- [ ] **Step 4:** Commit.

### Task 7: Testes End‑to‑End (Cypress)
**Files:**
- Add: `cypress/integration/monetization_spec.js`

- [ ] **Step 1:** Cenário – Usuário visita artigo e vê `AdInContent` + `StickyAd`.
- [ ] **Step 2:** Cenário – Usuário tenta acessar `/premium` sem login → redirecionamento.
- [ ] **Step 3:** Cenário – Usuário completa checkout Stripe → acesso concedido.
- [ ] **Step 4:** Commit e rodar CI.

## Execução
1. **Subagent‑Driven** – Eu dispararei subagentes individuais para cada task, revisarei resultados e farei commits entre elas.
2. **Checkpoint** – Depois da Task 4 (header bidding) revisaremos métricas de eCPM em staging.
3. **Iteração** – Caso algum teste falhe, corrigiremos antes de prosseguir.

---

**Próximo passo:** Vou iniciar o subagente para **Task 1 – Auditoria de Posicionamento Atual**.
