# Monetização por anúncios — lógica reutilizável (adaptada do projeto Planilha Beto Feijó)

> Documento de referência com a lógica de anúncios **testada em produção** no app
> Planilha Beto Feijó (Adsterra). O objetivo é monetizar **sem atrapalhar o uso**:
> anúncios automáticos com limite por intervalo, um pedido visual (banner de apoio)
> e um slot de banner fixo para impressões passivas. Adapte os nomes, URLs e zone IDs
> para o UkeMaster.
>
> **Regra de transição (aplicada, igual ao SistemaPainho):** a Monetag continua no
> ar **até o Google AdSense ser aprovado**. Tudo já está pronto para a troca: a chave
> `ADSENSE_APPROVED` em `src/config.ts` (hoje `false`) desliga toda a Monetag de uma
> vez (Monetag.tsx + vignette do intersticial) — quando o site ficar READY no painel
> do AdSense, basta virá-la para `true`.

---

## 1. Visão geral das superfícies de anúncio

| Superfície | Formato | Frequência | Invasividade |
|---|---|---|---|
| **Banner de apoio no topo** | Barra discreta pedindo para ver um anúncio (botão ▶ + ✕) | Aparece ao abrir; some quando um anúncio da sessão já foi entregue ou ao fechar | Nenhuma (é só um pedido) |
| **Intersticial automático** | Anúncio em tela cheia (zona intersticial/popup da Adsterra) | **No máximo 1 a cada 30 min de uso** (constante configurável) | Baixa (limitado por intervalo, dispara ~5s após abrir) |
| **Banner fixo no rodapé** | Zona **banner** da Adsterra renderizando continuamente | O dia todo (impressões passivas) | Mínima (não cobre conteúdo) |
| **Tag na landing** | Página pública (marketing) com a tag da rede | Contínua para visitantes | Fora do app — não afeta o uso |

**Regra de ouro:** nenhuma rede de anúncios é carregada no app **até o momento em que é
necessária** (no disparo automático ou no clique do banner). Nada de tag global no
`<head>` da página do app, nada de push notifications.

---

## 2. Setup na Adsterra (uma vez)

1. **Crie uma conta** em adsterra.com e adicione o site (ex.: `ukemaster.com`).
2. **Verificação do site:**
   - Método do service worker (para zonas push) ou arquivo especial na raiz.
   - ⚠️ **Nunca deixe o service worker da Adsterra substituir o do app** — ele quebra
     offline, cache e atualização automática do PWA. Se a zona for push, o SW da rede
     é necessário, mas avalie se o formato push vale o incômodo.
3. **Crie as zonas:**
   - **Zona intersticial/popunder** → usada no disparo automático (a cada 30 min).
   - **Zona banner** → usada no slot fixo do rodapé (recomendada, melhor volume).
4. **Copie as tags** (cada zona gera uma tag `<script ... data-zone="...">`).

---

## 3. Código — HTML

Coloque os elementos no corpo da página do app (antes do `<script>` principal):

```html
<!-- Banner de apoio no topo: pede para ver um anúncio e manter o projeto grátis -->
<div id="supportBanner" class="support-banner" hidden>
  <span class="sb-text">💙 Este app é <b>100% grátis</b> para sempre — veja um anúncio rápido e ajude a mantê-lo no ar!</span>
  <button type="button" id="btnSupportWatch" class="primary">▶ Ver anúncio</button>
  <button type="button" id="btnSupportClose" class="sb-close" title="Fechar">✕</button>
</div>

<!-- Slot do banner fixo no rodapé (zona banner). Fica OCULTO até BANNER_ZONE_TAG
     ser preenchido no JS — aí renderiza o banner continuamente, sem tela cheia. -->
<div id="bannerSlot" class="banner-slot" hidden>
  <div id="bannerSlotInner">Espaço reservado para o banner de anúncio.</div>
</div>
```

> ⚠️ **Atenção:** o comentário acima **não** contém o texto literal `</script>`.
> Escrever `</script>` dentro de um comentário/string JS **corta o script inteiro**
> no navegador (o parser HTML encerra o elemento ali). Escreva "a tag de script" ou
> `&lt;/script&gt;` em texto, nunca o literal.

---

## 4. Código — CSS

