#!/usr/bin/env node
/**
 * UkeMaster Pro — auditoria de cobertura do acervo × sitemaps do CifraClub.
 *
 * Para cada artista do catálogo de importação (src/data/cifraclubCatalog.ts):
 *   1. extrai dos sitemaps oficiais todas as músicas publicadas pelo artista;
 *   2. carrega do Supabase o acervo real (title+artist, normalizado como ukm_norm);
 *   3. lista as músicas que ainda NÃO foram importadas.
 *
 * Fontes locais (cache): $TMP/cifraclub-sitemaps/sitemap_cifras_1..21.xml
 * (regenerar cache: baixar de https://www.cifraclub.com.br/gcs/sitemap/sitemap_cifras_N.xml.gz)
 *
 * Uso:
 *   node scripts/audit-catalog-coverage.mjs                 # relatório completo
 *   node scripts/audit-catalog-coverage.mjs --top 30        # só imprime o top N
 *   node scripts/audit-catalog-coverage.mjs --artista legiao-urbana
 *
 * Saídas:
 *   docs/auditoria-acervo-sitemap-<data>.md   relatório legível
 *   docs/auditoria-faltantes-<data>.csv       detalhe completo (artista,título)
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = process.env.SITEMAP_CACHE_DIR || join(tmpdir(), 'cifraclub-sitemaps');
const HOJE = new Date().toISOString().slice(0, 10);

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const TOP_N = parseInt(getOpt('--top', '25'), 10);
const ARTISTA_FILTRO = getOpt('--artista', '');
const LIMIAR_DESTAQUE = parseInt(getOpt('--min-faltantes', '5'), 10);
// verificação de variantes via RPC search_songs (busca título, confere artista
// e sobreposição de tokens): mede o ruído dos faltantes (slugs ≠ títulos reais)
const SEM_VERIFICAR = args.includes('--sem-verificar');
const VERIF_CONCORRENCIA = 6;
const VERIF_MAX_POR_ARTISTA = 10;

// ── Credenciais do Supabase (públicas por design; .env.local local) ─────────
function loadEnv() {
  const p = join(ROOT, '.env.local');
  if (!existsSync(p)) throw new Error('.env.local não encontrado');
  const get = (k) => {
    const m = readFileSync(p, 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const url = get('VITE_SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL');
  const key = get('VITE_SUPABASE_ANON_KEY') || get('VITE_SUPABASE_PUBLISHABLE_KEY')
    || get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / anon key ausentes no .env.local');
  return { url, key };
}

// ── Normalização de auditoria ───────────────────────────────────────────────
// Mais frouxa que o ukm_norm do banco (que preserva pontuação): para CRUZAR
// sitemap × acervo, comparamos só o alfanumérico sem acento — o slug do
// CifraClub não tem pontuação, e o banco tem ("1965 (Duas Tribos)" etc.).
function auditNorm(s) {
  return String(s ?? '')
    .normalize('NFKD') // NFKD: 1º→1o, ≠→=, ligações tipográficas etc.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// slug → título aproximado (perde acentuação; a comparação usa a forma normalizada)
function slugToTitle(slug) {
  return slug.replace(/-/g, ' ');
}

// ── 1) Catálogo de artistas (670) ───────────────────────────────────────────
function loadCatalog() {
  const raw = readFileSync(join(ROOT, 'src/data/cifraclubCatalog.ts'), 'utf8');
  const out = [];
  const re = /\{\s*slug:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*genre:\s*'([^']*)',\s*category:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(raw))) out.push({ slug: m[1], name: m[2].replace(/\\'/g, "'"), genre: m[3], category: m[4] });
  if (out.length === 0) throw new Error('catálogo vazio — formato mudou?');
  return out;
}

// ── 2) Índice gerado: slug → arquivos de sitemap ────────────────────────────
function loadSitemapIndex() {
  const raw = readFileSync(join(ROOT, 'src/data/cifraclubSitemapIndex.ts'), 'utf8');
  const m = raw.match(/CIFRACLUB_SITEMAP_INDEX_RAW\s*=\s*'(.*?)';/s);
  if (!m) throw new Error('índice de sitemap não encontrado (regenere com rebuild-cifraclub-sitemap-index.mjs)');
  return JSON.parse(m[1]);
}

// ── 3) Músicas por artista nos sitemaps (cache local) ───────────────────────
function loadSitemapSongs(slugsNecessarios, index) {
  const arquivosNecessarios = new Set();
  for (const slug of slugsNecessarios) for (const n of index[slug] || []) arquivosNecessarios.add(n);

  const porArtista = new Map(); // slug → Map(slugMusica → {simplificada:boolean})
  for (const slug of slugsNecessarios) porArtista.set(slug, new Map());

  for (const n of [...arquivosNecessarios].sort((a, b) => a - b)) {
    const f = join(CACHE_DIR, `sitemap_cifras_${n}.xml`);
    if (!existsSync(f)) throw new Error(`cache ausente: ${f}`);
    const xml = readFileSync(f, 'utf8');
    const re = /<loc>https:\/\/www\.cifraclub\.com\.br\/([^/<]+)\/([^/<]+?)\/?(simplificada\.html)?<\/loc>/g;
    let m;
    while ((m = re.exec(xml))) {
      const [, artista, musica, variante] = m;
      const mapa = porArtista.get(artista);
      if (!mapa) continue; // artista fora do catálogo de importação
      mapa.set(musica, { simplificada: Boolean(variante) });
    }
    process.stdout.write(`  sitemap ${n}/21 lido (${arquivosNecessarios.size} necessários)\r`);
  }
  console.log('');
  return porArtista;
}

// ── 4) Acervo do Supabase (title+artist, paginado) ──────────────────────────
async function loadAcervo({ url, key }) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const normSet = new Set(); // "normArtista|normTitulo"
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const res = await fetch(
      `${url}/rest/v1/songs?select=title,artist&order=id&limit=${PAGE}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      if (!r?.title || !r?.artist) continue;
      normSet.add(`${auditNorm(r.artist)}|${auditNorm(r.title)}`);
    }
    offset += rows.length;
    if (rows.length < PAGE) break;
  }
  return normSet;
}

// ── 5) Verificação de variantes (RPC search_songs) ─────────────────────────
async function verificarVariantes(env, topLinhas) {
  const alvosVerif = [];
  for (const l of topLinhas) {
    for (const t of l.faltantes.slice(0, VERIF_MAX_POR_ARTISTA)) {
      alvosVerif.push({ linha: l, titulo: t });
    }
  }
  console.log(`▸ Verificação de variantes (RPC, ${alvosVerif.length} títulos amostrados)…`);
  const headers = { apikey: env.key, Authorization: `Bearer ${env.key}`, 'Content-Type': 'application/json' };
  let idx = 0;
  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= alvosVerif.length) return;
      const { linha, titulo } = alvosVerif[i];
      try {
        const res = await fetch(`${env.url}/rest/v1/rpc/search_songs`, {
          method: 'POST', headers,
          body: JSON.stringify({ q: `${titulo} ${linha.name}`.slice(0, 120), lim: 8 }),
        });
        if (!res.ok) continue;
        const rows = await res.json();
        const alvoTokens = new Set(auditNorm(titulo).split(' '));
        const hit = (rows || []).find((r) => {
          if (auditNorm(r.artist) !== auditNorm(linha.name)) return false;
          const tokens = auditNorm(r.title).split(' ');
          if (tokens.length === 0) return false;
          const comum = tokens.filter((t) => alvoTokens.has(t)).length;
          return comum / Math.max(tokens.length, alvoTokens.size) >= 0.6;
        });
        if (hit) linha.variantes.push(titulo);
      } catch { /* rede — mantém como faltante */ }
    }
  }
  await Promise.all(Array.from({ length: VERIF_CONCORRENCIA }, worker));
  console.log('  concluído\n');
}

