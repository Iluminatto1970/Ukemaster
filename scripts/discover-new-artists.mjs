#!/usr/bin/env node
/**
 * UkeMaster Pro — descobre artistas NOVOS no CifraClub e atualiza o catálogo.
 *
 * O cron varre a fila estática (src/data/cifraclubCatalog.ts, ~667 artistas).
 * Artistas criados/aceitos no site depois da geração ficam fora da fila para
 * sempre. Este script fecha o ciclo: extrai TODOS os artistas dos sitemaps
 * oficiais de cifras (fonte da verdade, ~1 mi de URLs) e compara com o
 * catálogo do app e com o índice de sitemaps.
 *
 * Fonte: sitemaps oficiais (robots.txt → /gcs/sitemap/sitemap_cifras_N.xml.gz).
 * Cache local em $TMP; o download NÃO passa pelas páginas HTML do site
 * (não sofre o bloqueio Akamai de IP — verificado em 26/09/2026; os XMLs
 * de /gcs/ respondem 200 mesmo com o HTML bloqueado, via node/fetch).
 *
 * Uso:
 *   node scripts/discover-new-artists.mjs                # só reporta (dry-run)
 *   node scripts/discover-new-artists.mjs --aplicar      # atualiza catálogo + índice
 *   node scripts/discover-new-artists.mjs --csv          # gera docs/artistas-novos-<data>.csv|.md
 *   SITEMAP_CACHE_DIR=/tmp/x node ...                    # cache de XMLs crus do scraper
 *   CIFRACLUB_SITEMAP_CACHE=/tmp/gz node ...             # cache de .gz do rebuild
 *
 * Após --aplicar: rode `npx tsc --noEmit` e `npm run build:cron` (o bundle do
 * worker embute o catálogo e o índice) e faça commit dos dois .ts.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CATALOG_FILE = path.join(ROOT, 'src/data/cifraclubCatalog.ts');
const INDEX_FILE = path.join(ROOT, 'src/data/cifraclubSitemapIndex.ts');
const DOCS_DIR = path.join(ROOT, 'docs');

// Caches: XMLs crus do scraper (fetchSitemapCifrasXml) e .gz do rebuild.
const SCRAPER_CACHE = process.env.SITEMAP_CACHE_DIR || path.join(os.tmpdir(), 'cifraclub-sitemaps');
const GZ_CACHE = process.env.CIFRACLUB_SITEMAP_CACHE || path.join(os.tmpdir(), 'cifraclub-sitemap-cache');
const BASE = 'https://www.cifraclub.com.br';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const args = process.argv.slice(2);
const APLICAR = args.includes('--aplicar');
const GERAR_CSV = args.includes('--csv');
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
// A fila do cron é o catálogo — receber 134 mil artistas obscuros de 1-2
// músicas faria a rotação nunca terminar. Só entram artistas com um mínimo
// de músicas publicadas (o CSV guarda TODOS os novos para decisão futura).
const MIN_MUSICAS = parseInt(getOpt('--min-musicas', APLICAR ? '50' : '0'), 10);
const HOJE = new Date().toISOString().slice(0, 10);

// ── Mapa gênero→categoria — cópia do build-catalog.mjs (fonte única de     ──
// ── verdade está em scripts/build-catalog.mjs; manter em sincronia)        ──
const GENRE_TO_CATEGORY = {
  mpb: 'MPB', 'bossa-nova': 'MPB', 'jovem-guarda': 'MPB', 'velha-guarda': 'MPB',
  romantico: 'MPB', samba: 'MPB', 'samba-enredo': 'MPB', pagode: 'MPB', instrumental: 'MPB',
  sertanejo: 'Sertanejo', arrocha: 'Sertanejo', piseiro: 'Sertanejo', brega: 'Sertanejo',
  'brega-funk': 'Sertanejo', 'musica-de-banda': 'Sertanejo',
  forro: 'Forró', xote: 'Forró', 'baião': 'Forró',
  gospelreligioso: 'Gospel', 'marchas-hinos': 'Gospel',
  pop: 'Pop', 'hip-hop-rap': 'Pop', funk: 'Pop', 'funk-internacional': 'Pop', 'k-pop': 'Pop',
  'j-popj-rock': 'Pop', dance: 'Pop', eletronica: 'Pop', house: 'Pop', technopop: 'Pop',
  hyperpop: 'Pop', disco: 'Pop', 'new-age': 'Pop', trap: 'Pop', afrobeats: 'Pop', axe: 'Pop',
  rock: 'Rock', poprock: 'Rock', 'rock-roll': 'Rock', 'rock-alternativo': 'Rock',
  'hard-rock': 'Rock', 'heavy-metal': 'Rock', metal: 'Rock', 'punk-rock': 'Rock',
  grunge: 'Rock', emocore: 'Rock', hardcore: 'Rock', 'post-rock': 'Rock',
  progressivo: 'Rock', psicodelia: 'Rock', industrial: 'Rock', gotico: 'Rock',
  'power-pop': 'Rock', 'new-wave': 'Rock', 'surf-music': 'Rock', rockabilly: 'Rock',
  ska: 'Rock', 'soft-rock': 'Rock', blues: 'Rock', 'alternativo-indie': 'Rock',
  reggae: 'Reggae', dancehall: 'Reggae',
  infantil: 'Infantil',
  'world-music': 'Internacional', country: 'Internacional', folk: 'Internacional',
  jazz: 'Internacional', soul: 'Internacional', rb: 'Internacional',
  bachata: 'Internacional', bolero: 'Internacional', cumbia: 'Internacional',
  merengue: 'Internacional', salsa: 'Internacional', tango: 'Internacional',
  ranchera: 'Internacional', mariachi: 'Internacional', corridos: 'Internacional',
  vallenato: 'Internacional', reggaeton: 'Internacional', zouk: 'Internacional',
  kizomba: 'Internacional',
};

// Gêneros conhecidos de artistas novos relevantes (o sitemap não expõe gênero;
// estes são mapeados manualmente — o resto entra como Outros e pode ser
// refinado re-executando scripts/build-catalog.mjs, que lê /estilos/).
const GENRE_MANUAL = {
  'harpa-crista': 'gospelreligioso',
  'hinos-avulsos-ccb': 'gospelreligioso',
  'corinhos-evangelicos': 'gospelreligioso',
  'caprichoso-boi-bumba': '',
  'garantido': '',
};

// ── 1) Catálogo atual (mesma regex da auditoria — formato estável) ──────────
function loadCatalog() {
  const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
  const out = [];
  const re = /\{\s*slug:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*genre:\s*'([^']*)',\s*category:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(raw))) out.push({ slug: m[1], name: m[2].replace(/\\'/g, "'"), genre: m[3], category: m[4] });
  if (out.length === 0) throw new Error('catálogo vazio — formato mudou?');
  return out;
}

// ── 2) Índice atual (CIFRACLUB_SITEMAP_INDEX_RAW) ────────────────────────────
function loadIndexRaw() {
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  const m = raw.match(/CIFRACLUB_SITEMAP_INDEX_RAW\s*=\s*\n?\s*'(.*)';/s);
  if (!m) throw new Error('CIFRACLUB_SITEMAP_INDEX_RAW não encontrado — formato mudou?');
  return JSON.parse(m[1]);
}

// ── 3) Sitemaps com cache em 3 níveis: XML cru → .gz → download ──────────────
async function cachedText(name, url) {
  const xmlPath = path.join(SCRAPER_CACHE, name);        // sitemap_cifras_N.xml
  const gzPath = path.join(GZ_CACHE, name + '.gz');      // sitemap_cifras_N.xml.gz
  if (fs.existsSync(xmlPath)) return fs.readFileSync(xmlPath, 'utf8');
  if (fs.existsSync(gzPath)) {
    const buf = fs.readFileSync(gzPath);
    return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
      ? gunzipSync(buf).toString('utf8')
      : buf.toString('utf8');
  }
  process.stdout.write(`baixando ${url}\n`);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(GZ_CACHE, { recursive: true });
  fs.writeFileSync(gzPath, buf);
  // O servidor às vezes entrega o ".gz" JÁ DESCOMPRIMIDO — decide pelos magic bytes.
  return buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
    ? gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
}

async function fetchSitemapCount() {
  const xml = await cachedText('sitemap_index.xml', `${BASE}/gcs/sitemap/sitemap_index.xml`);
  const nums = [...xml.matchAll(/sitemap_cifras_(\d+)\.xml\.gz/g)].map((m) => Number(m[1]));
  if (nums.length === 0) throw new Error('nenhum sitemap_cifras no índice remoto — formato mudou?');
  return Math.max(...nums);
}

// ── Execução ─────────────────────────────────────────────────────────────────
const totalArquivos = await fetchSitemapCount();
const sitemapArtistas = Object.create(null);   // slug → Set(nº dos arquivos)
const musicasPorArtista = Object.create(null); // slug → nº de URLs de música
for (let n = 1; n <= totalArquivos; n++) {
  const xml = await cachedText(`sitemap_cifras_${n}.xml`, `${BASE}/gcs/sitemap/sitemap_cifras_${n}.xml.gz`);
  // Só URLs de MÚSICA: /artista/musica/ (2 segmentos; exclui .html, /detalhes/…)
  const re = /<loc>https:\/\/www\.cifraclub\.com\.br\/([a-z0-9-]+)\/([a-z0-9-]+)\/<\/loc>/g;
  let m, count = 0;
  while ((m = re.exec(xml)) !== null) {
    const artist = m[1];
    (sitemapArtistas[artist] ||= new Set()).add(n);
    musicasPorArtista[artist] = (musicasPorArtista[artist] || 0) + 1;
    count++;
  }
  process.stdout.write(`  sitemap ${n}/${totalArquivos}: ${String(count).padStart(6)} músicas\r`);
}
process.stdout.write('\n');
const slugsSitemap = Object.keys(sitemapArtistas).sort();

// ── 4) Diff ──────────────────────────────────────────────────────────────────
const catalogo = loadCatalog();
const catalogoSlugs = new Set(catalogo.map((a) => a.slug));
const indexAtual = loadIndexRaw();
const indexSlugs = new Set(Object.keys(indexAtual));

const novos = slugsSitemap.filter((s) => !catalogoSlugs.has(s));
const foraDoIndice = slugsSitemap.filter((s) => !indexSlugs.has(s));
const zumbisCatalogo = catalogo.filter((a) => !sitemapArtistas[a.slug]).map((a) => a.slug);
const zumbisIndice = [...indexSlugs].filter((s) => !sitemapArtistas[s]).sort();

console.log(`Sitemaps: ${totalArquivos} arquivos · artistas no site: ${slugsSitemap.length}`);
console.log(`Catálogo do app: ${catalogo.length} · índice de sitemaps: ${indexSlugs.size}`);
console.log(`NOVOS (fora do catálogo): ${novos.length}`);
// Curva de corte: quantos novos entram na fila conforme o mínimo de músicas.
for (const min of [5, 10, 25, 50, 100]) {
  const q = novos.filter((s) => (musicasPorArtista[s] || 0) >= min).length;
  console.log(`  novos com >= ${String(min).padStart(3)} músicas: ${String(q).padStart(6)}${min === MIN_MUSICAS ? '  ← corte aplicado' : ''}`);
}
console.log(`No site mas fora do índice: ${foraDoIndice.length} (o índice recebe TODOS — só o catálogo é filtrado)`);
console.log(`Zumbis no catálogo (sumiram do site): ${zumbisCatalogo.length}${zumbisCatalogo.length ? ' → ' + zumbisCatalogo.slice(0, 10).join(', ') : ''}`);
console.log(`Zumbis no índice: ${zumbisIndice.length}`);

// ── 5) Relatórios opcionais (--csv) ──────────────────────────────────────────
if (GERAR_CSV && novos.length > 0) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const csv = ['slug,musicas,arquivos_sitemap', ...novos.map((s) => `${s},${musicasPorArtista[s] || 0},${[...sitemapArtistas[s]].sort((a, b) => a - b).join('+')}`)].join('\n') + '\n';
  const csvFile = path.join(DOCS_DIR, `artistas-novos-${HOJE}.csv`);
  fs.writeFileSync(csvFile, csv);
  const top = [...novos].sort((a, b) => (musicasPorArtista[b] || 0) - (musicasPorArtista[a] || 0)).slice(0, 25);
  const md = `# Artistas novos no CifraClub (${HOJE})\n\n- Novos: **${novos.length}** (fora do catálogo de ${catalogo.length})\n- Top por nº de músicas: ${top.map((s) => `${s} (${musicasPorArtista[s]})`).join(', ')}\n\nCSV: docs/artistas-novos-${HOJE}.csv\n`;
  fs.writeFileSync(path.join(DOCS_DIR, `artistas-novos-${HOJE}.md`), md);
  console.log(`relatórios: ${csvFile} + .md`);
}

if (novos.length === 0 && foraDoIndice.length === 0) {
  console.log('Nada a atualizar — catálogo e índice já cobrem o site inteiro.');
  process.exit(0);
}
if (!APLICAR) {
  console.log('\n(dry-run: rode com --aplicar para atualizar os arquivos; --csv para relatórios)');
  process.exit(0);
}

// ── 6) Aplicar: 6a. ÍNDICE (regenera no mesmo formato do rebuild) ────────────
const merged = { ...indexAtual };
for (const s of slugsSitemap) merged[s] = [...sitemapArtistas[s]].sort((a, b) => a - b);
const idxEntries = Object.keys(merged).sort().map((k) => `${JSON.stringify(k)}:${JSON.stringify(merged[k])}`);
const idxTs = `/**
 * Índice gerado: slug do artista no CifraClub → arquivos sitemap_cifras_N.xml.gz
 * que contêm as URLs das músicas dele (fonte: gcs/sitemap/sitemap_index.xml).
 *
 * Atualizado em ${HOJE} por scripts/discover-new-artists.mjs a partir dos ${totalArquivos}
 * sitemaps oficiais de cifras (${Object.keys(merged).length} artistas).
 * Regenerar do zero: node scripts/rebuild-cifraclub-sitemap-index.mjs
 */
