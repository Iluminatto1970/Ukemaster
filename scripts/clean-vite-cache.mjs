/**
 * Limpa o cache de dependências otimizadas do Vite (node_modules/.vite).
 *
 * Roda automaticamente antes de `npm run dev` (script predev).
 *
 * Por quê: o cache do Vite é sensível à versão do esbuild que fez as
 * otimizações. Com duas versões de esbuild no projeto (a do Vite e a do
 * tsx), um cache escrito por uma e lido pela outra gerava o erro
 * intermitente "[plugin:vite:esbuild] Invalid loader value: '487Z'" —
 * que derrubava módulos e forçava full-reload (o app "pulava" para outra
 * página do nada). O tsx também usa o mesmo diretório tmp para seus
 * bundles. Limpar a cada `npm run dev` garante que o cache sempre foi
 * escrito pela MESMA versão de esbuild que vai lê-lo.
 *
 * O custo é desprezível: o dev server re-otimiza as deps em ~1-2s.
 */
import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.join(process.cwd(), 'node_modules', '.vite'),
];

let removed = 0;
for (const dir of targets) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  } catch {
    // Se não conseguir remover (arquivo travado no Windows), segue o baile —
    // o dev server lida com cache parcial.
  }
}

// Silencioso por padrão; mostre com VERBOSE=1.
if (process.env.VERBOSE) {
  console.log(removed ? `[predev] cache do Vite limpo (${removed})` : '[predev] sem cache para limpar');
}
