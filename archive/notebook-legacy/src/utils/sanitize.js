// src/utils/sanitize.js

/**
 * Converte caracteres especiais em entidades HTML para evitar XSS.
 * Ex.: <script> → &lt;script&gt;
 *
 * @param {string} str
 * @returns {string}
 */
export function encodeEntities(str) {
  if (typeof str !== 'string') return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Valida se uma URL é segura (não contém javascript: ou data:).
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) return false;
  return true;
}