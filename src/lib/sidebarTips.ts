/**
 * Dicas rotativas de ukulele — fonte ÚNICA usada pelo painel de widgets do
 * lado direito (e antigamente pela sidebar). As dicas são traduzidas via
 * i18n (chaves sidebar.tip1..tip12).
 */
export const UKULELE_TIPS = [
  'sidebar.tip1',
  'sidebar.tip2',
  'sidebar.tip3',
  'sidebar.tip4',
  'sidebar.tip5',
  'sidebar.tip6',
  'sidebar.tip7',
  'sidebar.tip8',
  'sidebar.tip9',
  'sidebar.tip10',
  'sidebar.tip11',
  'sidebar.tip12',
];

/** Dica do dia: estável por data (mesma dica para todos, muda à meia-noite). */
export function getTipOfTheDay(t: (key: string) => string): string {
  const day = new Date().toISOString().slice(0, 10);
  let h = 0;
  for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return t(UKULELE_TIPS[h % UKULELE_TIPS.length]);
}