// ── Main ────────────────────────────────────────────────────────────────────
const env = loadEnv();
console.log('▸ Catálogo de artistas…');
const catalogo = loadCatalog();
const alvos = ARTISTA_FILTRO
  ? catalogo.filter((a) => a.slug === ARTISTA_FILTRO)
  : catalogo;
if (alvos.length === 0) throw new Error(`artista não encontrado no catálogo: ${ARTISTA_FILTRO}`);
console.log(`  ${alvos.length} artista(s) em análise${ARTISTA_FILTRO ? ` (${ARTISTA_FILTRO})` : ''}`);

console.log('▸ Sitemaps oficiais (cache local)…');
const index = loadSitemapIndex();
const sitemapSongs = loadSitemapSongs(new Set(alvos.map((a) => a.slug)), index);

console.log('▸ Acervo do Supabase…');
const acervo = await loadAcervo(env);
console.log(`  ${acervo.size.toLocaleString('pt-BR')} pares normalizados título+artista\n`);

// ── Comparação ──────────────────────────────────────────────────────────────
const linhas = [];
let totalSitemap = 0, totalAcervo = 0, totalFaltantes = 0;

for (const a of alvos) {
  const musicas = sitemapSongs.get(a.slug) || new Map();
  // consolida: base = música sem variante; simplificada não conta separadamente
  const bases = new Map();
  for (const [slug, info] of musicas) {
    if (info.simplificada) continue; // variante — o import gera junto com a base
    bases.set(slug, true);
  }
  totalSitemap += bases.size;

  let presentes = 0;
  const faltantes = [];
  // aceita tanto o nome de exibição do catálogo quanto o derivado do slug
  // (variações de acento/caixa já são absorvidas pela normalização)
  const artistasNorm = [...new Set([auditNorm(a.name), auditNorm(slugToTitle(a.slug))])];
  for (const slug of bases.keys()) {
    const titulo = slugToTitle(slug);
    const achou = artistasNorm.some((na) => acervo.has(`${na}|${auditNorm(titulo)}`));
    if (achou) presentes++;
    else faltantes.push(titulo);
  }
  totalAcervo += presentes;
  totalFaltantes += faltantes.length;
  if (faltantes.length > 0) {
    linhas.push({ slug: a.slug, name: a.name, genre: a.genre || '', category: a.category || '',
      total: bases.size, presentes, faltantes, variantes: [] });
  }
}

