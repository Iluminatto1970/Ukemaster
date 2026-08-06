/**
 * Traduz o rótulo de dificuldade das músicas/playlists para o idioma ativo.
 *
 * Os dados guardam dificuldade em PT cru ('Simplificado', 'Médio',
 * 'Avançado', e variantes 'fácil'/'médio'/'avançado' do dicionário) — este
 * helper mapeia para as chaves i18n `library.diff*` e cai para o texto
 * original se o valor não for reconhecido.
 */
export function difficultyLabel(t: (k: string) => string, d?: string): string {
  if (!d) return '';
  const norm = d.trim().toLowerCase();
  if (norm.startsWith('simplif')) return t('library.diffSimplified');
  if (norm.startsWith('méd') || norm.startsWith('med')) return t('library.diffMedium');
  if (norm.startsWith('avan') || norm.startsWith('avanz')) return t('library.diffAdvanced');
  if (norm === 'fácil' || norm === 'facil' || norm === 'easy') return t('library.diffSimplified');
  if (norm === 'misto' || norm === 'mixed') return t('library.diffMedium');
  return d;
}
