/**
 * Catálogo de plataformas de cifras (BR e internacionais) para o cron: URLs de artistas, delayMs por site e habilitação.
 */
/**
 * Registro das plataformas de cifras varridas pelo cron do UkeMaster Pro.
 *
 * IMPORTANTE: nem todo site aceita scraping — muitos (Ultimate-Guitar,
 * E-chords, etc.) usam Cloudflare/anti-bot e o servidor recebe 403/503.
 * O cron processa os que respondem e registra os erros dos demais sem travar.
 * CifraClub (BR) é o mais confiável para HTML puro.
 */

export interface ChordPlatform {
  id: string;
  name: string;
  /** 'BR' nacional | 'INT' internacional */
  region: 'BR' | 'INT';
  /** Páginas de artista a varrer (o cron faz rotação diária). */
  artistPages: string[];
  /** Quantas músicas por artista em cada execução. */
  limitPerArtist: number;
  /** Atraso educado entre requisições (ms). */
  delayMs: number;
  /** Ligada/desligada no cron (sem precisar remover do registro). */
  enabled: boolean;
}

export const CHORD_PLATFORMS: ChordPlatform[] = [
  {
    id: 'cifraclub-br',
    name: 'CifraClub Brasil',
    region: 'BR',
    // Ordem = fila do cron (rotação justa). Intercala catálogos GIGANTES
    // (Roberto Carlos ~617, Caetano ~500...) com catálogos médios/pequenos
    // para o cron cobrir TODOS os artistas a cada ciclo, em vez de ficar
    // preso nos primeiros por dias. O dedupe por título|artista garante que
    // o gigante é retomado incrementalmente quando a rotação volta a ele.
    artistPages: [
      // Coberturas novas/pequenas primeiro (vitórias rápidas por execução)
      'https://www.cifraclub.com.br/jorge-e-mateus/',
      'https://www.cifraclub.com.br/anitta/',
      'https://www.cifraclub.com.br/ivete-sangalo/',
      'https://www.cifraclub.com.br/luiz-gonzaga/',
      // Gigante 1
      'https://www.cifraclub.com.br/roberto-carlos/',
      'https://www.cifraclub.com.br/alceu-valenca/',
      // Gigante 2
      'https://www.cifraclub.com.br/caetano-veloso/',
      'https://www.cifraclub.com.br/marilia-mendonca/',
      // Gigante 3
      'https://www.cifraclub.com.br/zeze-di-camargo-e-luciano/',
      'https://www.cifraclub.com.br/legiao-urbana/',
      // Gigante 4
      'https://www.cifraclub.com.br/chitaozinho-e-xororo/',
      'https://www.cifraclub.com.br/tim-maia/',
      'https://www.cifraclub.com.br/gusttavo-lima/',
      'https://www.cifraclub.com.br/djavan/',
      'https://www.cifraclub.com.br/tom-jobim/',
    ],
    limitPerArtist: 5,
    delayMs: 500,
    enabled: true,
  },
  {
    id: 'letras-br',
    name: 'Letras.mus.br',
    region: 'BR',
    // As páginas de letra têm cifra atrás de "Ver cifra" (JS) — o scraper
    // tenta o HTML; se vier sem cifra, é registrado como erro suave.
    artistPages: [
      'https://www.letras.mus.br/alceu-valenca/',
      'https://www.letras.mus.br/legiao-urbana/',
    ],
    limitPerArtist: 3,
    delayMs: 800,
    enabled: false,
  },
  {
    id: 'guitaretab-int',
    name: 'GuitarTabs (INT)',
    region: 'INT',
    // Testado 2026-08-05: responde a HTML puro (sem Cloudflare/login/JS).
    // Algumas cifras são bloqueadas por licença do site (viram erro suave).
    // O scraper entende o formato: <pre class="js-tab-fit-to-screen"> com
    // linhas <span class="js-tab-row">; título/artista saem do og:title
    // ("X tab ver. 2 with lyrics by Y for guitar @ Guitaretab").
    artistPages: [
      'https://www.guitaretab.com/j/jason-mraz/',
      'https://www.guitaretab.com/e/ed-sheeran/',
      'https://www.guitaretab.com/t/the-beatles/',
      'https://www.guitaretab.com/a/adele/',
      'https://www.guitaretab.com/b/bruno-mars/',
      'https://www.guitaretab.com/t/taylor-swift/',
      'https://www.guitaretab.com/c/coldplay/',
      'https://www.guitaretab.com/v/vance-joy/',
      'https://www.guitaretab.com/i/israel-kamakawiwoole/',
      'https://www.guitaretab.com/b/bob-marley/',
      'https://www.guitaretab.com/e/elvis-presley/',
      'https://www.guitaretab.com/r/rihanna/',
    ],
    limitPerArtist: 3,
    delayMs: 800,
    enabled: true,
  },
];
