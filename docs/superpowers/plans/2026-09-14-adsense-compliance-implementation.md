# AdSense Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adequar o site ukemasterpro.com às políticas de qualidade de conteúdo do Google AdSense, removendo anúncios de páginas de baixo valor e aumentando a densidade de conteúdo original.

**Architecture:** A estratégia foca na segmentação do site: listagens automáticas terão anúncios removidos, enquanto novos conteúdos editoriais de alta qualidade (artigos, tutoriais) serão introduzidos e servirão como âncoras para anúncios.

**Tech Stack:** JavaScript/Node.js, AdSense API, Ferramentas de Auditoria de SEO, Framework Web do projeto.

**Spec:** [docs/superpowers/specs/2026-09-14-adsense-compliance-design.md](docs/superpowers/specs/2026-09-14-adsense-compliance-design.md)

## Global Constraints
- Todo novo conteúdo editorial deve ter no mínimo 300 palavras.
- Listagens automáticas não devem exibir anúncios.
- O site deve manter uma política de privacidade atualizada.

---

### Task 1: Mapeamento de URLs e Classificação
**Files:**
- Create: `scripts/audit_urls.js`
- Test: `tests/test_audit_urls.js`

**Interfaces:**
- Produces: `urls_report.json` (lista de URLs e classificação: 'low_value' | 'high_value')

- [ ] **Step 1: Criar script de mapeamento**
(Script que percorre sitemap ou estrutura de pastas do projeto)

- [ ] **Step 2: Rodar auditoria**
Run: `node scripts/audit_urls.js`

- [ ] **Step 3: Commit**
`git add scripts/audit_urls.js && git commit -m "feat: add URL audit script"`

### Task 2: Implementação de Curadoria e Paginação
**Files:**
- Modify: `src/components/Listing.js`

- [ ] **Step 1: Implementar paginação**
- [ ] **Step 2: Filtrar destaques (popularidade > X)**

### Task 3: Criação de Conteúdo Editorial (Piloto)
**Files:**
- Create: `content/artigos/como-ler-cifras.md`

- [ ] **Step 1: Escrever artigo**

### Task 4: Ajuste de Anúncios (AdSense)
**Files:**
- Modify: `src/components/AdSenseLoader.js`

- [ ] **Step 1: Adicionar lógica de não-exibição em listagens**
`if (pageType === 'listing') return null;`