export const CIFRACLUB_SITEMAP_INDEX_GENERATED_AT = '${HOJE}';

export const CIFRACLUB_SITEMAP_INDEX_RAW =
  '{${idxEntries.join(',')}}';

export const CIFRACLUB_SITEMAP_INDEX: Record<string, number[]> = JSON.parse(
  CIFRACLUB_SITEMAP_INDEX_RAW
) as Record<string, number[]>;
`;
fs.writeFileSync(INDEX_FILE, idxTs);
console.log(`índice atualizado: ${Object.keys(merged).length} artistas (+${foraDoIndice.length})`);

// ── 6b. Catálogo: reconstrução da SEÇÃO do array (o resto fica byte-a-byte) ─
// Estratégia segura: extrai as entradas existentes por regex global, mescla
// com os novos QUALIFICADOS, ordena e reescreve só o bloco entre
// `export const CIFRACLUB_CATALOG ... = [` e `];`. Um assert final garante
// que TODAS as entradas ficaram DENTRO do array e válidas.
const news = novos.filter((s) => (musicasPorArtista[s] || 0) >= MIN_MUSICAS)
  .map((slug) => {
    const genre = GENRE_MANUAL[slug] || '';
    return {
      slug,
      name: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      genre,
      category: GENRE_TO_CATEGORY[genre] || 'Outros',
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
const linhaCatalogo = (e) => `  { slug: '${e.slug}', name: '${e.name.replace(/'/g, "\\'")}', genre: '${e.genre}', category: '${e.category}' },`;

