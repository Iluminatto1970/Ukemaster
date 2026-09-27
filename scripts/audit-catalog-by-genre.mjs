#!/usr/bin/env node
/**
 * UkeMaster Pro — catálogo do app × site inteiro (sitemaps), por gênero.
 *
 * Cruza três fontes:
 *   1. sitemaps oficiais de cifras (cache local; fonte da verdade do site)
 *   2. catálogo do app (src/data/cifraclubCatalog.ts — a fila do cron)
 *   3. páginas /estilos/{genero}/ coletadas por scripts/collect-genre-artists.mjs
 *      ($TMP/genre-artists.tsv: gênero<TAB>slug<TAB>nome)
 *
 * Responde: quantos artistas do CifraClub estão FORA do catálogo, agregados
 * por gênero (onde o site publica gênero) e com nº de músicas por artista.
 *
 * Uso:
 *   node scripts/audit-catalog-by-genre.mjs            # relatório no console
 *   node scripts/audit-catalog-by-genre.mjs --csv      # + docs/catalogo-por-genero-<data>.csv
 *   node scripts/audit-catalog-by-genre.mjs --top 30   # top por gênero no relatório
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRAPER_CACHE = process.env.SITEMAP_CACHE_DIR || path.join(os.tmpdir(), 'cifraclub-sitemaps');
const GZ_CACHE = process.env.CIFRACLUB_SITEMAP_CACHE || path.join(os.tmpdir(), 'cifraclub-sitemap-cache');
const TSV = process.env.GENRE_ARTISTS_TSV || path.join(os.tmpdir(), 'genre-artists.tsv');
const DOCS_DIR = path.join(ROOT, 'docs');

const args = process.argv.slice(2);
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const TOP_N = parseInt(getOpt('--top', '15'), 10);
const GERAR_CSV = args.includes('--csv');
const HOJE = new Date().toISOString().slice(0, 10);

// ── 1) Site inteiro: artistas + nº de músicas, dos sitemaps em cache ────────
const musicas = Object.create(null);      // slug → nº de URLs de música
for (let n = 1; n <= 21; n++) {
  let xml;
  const xmlPath = path.join(SCRAPER_CACHE, `sitemap_cifras_${n}.xml`);
  const gzPath = path.join(GZ_CACHE, `sitemap_cifras_${n}.xml.gz`);
  if (fs.existsSync(xmlPath)) xml = fs.readFileSync(xmlPath, 'utf8');
  else if (fs.existsSync(gzPath)) {
    const buf = fs.readFileSync(gzPath);
    xml = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  } else throw new Error(`sitemap ${n} ausente nos caches`);
  const re = /<loc>https:\/\/www\.cifraclub\.com\.br\/([a-z0-9-]+)\/([a-z0-9-]+)\/<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) musicas[m[1]] = (musicas[m[1]] || 0) + 1;
}

// ── 2) Catálogo do app ───────────────────────────────────────────────────────
const catRaw = fs.readFileSync(path.join(ROOT, 'src/data/cifraclubCatalog.ts'), 'utf8');
const catalogo = new Map();
{
  const re = /\{\s*slug:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*genre:\s*'([^']*)',\s*category:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(catRaw))) catalogo.set(m[1], { genre: m[3], category: m[4] });
}

// ── 3) Gêneros das páginas /estilos/ (TSV do coletor) ───────────────────────
const generoPorSlug = new Map();          // slug → gênero (pode ter vários: 1º vence, o site repete)
for (const line of fs.readFileSync(TSV, 'utf8').split(/\r?\n/).filter(Boolean)) {
  const [genre, slug] = line.split('\t');
  if (genre && slug && !generoPorSlug.has(slug)) generoPorSlug.set(slug, genre);
}

// ── 4) Cruzamento ────────────────────────────────────────────────────────────
const slugsSite = Object.keys(musicas);
const fora = slugsSite.filter((s) => !catalogo.has(s));
const dentro = slugsSite.filter((s) => catalogo.has(s));

// Agregação por gênero (gênero do TSV; artistas fora das /estilos/ ficam
// no bucket "sem-genero" — o site não os publica nas páginas de gênero).
const porGenero = new Map();              // gênero → { artistas, musicas }
for (const s of fora) {
  const g = generoPorSlug.get(s) || 'sem-genero';
  const acc = porGenero.get(g) || { artistas: 0, musicas: 0, top: [] };
  acc.artistas++;
  acc.musicas += musicas[s];
  acc.top.push([s, musicas[s]]);
  porGenero.set(g, acc);
}
for (const acc of porGenero.values()) acc.top.sort((a, b) => b[1] - a[1]);

console.log(`Site inteiro (sitemaps): ${slugsSite.length} artistas · ${Object.values(musicas).reduce((a, b) => a + b, 0)} músicas`);
console.log(`Catálogo do app: ${catalogo.size} (no site: ${dentro.length} · zumbis: ${catalogo.size - dentro.length})`);
console.log(`FORA do catálogo: ${fora.length} artistas · ${porGenero.get('sem-genero') ? '' : ''}${fora.reduce((a, s) => a + musicas[s], 0)} músicas`);
console.log(`  com gênero publicado (/estilos/): ${fora.filter((s) => generoPorSlug.has(s)).length}`);
console.log(`  sem gênero publicado:            ${fora.filter((s) => !generoPorSlug.has(s)).length}`);
console.log('\nFORA DO CATÁLOGO, POR GÊNERO (gêneros com ≥1 artista):');
const rows = [...porGenero.entries()].sort((a, b) => b[1].musicas - a[1].musicas);
for (const [g, acc] of rows) {
  console.log(`  ${g.padEnd(22)} ${String(acc.artistas).padStart(6)} artistas · ${String(acc.musicas).padStart(7)} músicas · top: ${acc.top.slice(0, 5).map(([s, n]) => `${s}(${n})`).join(', ')}`);
}

// Bônus: novos do catálogo (genre:'') que a coleta de /estilos/ agora classifica
const enriqueciveis = [...catalogo.entries()].filter(([s, a]) => a.genre === '' && generoPorSlug.has(s));
console.log(`\nEnriquecimento disponível: ${enriqueciveis.length} entradas do catálogo com genre:'' agora têm gênero nas /estilos/`);

if (GERAR_CSV) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const csv = ['genero,artistas_fora,musicas_fora,top_artistas'];
  for (const [g, acc] of rows) {
    csv.push(`${g},${acc.artistas},${acc.musicas},"${acc.top.slice(0, 10).map(([s, n]) => `${s}(${n})`).join('; ')}"`);
  }
  const csvFile = path.join(DOCS_DIR, `catalogo-por-genero-${HOJE}.csv`);
  fs.writeFileSync(csvFile, csv.join('\n') + '\n');
  const md = [
    `# Catálogo do app × site inteiro, por gênero (${HOJE})`,
    '',
    `- Site: **${slugsSite.length}** artistas / ${Object.values(musicas).reduce((a, b) => a + b, 0)} músicas (sitemaps)`,
    `- Catálogo: **${catalogo.size}** (${dentro.length} no site, ${catalogo.size - dentro.length} zumbis)`,
    `- Fora do catálogo: **${fora.length}** artistas · ${fora.reduce((a, s) => a + musicas[s], 0)} músicas`,
    `  - com gênero publicado: ${fora.filter((s) => generoPorSlug.has(s)).length} · sem gênero: ${fora.filter((s) => !generoPorSlug.has(s)).length}`,
    `- Enriquecimento: ${enriqueciveis.length} entradas genre:'' agora classificáveis via /estilos/`,
    '',
    '| gênero | artistas fora | músicas fora | top artistas (nº músicas) |',
    '|---|---|---|---|',
    ...rows.map(([g, acc]) => `| ${g} | ${acc.artistas} | ${acc.musicas} | ${acc.top.slice(0, TOP_N).map(([s, n]) => `${s}(${n})`).join(', ')} |`),
    '',
    `CSV completo: docs/catalogo-por-genero-${HOJE}.csv`,
  ].join('\n');
  const mdFile = path.join(DOCS_DIR, `catalogo-por-genero-${HOJE}.md`);
  fs.writeFileSync(mdFile, md);
  console.log(`\nrelatórios: ${csvFile} + ${mdFile}`);
}
