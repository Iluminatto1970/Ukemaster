#!/usr/bin/env node
/**
 * test-ukemater-login.mjs — Testa o login da conta UkeMaster no Supabase Auth.
 *
 * É EXATAMENTE o mesmo fluxo que o cron usa (src/lib/platformCron.ts →
 * getCronToken): password grant em /auth/v1/token. Se este script passar,
 * o cron autenticado vai funcionar nas máquinas e na Vercel.
 *
 * Uso:
 *   node scripts/cron/test-ukemater-login.mjs
 *     → lê NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *       CRON_UKEMATER_EMAIL e CRON_UKEMATER_PASSWORD do .env local
 *       (mesma ordem de precedência do cron: .env e depois .env.local).
 *
 *   CRON_UKEMATER_EMAIL=x CRON_UKEMATER_PASSWORD=y node scripts/cron/test-ukemater-login.mjs
 *     → força as credenciais sem tocar em arquivos.
 *
 * Exit code: 0 = login OK (JWT emitido) · 1 = falhou (senha errada, conta
 * inexistente, e-mail não confirmado ou rede).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Lê um .env simples (chave=valor, ignora comentários/vazios). */
function readEnvFile(file) {
  const out = {};
  try {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {
    /* arquivo ausente — ok */
  }
  return out;
}

const env = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...process.env };

const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const email = env.CRON_UKEMATER_EMAIL || '';
const password = env.CRON_UKEMATER_PASSWORD || '';

const missing = [];
if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!key) missing.push('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
if (!email) missing.push('CRON_UKEMATER_EMAIL');
if (!password) missing.push('CRON_UKEMATER_PASSWORD');
if (missing.length) {
  console.error(`❌ Faltam variáveis: ${missing.join(', ')}`);
  console.error('   Preencha no .env local (ou passe por env no comando) e rode de novo.');
  process.exit(1);
}

console.log(`▸ Supabase: ${url.replace(/^https:\/\//, '')}`);
console.log(`▸ Conta:    ${email}`);
console.log('▸ Tentando login (password grant, igual ao cron)...');

try {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error_description || j.msg || j.error || '';
    } catch {
      /* corpo não-JSON */
    }
    console.error(`❌ Login FALHOU (HTTP ${res.status}).`);
    if (detail) console.error(`   Motivo: ${detail}`);
    if (res.status === 400) {
      console.error('   Diagnóstico comum: senha errada, e-mail não confirmado no');
      console.error('   Supabase Auth ou conta inexistente (crie com o cadastro do app).');
    }
    process.exit(1);
  }

  const data = await res.json();
  if (!data.access_token) {
    console.error('❌ Resposta sem access_token (resposta inesperada).');
    process.exit(1);
  }
  console.log('✅ Login OK — JWT emitido (o cron passará a escrever como UkeMaster).');
  console.log(`   User id: ${data.user?.id || '(não informado)'}`);
  process.exit(0);
} catch (e) {
  console.error('❌ Erro de rede/conexão ao tentar login:', e?.message || e);
  process.exit(1);
}
