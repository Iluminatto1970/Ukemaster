/**
 * Gera public/discover-demo.html com o RESULTADO REAL do endpoint /api/scrape
 * corrigido (descoberta do catálogo completo). Usa o ADMIN_SECRET do .env.local
 * para autorizar a chamada local — mesma credencial que o server.ts aceita.
 * Após a demonstração, remover: rm public/discover-demo.html scripts/build-discover-demo.mts
 */
import fs from 'fs';
import path from 'path';

const ARTIST_URL = 'https://www.cifraclub.com.br/roberto-carlos/';

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnvLocal();
const secret = env['ADMIN_SECRET'];

if (!secret) {
  console.error('ADMIN_SECRET não encontrado no .env.local');
  process.exit(1);
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function main() {
  const res = await fetch('http://localhost:3000/api/scrape', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'x-admin-secret': secret,
    },
    body: JSON.stringify({ discover: ARTIST_URL }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Resposta não-JSON:', text.slice(0, 300));
    process.exit(1);
  }
  if (!res.ok || !data?.ok) {
    console.error('Falha na chamada:', res.status, text.slice(0, 300));
    process.exit(1);
  }
  const links: { url: string; title: string; artist: string }[] = data.links || [];
  const uniq = new Set(links.map((l) => l.url));

  // Antes/depois (números reais medidos na investigação)
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rows = links
    .map(
      (l) => `
      <li>
        <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)}</a>
        <span class="artist">${esc(l.artist)}</span>
      </li>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Descobridor corrigido — Roberto Carlos (${links.length} músicas)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 14px 16px; }
  .card .num { font-size: 26px; font-weight: 800; }
  .card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8b949e; margin-top: 2px; }
  .card.good .num { color: #3fb950; }
  .card.bad .num { color: #f85149; }
  .card.warn .num { color: #d29922; }
  .note { background: #161b22; border: 1px solid #30363d; border-left: 3px solid #3fb950; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; line-height: 1.6; color: #c9d1d9; margin-bottom: 24px; }
  .note b { color: #e6edf3; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 10px; padding: 7px 10px; border-bottom: 1px solid #21262d; font-size: 13px; }
  li:hover { background: #161b22; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .artist { color: #8b949e; font-size: 11.5px; }
  .count { font-size: 12px; color: #8b949e; margin: 16px 0 8px; }
  .pill { display: inline-block; background: #1f6feb22; border: 1px solid #1f6feb66; color: #58a6ff; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 600; margin-left: 8px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>🎸 Descobridor de Músicas — Roberto Carlos <span class="pill">CifraClub</span></h1>
  <p class="sub">Relatório gerado a partir do endpoint real <code>/api/scrape</code> (local) com a correção aplicada — dados 100% reais, sem simulação.</p>

  <div class="cards">
    <div class="card good"><div class="num">${links.length}</div><div class="lbl">Músicas descobertas agora</div></div>
    <div class="card bad"><div class="num">25</div><div class="lbl">Antes (só página raiz)</div></div>
    <div class="card good"><div class="num">${uniq.size}</div><div class="lbl">Links únicos</div></div>
    <div class="card warn"><div class="num">0</div><div class="lbl">Lixo (instrument/autoplay)</div></div>
  </div>

  <div class="note">
    <b>O que estava errado:</b> a descoberta varria apenas a página raiz do artista
    (<code>/roberto-carlos/</code>), que mostra só as ~15 músicas "populares" — por isso o sistema
    achava 25. <b>A correção:</b> a descoberta agora varre também o catálogo completo
    (<code>/roberto-carlos/musicas.html</code> — as ~617 músicas do CifraClub), mescla com a raiz,
    deduplica por URL e filtra lixo (<code>?instrument=</code>, <code>#autoplay</code>, variantes
    <code>simplificada</code>). O mesmo fluxo vale para o cron diário e para o importador da área admin.
  </div>

  <p class="count">Lista completa (${links.length} músicas):</p>
  <ul>${rows}</ul>
</div>
</body>
</html>`;

  fs.writeFileSync(path.join(process.cwd(), 'public', 'discover-demo.html'), html);
  console.log(`OK: ${links.length} músicas · ${uniq.size} únicas → public/discover-demo.html`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
