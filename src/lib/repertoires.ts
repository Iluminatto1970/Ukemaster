/**
 * Repertório individual do UkeMaster Pro.
 *
 * Regra de negócio: as MÚSICAS são públicas (qualquer usuário publica e todos
 * veem), mas o REPERTÓRIO é individual — cada usuário monta o seu e só ele vê,
 * a menos que opte por torná-lo PÚBLICO (compartilhado com a comunidade).
 *
 * Armazenamento:
 *  - `ukemaster_repertoire_v1_<userId>`  → lista de songIds DO usuário
 *  - `ukemaster_repertoire_v1_<userId>_public` → 'true' | 'false'
 *  - `ukemaster_public_repertoires_v1`   → registro dos repertórios públicos
 *    (mapa userId → { name, songIds, updatedAt }) para a comunidade ver.
 *
 * Futuro: quando o Supabase for configurado, esta camada pode espelhar os dados
 * no Postgres (padrão do src/lib/leads.ts) mantendo o fallback local.
 */

export interface PublicRepertoire {
  userId: string;
  name: string;
  songIds: string[];
  updatedAt: string;
}

const PUBLIC_REGISTRY_KEY = 'ukemaster_public_repertoires_v1';
const LEGACY_REPERTOIRE_KEY = 'ukemaster_repertoire_v1';

export const getRepertoireKey = (userId: string) =>
  `ukemaster_repertoire_v1_${userId || 'guest'}`;

/**
 * Carrega a lista de songIds do usuário. Se não existir ainda e `migrateLegacy`
 * for true, migra o antigo repertório compartilhado (ukemaster_repertoire_v1)
 * para a conta do usuário atual.
 */
export function loadRepertoire(userId: string, migrateLegacy = false): string[] {
  const key = getRepertoireKey(userId);
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as string[];

    if (migrateLegacy) {
      const legacy = localStorage.getItem(LEGACY_REPERTOIRE_KEY);
      if (legacy) {
        const list = JSON.parse(legacy) as string[];
        localStorage.setItem(key, JSON.stringify(list));
        localStorage.removeItem(LEGACY_REPERTOIRE_KEY);
        return list;
      }
    }
  } catch (e) {
    console.error('[repertoire] Erro ao carregar:', e);
  }
  return [];
}

export function saveRepertoire(userId: string, songIds: string[]): void {
  try {
    localStorage.setItem(getRepertoireKey(userId), JSON.stringify(songIds));
  } catch (e) {
    console.error('[repertoire] Erro ao salvar:', e);
  }
}

/** O repertório deste usuário está marcado como público? */
export function loadRepertoirePublic(userId: string): boolean {
  try {
    return localStorage.getItem(getRepertoireKey(userId) + '_public') === 'true';
  } catch {
    return false;
  }
}

export function saveRepertoirePublic(userId: string, isPublic: boolean): void {
  try {
    localStorage.setItem(
      getRepertoireKey(userId) + '_public',
      isPublic ? 'true' : 'false'
    );
  } catch (e) {
    console.error('[repertoire] Erro ao salvar visibilidade:', e);
  }
}

/** Lista os repertórios públicos registrados na comunidade (deste navegador). */
export function getPublicRepertoires(): PublicRepertoire[] {
  try {
    const raw = localStorage.getItem(PUBLIC_REGISTRY_KEY);
    const list: PublicRepertoire[] = raw ? JSON.parse(raw) : [];
    return list.filter((r) => r.songIds.length > 0);
  } catch {
    return [];
  }
}

/** Registra (ou remove, quando null) o repertório público do usuário. */
export function setPublicRepertoire(
  userId: string,
  entry: PublicRepertoire | null
): void {
  try {
    const list = getPublicRepertoires().filter((r) => r.userId !== userId);
    if (entry) list.push(entry);
    localStorage.setItem(PUBLIC_REGISTRY_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[repertoire] Erro no registro público:', e);
  }
}
