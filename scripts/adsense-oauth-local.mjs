#!/usr/bin/env node
/**
 * scripts/adsense-oauth-local.mjs
 *
 * Captura o código de autorização OAuth do AdSense via redirect para
 * localhost — alternativa ao fluxo "out-of-band" (oob), que o Google está
 * descontinuando e pode travar na tela de consentimento.
 *
 * Uso:
 *   1. node scripts/adsense-oauth-local.mjs <client-id>
 *   2. Adicione "http://localhost:8787" como URI de redirecionamento
 *      autorizado no OAuth client (Console → Credenciais → client → URIs).
 *   3. Abra a URL impressa, autorize — o Google redireciona para
 *      http://localhost:8787?code=... e o código é salvo em
 *      .ukemaster/adsense-oauth-code.txt
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8787;
const CLIENT_ID = process.argv[2];
if (!CLIENT_ID) {
  console.error('Uso: node scripts/adsense-oauth-local.mjs <client-id>');
  process.exit(1);
}

const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = encodeURIComponent('https://www.googleapis.com/auth/adsense.readonly');
const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `access_type=offline&scope=${SCOPE}&prompt=consent&response_type=code&` +
  `client_id=${encodeURIComponent(CLIENT_ID)}&redirect_uri=${encodeURIComponent(REDIRECT)}`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, REDIRECT);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Erro na autorização</h1><p>${error}: ${url.searchParams.get('error_description') || ''}</p><p>Pode fechar esta aba.</p>`);
    console.error(`ERROR: ${error} ${url.searchParams.get('error_description') || ''}`);
    process.exit(1);
  }
  if (code) {
    const outDir = path.join(ROOT, '.ukemaster');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'adsense-oauth-code.txt'), code);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>✅ Autorização recebida!</h1><p>Código salvo. Pode fechar esta aba e voltar ao UkeMaster.</p>');
    console.log('CODE_SAVED');
    setTimeout(() => { server.close(); process.exit(0); }, 500);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Aguardando redirecionamento do Google…</h1>');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Capturador OAuth ouvindo em ${REDIRECT}`);
  console.log(`\n1. Confirme que "${REDIRECT}" está nas URIs de redirecionamento autorizadas do client OAuth.`);
  console.log(`\n2. Abra no navegador (logado como dono do AdSense):\n\n${authUrl}\n`);
  console.log('\n3. Autorize — o Google redireciona de volta e o código será salvo.');
  console.log('   (o arquivo ficará em .ukemaster/adsense-oauth-code.txt)\n');
});
