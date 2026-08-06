/**
 * Gera o ÍNDICE DE CATÁLOGO do CifraClub (arquivo versionado no repo).
 * Fonte: 98 páginas /estilos/{genero}/ + /mais-acessadas/.
 *
 * Cada entrada: { slug, name, genre, category }
 *  - genre: gênero oficial do CifraClub (ex.: "gospelreligioso")
 *  - category: categoria do UkeMaster mapeada (ex.: "Gospel")
 *
 * Este arquivo é o "estado" que o cron consome. Para detectar mudanças no
 * site, re-rode este script (ou o endpoint /api/sync-catalog) e compare o
 * diff — só processe os artistas novos.
 */
import fs from 'fs';

const GENRE_ARTISTS = 'C:\\Users\\ilumi\\AppData\\Local\\Temp\\genre-artists.tsv';
const MAIS_ACESSADAS = 'C:\\Users\\ilumi\\AppData\\Local\\Temp\\cc-mais.html';
const OUT = 'src/data/cifraclubCatalog.ts';

/**
 * Mapa gênero CifraClub (slug de /estilos/) → categoria do UkeMaster.
 * Categorias do app: MPB, Pop, Rock, Reggae, Gospel, Sertanejo, Infantil,
 * Internacional, Forró, Outros.
 */
const GENRE_TO_CATEGORY = {
  // ── MPB e raízes brasileiras ──────────────────────────────────────────
  mpb: 'MPB',
  'bossa-nova': 'MPB',
  'jovem-guarda': 'MPB',
  'velha-guarda': 'MPB',
  'romantico': 'MPB',
  samba: 'MPB',
  'samba-enredo': 'MPB',
  pagode: 'MPB',
  instrumental: 'MPB',
  // ── Sertanejo e derivados ─────────────────────────────────────────────
  sertanejo: 'Sertanejo',
  arrocha: 'Sertanejo',
  piseiro: 'Sertanejo',
  'brega': 'Sertanejo',
  'brega-funk': 'Sertanejo',
  'musica-de-banda': 'Sertanejo',
  // ── Forró / nordeste ──────────────────────────────────────────────────
  forro: 'Forró',
  xote: 'Forró',
  baião: 'Forró',
  // ── Gospel / religioso ────────────────────────────────────────────────
  gospelreligioso: 'Gospel',
  'marchas-hinos': 'Gospel',
  // ── Pop / dance / urbano ──────────────────────────────────────────────
  pop: 'Pop',
  'hip-hop-rap': 'Pop',
  funk: 'Pop',
  'funk-internacional': 'Pop',
  'k-pop': 'Pop',
  'j-popj-rock': 'Pop',
  dance: 'Pop',
  eletronica: 'Pop',
  house: 'Pop',
  technopop: 'Pop',
  hyperpop: 'Pop',
  disco: 'Pop',
  'new-age': 'Pop',
  'trap': 'Pop',
  'afrobeats': 'Pop',
  axe: 'Pop',
  // ── Rock / metal / alternativo ────────────────────────────────────────
  rock: 'Rock',
  poprock: 'Rock',
  'rock-roll': 'Rock',
  'rock-alternativo': 'Rock',
  'hard-rock': 'Rock',
  'heavy-metal': 'Rock',
  metal: 'Rock',
  'punk-rock': 'Rock',
  grunge: 'Rock',
  emocore: 'Rock',
  hardcore: 'Rock',
  'post-rock': 'Rock',
  progressivo: 'Rock',
  psicodelia: 'Rock',
  industrial: 'Rock',
  gotico: 'Rock',
  'power-pop': 'Rock',
  'new-wave': 'Rock',
  'surf-music': 'Rock',
  rockabilly: 'Rock',
  ska: 'Rock',
  'soft-rock': 'Rock',
  blues: 'Rock',
  'alternativo-indie': 'Rock',
  // ── Reggae ────────────────────────────────────────────────────────────
  reggae: 'Reggae',
  dancehall: 'Reggae',
  // ── Infantil ──────────────────────────────────────────────────────────
  infantil: 'Infantil',
  // ── Internacional / world ─────────────────────────────────────────────
  'world-music': 'Internacional',
  country: 'Internacional',
  folk: 'Internacional',
  jazz: 'Internacional',
  soul: 'Internacional',
  rb: 'Internacional',
  // ── Latinos (ficam em Internacional quando não BR) ────────────────────
  bachata: 'Internacional',
  bolero: 'Internacional',
  cumbia: 'Internacional',
  merengue: 'Internacional',
  salsa: 'Internacional',
  tango: 'Internacional',
  ranchera: 'Internacional',
  mariachi: 'Internacional',
  corridos: 'Internacional',
  vallenato: 'Internacional',
  reggaeton: 'Internacional',
  'zouk': 'Internacional',
  'kizomba': 'Internacional',
  // ── Restante → Outros ─────────────────────────────────────────────────
};