```css
/* ---- Banner de apoio no topo ---- */
.support-banner {
  margin: 0 20px 10px;
  padding: 9px 14px;
  background: linear-gradient(135deg, #eef4fb, #e7eff9);
  border: 1px solid #b9cfe8;
  border-radius: 10px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.support-banner .sb-text { flex: 1; min-width: 200px; }
.support-banner .sb-text b { color: var(--accent); }
.support-banner .sb-close {
  background: none; border: none; color: var(--muted);
  font-size: 15px; cursor: pointer; padding: 0 2px; line-height: 1;
}

/* ---- Slot do banner fixo no rodapé ---- */
.banner-slot {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
  background: #fff; border-top: 1px solid var(--line);
  display: flex; justify-content: center; align-items: center;
  min-height: 60px; padding: 4px 10px; box-sizing: border-box;
}
/* ⚠️ OBRIGATÓRIO: display:flex sobrescreve o atributo hidden do HTML.
   Sem esta regra, o slot aparece mesmo com `hidden`. */
.banner-slot[hidden] { display: none; }
.banner-slot > div { max-width: 100%; text-align: center; font-size: 12px; color: var(--muted); }
body.banner-on .table-wrap { padding-bottom: 76px; } /* não esconde conteúdo atrás do banner */

/* Mobile */
@media (max-width: 640px) {
  .support-banner { margin: 0 6px 8px; font-size: 12px; }
  .banner-slot { min-height: 50px; }
  body.banner-on .table-wrap { padding-bottom: 60px; }
}
```

---

## 5. Código — JavaScript (núcleo da lógica)

```js
// ================== CONFIGURAÇÃO ==================
// Intervalo do anúncio intersticial automático (ajuste aqui):
// 30 min = 30 * 60 * 1000 · 1h = 60 * 60 * 1000 · 1x/dia = 24 * 60 * 60 * 1000
var AD_INTERVAL_MS = 30 * 60 * 1000;

// Tag da zona BANNER da Adsterra. Deixe '' para manter o slot do rodapé oculto.
// Quando a zona banner existir, cole aqui a tag de script com src + data-zone.
// ⚠️ Não escreva o fechamento literal </script> em comentários — só na tag real.
var BANNER_ZONE_TAG = '';

// Tags das zonas (troque pelos zone IDs do UkeMaster):
var AD_TAG_SRC = 'https://quge5.com/88/tag.min.js';   // zona intersticial/popunder
var AD_TAG_ZONE = '268662';
// ===================================================

// Carrega a rede de anúncios (cada chamada injeta a tag e dispara o anúncio).
function loadAdTag() {
  var s = document.createElement('script');
  s.src = AD_TAG_SRC;
  s.setAttribute('data-zone', AD_TAG_ZONE);
  s.setAttribute('async', '');
  s.setAttribute('data-cfasync', 'false');
  document.body.appendChild(s);
}

// Entrega um anúncio agora: grava o horário, marca a sessão e carrega a rede.
function deliverAd() {
  try { localStorage.setItem('ad_last', String(Date.now())); } catch (e) {}
  try { sessionStorage.setItem('ad_shown_session', '1'); } catch (e) {}
  loadAdTag();
  var b = document.getElementById('supportBanner');
  if (b) b.hidden = true; // já viu — dispensa o pedido do banner
}

// No início: entrega 1 anúncio ~5s após abrir, SE o intervalo já passou.
function maybeScheduleAutoAd() {
  try {
    var last = parseInt(localStorage.getItem('ad_last') || '0', 10) || 0;
    if (Date.now() - last < AD_INTERVAL_MS) return;
    setTimeout(deliverAd, 5000);
  } catch (e) {}
}

// Enquanto o app fica aberto, repete a cada AD_INTERVAL_MS de uso contínuo.
setInterval(function () {
  try {
    var last = parseInt(localStorage.getItem('ad_last') || '0', 10) || 0;
    if (Date.now() - last >= AD_INTERVAL_MS) deliverAd();
  } catch (e) {}
}, AD_INTERVAL_MS);

// Banner de apoio no topo: some se o anúncio da sessão já foi entregue,
// se o usuário clicou em "Ver anúncio" ou se fechou (fica fechado na sessão).
function showSupportBanner() {
  try {
    var banner = document.getElementById('supportBanner');
    if (!banner) return;
    if (sessionStorage.getItem('ad_shown_session')) return;
    if (sessionStorage.getItem('ad_dismissed')) return;
    banner.hidden = false;
  } catch (e) {}
}

document.getElementById('btnSupportWatch').addEventListener('click', function () {
  deliverAd(); // anúncio real na hora (o intervalo vale para os automáticos)
  document.getElementById('supportBanner').hidden = true;
});
document.getElementById('btnSupportClose').addEventListener('click', function () {
  try { sessionStorage.setItem('ad_dismissed', '1'); } catch (e) {}
  document.getElementById('supportBanner').hidden = true;
});

// Slot do banner no rodapé: ativo somente quando BANNER_ZONE_TAG estiver preenchido.
function initBannerSlot() {
  var slot = document.getElementById('bannerSlot');
  if (!slot || !BANNER_ZONE_TAG) return;
  var inner = document.getElementById('bannerSlotInner');
  if (inner) inner.innerHTML = BANNER_ZONE_TAG;
  slot.hidden = false;
  try { document.body.classList.add('banner-on'); } catch (e) {}
}

// Chamar na inicialização do app (após renderizar a tela):
//   maybeScheduleAutoAd();
//   initBannerSlot();
//   showSupportBanner();
```

