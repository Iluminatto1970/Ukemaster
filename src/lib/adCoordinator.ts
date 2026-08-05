/**
 * Coordenador global de anúncios — garante que overlays (intersticial
 * próprio, vignette Monetag, popups) NUNCA abram dois ao mesmo tempo.
 *
 * O App.tsx marca o overlay como ativo quando abre o intersticial próprio
 * e como inativo quando ele fecha. O Monetag.tsx consulta
 * `isAdOverlayBusy()` antes de injetar os scripts agressivos (vignette) e
 * espera o overlay liberar para então injetar.
 */

let activeOverlays = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

/** Marca que um overlay de anúncio está em exibição (ex.: intersticial). */
export function markAdOverlayActive() {
  activeOverlays++;
  emit();
}

/** Marca que o overlay terminou (fechou/pulou). */
export function markAdOverlayIdle() {
  activeOverlays = Math.max(0, activeOverlays - 1);
  emit();
}

/** true se há algum overlay de anúncio aberto no momento. */
export function isAdOverlayBusy(): boolean {
  return activeOverlays > 0;
}

/** Assina mudanças de ocupação; retorna função para cancelar a assinatura. */
export function onAdOverlayChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