// Artistas em destaque no /mais-acessadas/ (44) — completa os gêneros com
// artistas que a página de gênero não mostra (ex.: muita música gospel e
// católica). Mapeados manualmente ao gênero correto (o mais-acessadas não
// expõe gênero no HTML).
const MAIS_ACESSADAS_GENRE = {
  'adhemar-de-campos': 'gospelreligioso',
  'alessandro-vilas-boas': 'gospelreligioso',
  'aline-barros': 'gospelreligioso',
  'bruno-e-marrone': 'sertanejo',
  'caetano-veloso': 'mpb',
  'cassiane': 'gospelreligioso',
  'charlie-brown-jr': 'rock',
  'chitaozinho-e-xororo': 'sertanejo',
  'comunidade-catolica-colo-de-deus': 'gospelreligioso',
  'comunidade-catolica-shalom': 'gospelreligioso',
  'corinhos-evangelicos': 'gospelreligioso',
  'diante-do-trono': 'gospelreligioso',
  'djavan': 'mpb',
  'felipe-rodrigues': 'gospelreligioso',
  'fernandinho': 'gospelreligioso',
  'florianopolis-house-of-prayer': 'gospelreligioso',
  'frei-gilson': 'gospelreligioso',
  'gabriel-guedes': 'gospelreligioso',
  'gabriela-rocha': 'gospelreligioso',
  'get-worship': 'gospelreligioso',
  'harpa-crista': 'gospelreligioso',
  'henrique-e-juliano': 'sertanejo',
  'hinos-avulsos-ccb': 'gospelreligioso',
  'isaias-saad': 'gospelreligioso',
  'jorge-mateus': 'sertanejo',
  'julliany-souza': 'gospelreligioso',
  'laura-souguellis': 'gospelreligioso',
  'leandro-e-leonardo': 'sertanejo',
  'legiao-urbana': 'rock',
  'luan-santana': 'sertanejo',
  'marilia-mendonca': 'sertanejo',
  'milionario-e-jose-rico': 'sertanejo',
  'ministerio-morada': 'gospelreligioso',
  'nivea-soares': 'gospelreligioso',
  'oasis': 'rock',
  'raul-seixas': 'rock',
  'renascer-praise': 'gospelreligioso',
  'skank': 'rock',
  'thalles-roberto': 'gospelreligioso',
  'the-beatles': 'rock',
  'victor-leo': 'gospelreligioso',
  'voz-da-verdade': 'gospelreligioso',
  'ze-ramalho': 'mpb',
  'zeze-di-camargo-e-luciano': 'sertanejo',
};

function slugToName(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Coleta: páginas de gênero
const bySlug = new Map();
for (const line of fs.readFileSync(GENRE_ARTISTS, 'utf-8').split(/\r?\n/).filter(Boolean)) {
  const [genre, slug] = line.split('\t');
  if (!slug || !genre) continue;
  if (!bySlug.has(slug)) bySlug.set(slug, { slug, name: slugToName(slug), genre, source: 'genero' });
}

// Completa com /mais-acessadas/
const maisHtml = fs.readFileSync(MAIS_ACESSADAS, 'utf-8');
const maisRe = /href="\/([a-z0-9][a-z0-9-]*)\/"/g;
let m;
while ((m = maisRe.exec(maisHtml))) {
  const slug = m[1];
  if (bySlug.has(slug) || !MAIS_ACESSADAS_GENRE[slug]) continue;
  bySlug.set(slug, { slug, name: slugToName(slug), genre: MAIS_ACESSADAS_GENRE[slug], source: 'mais-acessadas' });
}

// Categoria: prioriza mapa explícito de artista quando houver; senão gênero
const entries = [...bySlug.values()].map((e) => ({
  slug: e.slug,
  name: e.name,
  genre: e.genre,
  category: GENRE_TO_CATEGORY[e.genre] || 'Outros',
}));

// Ordena ALFABETICAMENTE por slug — fila estável e neutra (sem priorizar
// categoria alguma; a rotação justa do cron cobre tudo igualmente).
entries.sort((a, b) => a.slug.localeCompare(b.slug));

// Agrupa por categoria para o comentário do arquivo
const byCat = {};
for (const e of entries) byCat[e.category] = (byCat[e.category] || 0) + 1;

const header = `/**
 * ÍNDICE DE CATÁLOGO do CifraClub — gerado por scripts/build-catalog.mjs.
 * NÃO edite à mão: rode o script (ou o endpoint /api/sync-catalog) quando
 * quiser re-sincronizar com o site.
 *
 * Fonte: páginas /estilos/{genero}/ (98 gêneros) + /mais-acessadas/.
 * Distribuição: ${Object.entries(byCat).map(([c, n]) => `${c} ${n}`).join(' · ')}
 *
 * O cron de plataformas usa este índice como fila; a categoria aqui define
 * a categoria final de cada música importada (fallback: inferCategory).
 */

export interface CifraClubArtist {
  slug: string;
  name: string;
  /** Gênero oficial do CifraClub (slug de /estilos/). */
  genre: string;
  /** Categoria do UkeMaster derivada do gênero. */
  category: string;
}

export const CIFRACLUB_CATALOG: CifraClubArtist[] = [
${entries
  .map((e) => `  { slug: '${e.slug}', name: '${e.name.replace(/'/g, "\\'")}', genre: '${e.genre}', category: '${e.category}' },`)
  .join('\n')}
];

/** Índice por slug (para lookup rápido). */
export const CIFRACLUB_CATALOG_BY_SLUG = new Map(
  CIFRACLUB_CATALOG.map((a) => [a.slug, a])
);
`;

fs.writeFileSync(OUT, header, 'utf-8');
console.log(`Salvo: ${OUT} (${entries.length} artistas)`);
console.log('Por categoria:', byCat);