**Por que `localStorage` + `sessionStorage`?**
- `localStorage` (persiste entre sessões): guarda o **horário do último anúncio** — é o
  que faz o intervalo de 30 min valer mesmo fechando e reabrindo o app.
- `sessionStorage` (morre ao fechar a aba): controla o que vale **por sessão** — o banner
  de apoio só pede 1× e não reaparece em recarregamentos da mesma sessão.

---

## 6. Aprendizados (pitfalls que custaram tempo — não repetir)

1. **`</script>` literal dentro de comentário/string JS quebra a página inteira.**
   O parser HTML do navegador encerra o elemento `<script>` na primeira ocorrência de
   `</script>`, mesmo que esteja dentro de um comentário. O erro aparece como
   `SyntaxError: Unexpected end of input`. Nunca escreva o literal em comentários;
   use "a tag de script" ou `&lt;/script&gt;`.

2. **`display: flex` sobrescreve o atributo `hidden`.**
   Qualquer elemento com `display` definido no CSS ignora o `hidden` do HTML.
   Sempre adicione a regra `[hidden] { display: none; }` específica do elemento
   (ex.: `.banner-slot[hidden]`).

3. **O service worker da rede de anúncios substitui o do app.**
   O SW da Adsterra (push) apaga o "rede-primeiro", o cache offline e a atualização
   automática do PWA — foi a causa de celulares presos em versões antigas.
   **Mantenha o SW do app.** A tag no HTML é suficiente para zonas intersticial e banner.

4. **Zonas intersticiais/popup abrem tela cheia mesmo carregadas "sob demanda".**
   Se a zona for intersticial, o anúncio aparece em tela cheia sempre que a tag roda.
   Para algo verdadeiramente discreto e contínuo, use **zona banner** no rodapé.

5. **Nunca carregue a rede no `<head>` das páginas de uso do app.**
   Tag global = anúncios/popups a qualquer momento. Carregue só no momento do
   disparo automático ou do clique no banner. A landing pública pode ter a tag.

6. **Bump de versão do app + guarda de cache** para o celular sair de versões antigas
   (cache do SW) — senão o usuário continua vendo o app velho sem os anúncios novos.

---

## 7. Checklist de adaptação para o UkeMaster

- [ ] Trocar `AD_TAG_SRC` / `AD_TAG_ZONE` pelos zone IDs do UkeMaster.
- [ ] Definir `AD_INTERVAL_MS` (30 min sugerido; 1×/dia se houver banner ativo).
- [ ] Criar a zona **banner** na Adsterra e preencher `BANNER_ZONE_TAG` para ativar o rodapé.
- [ ] Trocar `var(--accent)`/`var(--line)`/`var(--muted)`/`.table-wrap` pelos nomes de
      variáveis/container do UkeMaster.
- [ ] Chamar `maybeScheduleAutoAd(); initBannerSlot(); showSupportBanner();` no init do app.
- [ ] Manter o service worker do UkeMaster intacto (não deixar o da rede assumir).
- [ ] Colocar a tag da rede **só na landing pública** (página de marketing), não no app.
- [ ] Testar: intervalo não passado = sem anúncio; intervalo passado = dispara ~5s;
      banner de apoio some ao entregar/ao fechar; slot do rodapé oculto sem tag.
