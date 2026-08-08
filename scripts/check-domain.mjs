#!/usr/bin/env node
/**
 * scripts/check-domain.mjs
 *
 * Verifica de uma vez tudo que envolve o domínio do UkeMaster Pro:
 *   1. DNS  — A (apex) e CNAME (www) apontando para a Vercel
 *   2. HTTPS — https://ukemasterpro.com e www respondem 200
 *   3. Sitemap — /sitemap.xml responde e usa o domínio novo
 *   4. Robots — /robots.txt aponta o sitemap no domínio novo
 *   5. Canonical — o index.html servido tem canonical/og no domínio novo
 *   6. Supabase Auth — site_url e Redirect URLs (allow list) com o domínio
 *
 * Uso:
 *   node scripts/check-domain.mjs
 *
 * Opções via env:
 *   DOMAIN=ukemasterpro.com        (padrão: ukemasterpro.com)
 *   SUPABASE_PROJECT_REF=...       (padrão: lê .env.local ou usa o ref do projeto)
 *   SUPABASE_ACCESS_TOKEN=...      (padrão: lê .env.local)
 *
 * Exit code 0 = tudo OK · 1 = pelo menos uma falha.
 */
import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DOMAIN = process.env.DOMAIN || 'ukemasterpro.com';
const WWW = `www.${DOMAIN}`;
// Registros que configuramos na Hostinger (opção recomendada pela Vercel):
const EXPECTED_A = ['76.76.21.21'];
const EXPECTED_CNAME = ['cname.vercel-dns.com'];
const EXPECTED_SITE_URL = `https://${DOMAIN}`;
const EXPECTED_CALLBACK = `https://${DOMAIN}/auth/callback`;
const EXPECTED_CALLBACK_WWW = `https://www.${DOMAIN}/auth/callback`;

// UA de navegador real: o site tem camada anti-scraping que bloqueia UAs
// de ferramentas (curl, node-fetch etc.) com 403.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const results = [];
let failed = false;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed = true;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local');
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Fetch com timeout e UA de navegador. Retorna { status, headers, text } */
async function httpGet(url, { maxBytes = 2_000_000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...headers },
      redirect: 'manual',
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text: text.slice(0, maxBytes) };
  } finally {
    clearTimeout(t);
  }
}

async function checkDns() {
  console.log('\n1) DNS (registros na Hostinger → Vercel)');
  try {
    const a = await dns.resolve4(DOMAIN);
    const ok = a.some((ip) => EXPECTED_A.includes(ip));
    record('A (apex)', ok, `${DOMAIN} → ${a.join(', ')}${ok ? '' : ` (esperado: ${EXPECTED_A.join(', ')})`}`);
  } catch (e) {
    record('A (apex)', false, e.message);
  }
  try {
    const cname = await dns.resolveCname(WWW);
    const ok = cname.some((c) => EXPECTED_CNAME.includes(c.replace(/\.$/, '')));
    record('CNAME (www)', ok, `${WWW} → ${cname.join(', ')}${ok ? '' : ` (esperado: ${EXPECTED_CNAME.join(', ')})`}`);
  } catch (e) {
    record('CNAME (www)', false, e.message);
  }
}

async function checkHttps() {
  console.log('\n2) HTTPS');
  for (const [label, url] of [
    ['apex', `https://${DOMAIN}/`],
    ['www', `https://${WWW}/`],
  ]) {
    try {
      const r = await httpGet(url, { maxBytes: 300_000 });
      record(`HTTPS ${label}`, r.status === 200, `status ${r.status}`);
    } catch (e) {
      record(`HTTPS ${label}`, false, e.message);
    }
  }
}

async function checkSitemap() {
  console.log('\n3) Sitemap');
  try {
    const r = await httpGet(`https://${DOMAIN}/sitemap.xml`, { maxBytes: 1_000_000 });
    const okStatus = r.status === 200;
    const okDomain = r.text.includes(`https://${DOMAIN}/`);
    const okNoOld = !r.text.includes('ukemasterpro.vercel.app');
    const count = (r.text.match(/<loc>/g) || []).length;
    record('Sitemap', okStatus && okDomain && okNoOld,
      `status ${r.status}, ${count} <loc>, usa ${DOMAIN}${okNoOld ? '' : ' — AINDA cita vercel.app'}`);
  } catch (e) {
    record('Sitemap', false, e.message);
  }
}

async function checkRobots() {
  console.log('\n4) Robots.txt');
  try {
    const r = await httpGet(`https://${DOMAIN}/robots.txt`);
    const ok = r.status === 200 && r.text.includes(`Sitemap: https://${DOMAIN}/sitemap.xml`);
    record('Robots', ok, `status ${r.status}${r.status === 200 ? `, aponta sitemap em ${DOMAIN}` : ''}`);
  } catch (e) {
    record('Robots', false, e.message);
  }
}

async function checkCanonical() {
  console.log('\n5) Canonical / OG do index.html servido');
  try {
    const r = await httpGet(`https://${DOMAIN}/`, { maxBytes: 300_000 });
    if (r.status !== 200) return record('Canonical', false, `status ${r.status}`);
    const hasCanonical = r.text.includes(`<link rel="canonical" href="https://${DOMAIN}/" />`);
    const hasOg = r.text.includes(`<meta property="og:url" content="https://${DOMAIN}/" />`);
    const leaksOld = r.text.includes('ukemasterpro.vercel.app');
    record('Canonical/OG', hasCanonical && hasOg && !leaksOld,
      `${hasCanonical ? 'canonical OK' : 'canonical FALHOU'} · ${hasOg ? 'og:url OK' : 'og:url FALHOU'}${leaksOld ? ' · AINDA cita vercel.app' : ''}`);
  } catch (e) {
    record('Canonical', false, e.message);
  }
}

async function checkSupabaseAuth() {
  console.log('\n6) Supabase Auth (site_url + Redirect URLs)');
  const env = loadEnvLocal();
  const token = process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN || '';
  const ref = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF || '';
  if (!token || !ref) {
    return record('Supabase Auth', false, 'sem SUPABASE_ACCESS_TOKEN/SUPABASE_PROJECT_REF no env ou .env.local');
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      return record('Supabase Auth', false, `Management API status ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    const cfg = await res.json();
    const siteOk = cfg.site_url === EXPECTED_SITE_URL;
    const allow = String(cfg.uri_allow_list || '');
    const allowOk =
      allow.includes(EXPECTED_CALLBACK) &&
      allow.includes(EXPECTED_CALLBACK_WWW);
    record('Supabase Auth', siteOk && allowOk,
      `site_url ${siteOk ? 'OK' : `=${cfg.site_url}`} · callbacks ${allowOk ? 'OK' : `→ ${allow || '(vazio)'}`}`);
  } catch (e) {
    record('Supabase Auth', false, e.message);
  }
}

console.log(`🔍 Verificando domínio: ${DOMAIN}`);
await checkDns();
await checkHttps();
await checkSitemap();
await checkRobots();
await checkCanonical();
await checkSupabaseAuth();

console.log(`\n${failed ? '❌ PELO MENOS UMA VERIFICAÇÃO FALHOU' : '✅ TUDO OK'} (${results.filter((r) => r.ok).length}/${results.length})`);
process.exit(failed ? 1 : 0);
