const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT) || 5300;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

const server = http.createServer((req, res) => {
  // Ignora query strings e hashes
  const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const isAsset = urlPath.startsWith('/assets/');

  let filePath;
  if (isAsset) {
    // Assets (JS/CSS com hash): serve direto ou 404 — NUNCA index.html
    filePath = path.join(DIST, urlPath);
  } else if (urlPath === '/' || urlPath === '') {
    filePath = path.join(DIST, 'index.html');
  } else {
    // Rotas SPA (/dicionario, /afinador, etc): tenta arquivo, senão index.html
    const tryFile = path.join(DIST, urlPath);
    if (fs.existsSync(tryFile) && fs.statSync(tryFile).isFile()) {
      filePath = tryFile;
    } else {
      filePath = path.join(DIST, 'index.html');
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const headers = { 'Content-Type': contentType };

    if (isAsset) {
      // Assets com hash no nome: cache imutável (1 ano)
      // Quando o build muda, o hash muda → browser baixa a nova versão
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else if (ext === '.html') {
      // HTML: nunca cacheia (SPA precisa revalidar para pegar novos chunks)
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    } else {
      // Outros (imagens, fontes): cache moderado (1 hora)
      headers['Cache-Control'] = 'public, max-age=3600';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[serve] SPA server on http://localhost:${PORT}`);
});