const catRaw = fs.readFileSync(CATALOG_FILE, 'utf8');
const eol = catRaw.includes('\r\n') ? '\r\n' : '\n';
const catPorCategoria = Object.create(null);
const merge = [
  ...catalogo.map((a) => ({ ...a, novo: false })),
  ...news.map((e) => ({ ...e, novo: true })),
].sort((a, b) => a.slug.localeCompare(b.slug));
const blocoNovo = merge.map((e) => linhaCatalogo(e)).join(eol);
const catOut2 = catRaw.replace(
  /(export const CIFRACLUB_CATALOG: CifraClubArtist\[\] = \[)([\s\S]*?)(\n\];)/,
  (_all, abre, _corpo, fecha) => abre + eol + blocoNovo + fecha
);
// Asserts: nada fora do array, tudo válido, contagem bate.
const reEntry = /^\s*\{\s*slug:\s*'[^']+',\s*name:\s*'(?:[^'\\]|\\.)*',\s*genre:\s*'[^']*',\s*category:\s*'[^']*'\s*\},\s*$/;
const secao = catOut2.slice(catOut2.indexOf('CIFRACLUB_CATALOG: CifraClubArtist[] = ['), catOut2.indexOf('\n];'));
const foraDoArray = catOut2.slice(catOut2.indexOf('\n];')).split(/\r?\n/).filter((l) => reEntry.test(l));
if (foraDoArray.length > 0) throw new Error(`${foraDoArray.length} entradas ficariam fora do array — abortando`);
const validas = secao.split(/\r?\n/).filter((l) => reEntry.test(l)).length;
if (validas !== merge.length) throw new Error(`esperado ${merge.length} entradas válidas, encontrei ${validas} — abortando`);
for (const e of merge) catPorCategoria[e.category] = (catPorCategoria[e.category] || 0) + 1;
let catOut = catOut2;
// Atualiza a linha de distribuição do cabeçalho e anota a atualização
// (substitui anotações de execuções anteriores em vez de acumular).
catOut = catOut.replace(/^ \* Atualização \d{4}-\d{2}-\d{2} \(discover-new-artists\): .*$(\r?\n)?/m, '');
catOut = catOut.replace(
  /^ \* Distribuição: .*$/m,
  ` * Distribuição: ${Object.entries(catPorCategoria).map(([c, n]) => `${c} ${n}`).join(' · ')}${eol} * Atualização ${HOJE} (discover-new-artists): +${news.length} artistas novos (genre vazio = refinar com build-catalog.mjs)`
);
fs.writeFileSync(CATALOG_FILE, catOut);
console.log(`catálogo atualizado: ${merge.length} artistas (+${news.length}; ${catalogo.length} existentes preservados)`);
console.log('\nPróximos passos: npx tsc --noEmit && npm run build:cron && commit dos 2 .ts');
