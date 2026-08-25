/**
 * Sistema de A/B Testing para posições de anúncio.
 *
 * Objetivo: descobrir quais slots e posições geram mais receita (eCPM)
 * sem prejudicar a experiência do usuário.
 *
 * Como funciona:
 *  1. Cada teste define variantes (ex: "sticky_show" vs "sticky_hide")
 *  2. Na primeira visita, o usuário é atribuído aleatoriamente a uma variante
 *  3. A atribuição é persistida em localStorage (consistente entre sessões)
 *  4. Os eventos de GA4 incluem a variante como parâmetro customizado
 *  5. Para analisar: GA4 → Explorar → filtrar por `ab_test` + `ab_variant`
 *
 * Para ativar/desativar testes: mude `ENABLED` para false ou remova o teste.
 * Para forçar uma variante: use `?ab_force=variant_name` na URL.
 *
 * ⚠️ REGRAS DO ADSENSE:
 *  - NÃO podemos servir ads diferentes em pages diferentes do mesmo usuário
 *  - NÃO podemos usar cookies de targeting sem consentimento
 *  - O teste é por USUÁRIO (localStorage), não por página
 *  - Todas as variantes veem o MESMO conteúdo editorial
 */

// ── Configuração ────────────────────────────────────────────────────────────

/** Ativar/desativar todos os testes (false = todos veem a variante "control") */
const TESTS_ENABLED = true;

/** Chave do localStorage para persistir atribuições */
const STORAGE_KEY = 'ukemaster_ab_tests_v1';

/** Forçar variante via URL: ?ab_force=sticky_hide */
function getForcedVariant(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('ab_force');
}

// ── Definições dos Testes ───────────────────────────────────────────────────

export interface AbTest {
  /** ID único do teste (usado no GA4 como `ab_test`) */
  id: string;
  /** Descrição humana (para documentação) */
  description: string;
  /** Variantes disponíveis */
  variants: string[];
  /** Peso de cada variante (padrão: igual) */
  weights?: number[];
}

/**
 * Lista de todos os testes ativos.
 *
 * IMPORTANTE: ao adicionar/remover testes, a atribuição de usuários
 * existentes pode mudar. Use IDs estáveis e nunca reutilize IDs antigos.
 */
export const AB_TESTS: AbTest[] = [
  {
    id: 'sticky_ad',
    description: 'Ad âncora (sticky bottom) — mostrar vs esconder no mobile',
    variants: ['control', 'hide'],
    // control = sticky visível (comportamento atual)
    // hide = sticky escondido (testa se a receita cai sem ele)
  },
  {
    id: 'sidebar_ad',
    description: 'Ad sidebar — mostrar vs esconder no desktop',
    variants: ['control', 'hide'],
    // control = sidebar com ad (comportamento atual)
    // hide = sidebar sem ad (testa se o ad sidebar vale a pena)
  },
  {
    id: 'feed_ad_position',
    description: 'Posição do ad no feed da lista de músicas',
    variants: ['early', 'late', 'none'],
    // early = ad aparece na 8ª posição (atual)
    // late = ad aparece na 16ª posição (mais conteúdo antes do ad)
    // none = sem ad no feed (testa receita total vs sidebar+sticky)
  },
  {
    id: 'multiplex_ad',
    description: 'Ad multiplex no final da cifra — mostrar vs esconder',
    variants: ['control', 'hide'],
    // control = multiplex visível (comportamento atual)
    // hide = multiplex escondido (testa se adiciona receita ou só peso)
  },
];

// ── Gerenciamento de Atribuição ─────────────────────────────────────────────

type AbAssignments = Record<string, string>;

function loadAssignments(): AbAssignments {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAssignments(assignments: AbAssignments): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // localStorage cheio ou bloqueado — segue sem persistir
  }
}

/**
 * Gera um número aleatório entre 0 e 1.
 * Usa crypto.getRandomValues se disponível (mais seguro que Math.random).
 */
function random(): number {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xFFFFFFFF + 1);
}

/**
 * Atribui o usuário a uma variante para um teste específico.
 * Persiste em localStorage para ser consistente entre sessões.
 */
function assignVariant(test: AbTest): string {
  // Forçar variante via URL (debug/demonstração)
  const forced = getForcedVariant();
  if (forced && test.variants.includes(forced)) return forced;

  // Se testes desativados, retorna a primeira variante (control)
  if (!TESTS_ENABLED) return test.variants[0];

  // Carregar atribuições existentes
  const assignments = loadAssignments();

  // Se já atribuído, retornar
  if (assignments[test.id]) return assignments[test.id];

  // Atribuição aleatória (peso igual)
  const rand = random();
  const variantCount = test.variants.length;
  const index = Math.floor(rand * variantCount);
  const variant = test.variants[index];

  // Persistir
  assignments[test.id] = variant;
  saveAssignments(assignments);

  return variant;
}

// ── API Pública ─────────────────────────────────────────────────────────────

/**
 * Obtém a variante atribuída para um teste.
 * Se o teste não existe ou está desativado, retorna a primeira variante.
 *
 * Uso:
 *   const variant = getAbVariant('sticky_ad');
 *   if (variant === 'control') { render sticky ad }
 */
export function getAbVariant(testId: string): string {
  const test = AB_TESTS.find((t) => t.id === testId);
  if (!test) return 'control';
  return assignVariant(test);
}

/**
 * Verifica se a variante atual é a "control" (padrão).
 * Útil para testes binários (show vs hide).
 */
export function isControl(testId: string): boolean {
  return getAbVariant(testId) === 'control';
}

/**
 * Retorna todas as atribuições do usuário (para debug/audit).
 */
export function getAllAssignments(): AbAssignments {
  return loadAssignments();
}

/**
 * Reseta todas as atribuições (para testes).
 * Disponível apenas em development.
 */
export function resetAllTests(): void {
  if (import.meta.env.DEV) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Retorna a lista de testes ativos com suas variantes atuais.
 * Útil para debug e documentação.
 */
export function getActiveTests(): Array<{
  id: string;
  description: string;
  variant: string;
}> {
  return AB_TESTS.map((test) => ({
    id: test.id,
    description: test.description,
    variant: getAbVariant(test.id),
  }));
}
