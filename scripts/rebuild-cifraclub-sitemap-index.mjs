#!/usr/bin/env node
/**
 * Regenera src/data/cifraclubSitemapIndex.ts — o índice
 * "slug do artista → arquivos sitemap_cifras_N.xml.gz" usado pela descoberta
 * de catálogo completo (src/lib/scraper.ts).
 *
 * Fonte: sitemaps oficiais do CifraClub (robots.txt → gcs/sitemap/sitemap_index.xml),
 * arquivos sitemap_cifras_1..N.xml.gz (cada um ~10-20 MB descomprimido).
 *
 * Uso:
 *   node scripts/rebuild-cifraclub-sitemap-index.mjs             # baixa e gera
 *   CIFRACLUB_SITEMAP_CACHE=/tmp/smc node ...                    # reusa .gz/.xml já baixados
 *
 * O cache fica no diretório temporário do sistema (não versiona ~300 MB).
 */

import { gunzipSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.cifraclub.com.br';
const OUT_FILE = fileURLToPath(new URL('../src/data/cifraclubSitemapIndex.ts', import.meta.url));
const CACHE_DIR = process.env.CIFRACLUB_SITEMAP_CACHE || path.join(os.tmpdir(), 'cifraclub-sitemap-cache');

fs.mkdirSync(CACHE_DIR, { recursive: true });

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function cached(name, url, { gunzip = false } = {}) {
  const file = path.join(CACHE_DIR, name);
  if (!fs.existsSync(file)) {
    process.stdout.write(`baixando ${url}...\n`);
    fs.writeFileSync(file, await fetchBuffer(url));
  }
  const buf = fs.readFileSync(file);
  // Aceita cache em .gz OU já descomprimido (magic bytes 1f 8b).
  if (gunzip && buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    return gunzipSync(buf).toString('utf8');
  }
  return buf.toString('utf8');
}

// 1. Índice de sitemaps → arquivos sitemap_cifras_*.xml.gz
const indexXml = await cached('sitemap_index.xml', `${BASE}/gcs/sitemap/sitemap_index.xml`);
const children = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const cifrasUrls = children
  .filter((u) => /sitemap_cifras_\d+\.xml\.gz$/.test(u))
  .sort((a, b) => {
    const na = Number(a.match(/_(\d+)\.xml\.gz$/)[1]);
    const nb = Number(b.match(/_(\d+)\.xml\.gz$/)[1]);
    return na - nb;
  });
if (cifrasUrls.length === 0) throw new Error('Nenhum sitemap_cifras_*.xml.gz no índice — o formato mudou?');
process.stdout.write(`arquivos de cifras: ${cifrasUrls.length}\n`);

// 2. Extrai pares "artista/música/" de cada arquivo → índice artista → [arquivos]
const idx = Object.create(null);
for (let i = 0; i < cifrasUrls.length; i++) {
  const n = i + 1;
  const xml = await cached(`sitemap_cifras_${n}.xml`, cifrasUrls[i], { gunzip: true });
  // Só URLs de MÚSICA: /artista/musica/ (2 segmentos). Exclui variantes
  // (.html: simplificada.html etc.) e subpáginas (/detalhes/, /discografia/).
  const re = /<loc>https:\/\/www\.cifraclub\.com\.br\/([a-z0-9-]+)\/([a-z0-9-]+)\/<\/loc>/g;
  let m;
  let count = 0;
  while ((m = re.exec(xml)) !== null) {
    const [, artist] = m;
    (idx[artist] ||= new Set()).add(n);
    count++;
  }
  process.stdout.write(`  cifras_${n}: ${count} músicas\n`);
}

// 3. Grava o módulo TS
const entries = Object.keys(idx)
  .sort()
  .map((k) => `${JSON.stringify(k)}:${JSON.stringify([...idx[k]].sort((a, b) => a - b))}`);
const json = `{${entries.join(',')}}`;
const generatedAt = new Date().toISOString().slice(0, 10);
const totalPairs = entries.reduce((s, k) => s + 1, 0);

const ts = `/**
 * Índice gerado: slug do artista no CifraClub → arquivos sitemap_cifras_N.xml.gz
 * que contêm as URLs das músicas dele (fonte: gcs/sitemap/sitemap_index.xml).
 *
 * Gerado em ${generatedAt} a partir dos ${cifrasUrls.length} sitemaps oficiais de cifras
 * (~1 milhão de URLs de música, ${entries.length} artistas).
 * Regenerar: node scripts/rebuild-cifraclub-sitemap-index.mjs
 */
export const CIFRACLUB_SITEMAP_INDEX_GENERATED_AT = '${generatedAt}';

export const CIFRACLUB_SITEMAP_INDEX_RAW =
  '${json}';

export const CIFRACLUB_SITEMAP_INDEX: Record<string, number[]> = JSON.parse(
  CIFRACLUB_SITEMAP_INDEX_RAW
) as Record<string, number[]>;
`;

fs.writeFileSync(OUT_FILE, ts);
const sizeMb = (fs.statSync(OUT_FILE).size / 1e6).toFixed(2);
process.stdout.write(`OK: ${entries.length} artistas, ${totalPairs} entradas → ${OUT_FILE} (${sizeMb} MB)\n`);
