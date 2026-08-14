/**
 * Builda public/admin-stats-demo.js (demo do painel "Acervo").
 * Define as import.meta.env.* do cliente com os valores reais do .env.local.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const env = {};
try {
  const content = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  });
} catch {}

const define = {};
for (const k of [
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]) {
  if (env[k]) define[`import.meta.env.${k}`] = JSON.stringify(env[k]);
}

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error('❌ .env.local sem VITE_SUPABASE_URL/ANON — demo não pode acessar dados.');
  process.exit(1);
}

await build({
  entryPoints: ['scripts/demo-stats-entry.tsx'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  target: ['es2020'],
  outfile: 'public/admin-stats-demo.js',
  define,
  minify: true,
  logLevel: 'info',
});

console.log('✅ public/admin-stats-demo.js gerado');