linhas.sort((x, y) => y.faltantes.length - x.faltantes.length || y.total - x.total);

// ── Verificação de variantes (só nas linhas relevantes — RPC custa rede) ────
if (!SEM_VERIFICAR) {
  await verificarVariantes(env, linhas.slice(0, 40));
}
for (const l of linhas) {
  l.liquidos = SEM_VERIFICAR ? l.faltantes : l.faltantes.filter((t) => !l.variantes.includes(t));
}
linhas.sort((x, y) => y.liquidos.length - x.liquidos.length || y.total - x.total);

const totalVariantes = linhas.reduce((s, l) => s + l.variantes.length, 0);
const totalLiquidos = linhas.reduce((s, l) => s + l.liquidos.length, 0);

// ── Relatório ───────────────────────────────────────────────────────────────
const resumo = [
  '# Auditoria de cobertura — acervo × sitemaps do CifraClub',
  '',
  `> Gerada em ${HOJE} por \`scripts/audit-catalog-coverage.mjs\``,
  '',
  '| Métrica | Valor |',
  '|---|---|',
  `| Artistas do catálogo de importação | ${alvos.length} |`,
  `| Músicas publicadas nos sitemaps (bases, sem variantes) | ${totalSitemap.toLocaleString('pt-BR')} |`,
  `| Já presentes no acervo | ${totalAcervo.toLocaleString('pt-BR')} |`,
  `| Faltantes (bruto) | ${totalFaltantes.toLocaleString('pt-BR')} |`,
  `| ↳ variantes prováveis (no acervo com outro título) | ${totalVariantes.toLocaleString('pt-BR')} |`,
  `| **Faltantes líquidos** | **${totalLiquidos.toLocaleString('pt-BR')}** |`,
  `| Cobertura efetiva | ${totalSitemap ? (((totalAcervo + totalVariantes) / totalSitemap) * 100).toFixed(1) : '0'}% |`,
  '',
  `## Artistas com mais faltantes líquidos (limiar: ≥ ${LIMIAR_DESTAQUE})`,
  '',
  '| Artista | Gênero | Publicadas | No acervo | Faltantes (líquidos) |',
  '|---|---|---|---|---|',
];
for (const l of linhas.filter((l) => l.liquidos.length >= LIMIAR_DESTAQUE).slice(0, TOP_N)) {
  resumo.push(`| ${l.name} | ${l.category} | ${l.total} | ${l.presentes} | **${l.liquidos.length}** |`);
}

const md = resumo.join('\n') + '\n';
const csv = ['artista_slug,artista,genero,categoria,publicadas,no_acervo,faltantes_bruto,faltantes_liquidos,musica_faltante,variante_provavel']
  .concat(linhas.flatMap((l) => l.faltantes.map((t) =>
    [l.slug, l.name, l.genre, l.category, l.total, l.presentes, l.faltantes.length, l.liquidos.length, `"${t.replace(/"/g, '""')}"`, l.variantes.includes(t) ? 'sim' : ''].join(','))))
  .join('\n') + '\n';

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', `auditoria-acervo-sitemap-${HOJE}.md`), md);
writeFileSync(join(ROOT, 'docs', `auditoria-faltantes-${HOJE}.csv`), csv);

// ── Saída no console ────────────────────────────────────────────────────────
console.log(md);
console.log(`▸ CSV completo: docs/auditoria-faltantes-${HOJE}.csv (${totalFaltantes.toLocaleString('pt-BR')} linhas)`);
