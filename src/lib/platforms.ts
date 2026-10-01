/**
 * Catálogo de plataformas de cifras (BR e internacionais) para o cron: URLs de artistas, delayMs por site e habilitação.
 */
/**
 * Registro das plataformas de cifras varridas pelo cron do UkeMaster Pro.
 *
 * COBERTURA POR IDIOMA (interface do portal: pt/en/es/fr/de/ja/zh/ar):
 *   pt (BR) → CifraClub (667 artistas, índice de catálogo)
 *   en      → UkuTabs (ukulele, HTML puro) + Guitaretab (agregador global)
 *   fr/es/de→ Guitaretab (agregador global: artistas desses países entram pela
 *             lista ampliada de artistPages — o site é em EN, mas cobre as
 *             músicas desses artistas)
 *   ja      → U-FRET (violão/ukulele/piano, HTML puro com a cifra em JS var)
 *
 * SEM FONTE ESTÁVEL (testado em 2026-08, HTML puro) — documentado para não
 * re-testar à toa:
 *   es nativo → LaCuerda (redirects JS + 404), Cifras.cl (403)
 *   fr nativo → Partoch (tab via AJAX/Alpine — cifra NÃO vem no HTML),
 *               Maxitabs (só cursos), E-chords (Cloudflare)
 *   de nativo → E-chords (Cloudflare), Gitarre-tabs (fora do ar)
 *   zh        → 17Jita/JiTaTang (anti-bot JS), Tan8 (partituras em imagem)
 *   ar        → não há site de cifras em HTML puro estável
 * Essas plataformas ficam DESABILITADAS no registro com `disabledReason` —
 * se um dia passarem a servir HTML puro, basta habilitar e ajustar o scraper.
 */

export interface ChordPlatform {
  id: string;
  name: string;
  /** 'BR' nacional | 'INT' internacional */
  region: 'BR' | 'INT';
  /**
   * Idioma principal do conteúdo da plataforma (alinhado ao seletor do portal:
   * pt/en/es/fr/de/ja/zh/ar). 'multi' = agregador internacional.
   */
  lang: 'pt' | 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh' | 'ar' | 'multi';
  /** Instrumento do conteúdo (informação — qualquer um vale para o acervo). */
  instrument?: string;
  /** Páginas de artista a varrer (o cron faz rotação diária). */
  artistPages: string[];
  /** true = fila vem do índice CIFRACLUB_CATALOG (ignora artistPages). */
  catalogBased?: boolean;
  /**
   * true = a fila é montada por NOMES de artista e uma função que constrói a
   * URL da página de artista (ex.: U-FRET usa artist.php?data=<nome>). Usado
   * quando o site não expõe um caminho fixo /letra/artista/.
   */
  artistQuery?: { names: string[]; buildUrl: (name: string) => string };
  /** Quantas músicas por artista em cada execução. */
  limitPerArtist: number;
  /** Atraso educado entre requisições (ms). */
  delayMs: number;
  /** Ligada/desligada no cron (sem precisar remover do registro). */
  enabled: boolean;
  /** Por que a plataforma está desabilitada (transparência no registro). */
  disabledReason?: string;
}

/** Fila por NOME (artistaQuery) para o U-FRET (Japão). */
const UFRET_ARTISTS: string[] = [
  'B\'z', '米津玄師', 'あいみょん', 'Official髭男dism', 'Mrs. GREEN APPLE',
  'back number', '宇多田ヒカル', 'サザンオールスターズ', 'ONE OK ROCK', 'RADWIMPS',
  'スピッツ', 'BUMP OF CHICKEN', '星野源', '平井堅', '中島みゆき',
  '井上陽水', '斉藤和義', '小田和正', '玉置浩二', '安全地帯',
  'ゆず', 'いきものがかり', 'Mr.Children', 'King Gnu', 'YOASOBI',
  'Aimer', '藤井風', 'Superfly', 'Perfume', '椎名林檎',
  'エレファントカシマシ', '桑田佳祐', 'THE ALFEE', '布袋寅泰', 'GLAY',
];

const ufretArtistUrl = (name: string) =>
  `https://www.ufret.jp/artist.php?data=${encodeURIComponent(name)}`;

export const CHORD_PLATFORMS: ChordPlatform[] = [
  {
    id: 'cifraclub-br',
    name: 'CifraClub Brasil',
    region: 'BR',
    lang: 'pt',
    instrument: 'violão/guitarra/ukulele',
    // Fila COMPLETA do índice de catálogo (667 artistas × 98 gêneros):
    // o cron processa em rotação justa, e o dedupe por título|artista
    // garante idempotência mesmo com múltiplas máquinas rodando.
    catalogBased: true,
    artistPages: [], // gerenciado pelo catálogo
    limitPerArtist: 5,
    delayMs: 500,
    enabled: true,
  },
  {
    id: 'ukutabs-en',
    name: 'UkuTabs (EN — ukulele)',
    region: 'INT',
    lang: 'en',
    instrument: 'ukulele',
    artistPages: [
      'https://ukutabs.com/j/jason-mraz/',
      'https://ukutabs.com/e/ed-sheeran/',
      'https://ukutabs.com/a/adele/',
      'https://ukutabs.com/t/taylor-swift/',
      'https://ukutabs.com/t/the-beatles/',
      'https://ukutabs.com/b/bob-marley/',
      'https://ukutabs.com/i/israel-kamakawiwoole/',
      'https://ukutabs.com/v/vance-joy/',
      'https://ukutabs.com/b/bruno-mars/',
      'https://ukutabs.com/r/rihanna/',
      'https://ukutabs.com/c/coldplay/',
      'https://ukutabs.com/b/billie-eilish/',
      'https://ukutabs.com/e/elvis-presley/',
      'https://ukutabs.com/t/train/',
      'https://ukutabs.com/p/passenger/',
      'https://ukutabs.com/t/twenty-one-pilots/',
      'https://ukutabs.com/o/oasis/',
      'https://ukutabs.com/r/radiohead/',
      'https://ukutabs.com/j/jack-johnson/',
      'https://ukutabs.com/l/lorde/',
    ],
    limitPerArtist: 3,
    delayMs: 900,
    enabled: false,
    disabledReason:
      'Bloqueio deliberado anti-automacao (testado 2026-09-30 com IP residencial BR): regra propria do UkuTabs recusa 403 "Access refused" para curl, fetch do Node E Chrome headless real — o proprio site diz que visita "looks automated" e so aceita humanos navegando da homepage. Passar exigiria browser stealth (evasao explicita do pedido do dono). Nao reativar.',
  },
  {
    id: 'ultimate-guitar-en',
    name: 'Ultimate-Guitar (EN — maior acervo do mundo)',
    region: 'INT',
    lang: 'en',
    instrument: 'violão/ukulele/bateria',
    // VALIDADO 2026-08 em HTML puro (curl, sem JS): as páginas servem SSR
    // com um <div class="js-store" data-content="{...}">:
    //   • página de artista → store.page.data.other_tabs[] (102/página, paginação
    //     em store.page.data.pagination) com { song_name, artist_name, tab_url }
    //     (ex.: Adele = 569 tabs em 6 páginas);
    //   • página de música → store.page.data.wiki_tab.content com a cifra
    //     COMPLETA em formato [ch]Em[/ch] + seções [Verse]…[Chorus] (letra +
    //     acordes). Converter [ch]X[/ch] → [X] e remover [tab]…[/tab].
    // IMPORTANTE: usar o formato CANÔNICO /artist/{slug}_{id} — o formato
    // legado /tabs/{slug}_tabs.htm redireciona só com underscore
    // (ex.: elvis_presley), e slugs com hífen (elvis-presley) dão 404.
    artistPages: [
      'https://www.ultimate-guitar.com/artist/adele_20519',
      'https://www.ultimate-guitar.com/artist/ed_sheeran_30232',
      'https://www.ultimate-guitar.com/artist/taylor_swift_16027',
      'https://www.ultimate-guitar.com/artist/the_beatles_1916',
      'https://www.ultimate-guitar.com/artist/bob_marley_9676',
      'https://www.ultimate-guitar.com/artist/iz_kamakawiwoole_121917',
      'https://www.ultimate-guitar.com/artist/vance_joy_37940',
      'https://www.ultimate-guitar.com/artist/bruno_mars_28280',
      'https://www.ultimate-guitar.com/artist/rihanna_14817',
      'https://www.ultimate-guitar.com/artist/coldplay_1782',
      'https://www.ultimate-guitar.com/artist/billie_eilish_66748',
      'https://www.ultimate-guitar.com/artist/elvis_presley_11125',
      'https://www.ultimate-guitar.com/artist/train_250',
      'https://www.ultimate-guitar.com/artist/passenger_21762',
      'https://www.ultimate-guitar.com/artist/twenty_one_pilots_36284',
      'https://www.ultimate-guitar.com/artist/oasis_734',
      'https://www.ultimate-guitar.com/artist/radiohead_578',
      'https://www.ultimate-guitar.com/artist/jack_johnson_10609',
      'https://www.ultimate-guitar.com/artist/lorde_40477',
      'https://www.ultimate-guitar.com/artist/jason_mraz_10984',
      'https://www.ultimate-guitar.com/artist/john_mayer_10857',
      'https://www.ultimate-guitar.com/artist/queen_590',
      'https://www.ultimate-guitar.com/artist/nirvana_780',
      'https://www.ultimate-guitar.com/artist/u2_149',
      'https://www.ultimate-guitar.com/artist/elton_john_10605',
    ],
    limitPerArtist: 5,
    delayMs: 1200,
    enabled: true,
  },
  {
    id: 'ufret-ja',
    name: 'U-FRET (JA — violão/ukulele/piano)',
    region: 'INT',
    lang: 'ja',
    instrument: 'violão/ukulele/piano',
    // A página do artista é artist.php?data=<nome> e lista centenas de
    // song.php?data=ID. A cifra completa (letra + acordes [X]) vem numa
    // variável JS `ufret_chord_datas` (JSON) no HTML — parseável sem DOM.
    // Testado 2026-08: HTML puro, UTF-8, sem Cloudflare.
    artistQuery: { names: UFRET_ARTISTS, buildUrl: ufretArtistUrl },
    artistPages: [],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: true,
  },
  {
    id: 'guitaretab-int',
    name: 'GuitarTabs (INT/EN)',
    region: 'INT',
    lang: 'multi',
    instrument: 'violão/guitarra',
    // Agregador global (HTML puro, testado 2026-08). Artistas ES/FR/DE entram
    // aqui para dar conteúdo a esses idiomas. Algumas cifras são bloqueadas
    // por licença do site (viram erro suave). Formato:
    // <pre class="js-tab-fit-to-screen"> com linhas <span class="js-tab-row">;
    // título/artista saem do og:title ("X tab ver. 2 with lyrics by Y...").
    artistPages: [
      // EN (base)
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
      // ES — artistas latinos (idioma espanhol)
      'https://www.guitaretab.com/s/shakira/',
      'https://www.guitaretab.com/j/juanes/',
      'https://www.guitaretab.com/f/fito-paez/',
      'https://www.guitaretab.com/r/ricardo-arjona/',
      'https://www.guitaretab.com/m/mana/',
      'https://www.guitaretab.com/s/soda-stereo/',
      'https://www.guitaretab.com/l/luis-miguel/',
      'https://www.guitaretab.com/e/enrique-iglesias/',
      // FR — artistas francófonos (idioma francês)
      'https://www.guitaretab.com/i/indochine/',
      'https://www.guitaretab.com/z/zaz/',
      'https://www.guitaretab.com/s/stromae/',
      'https://www.guitaretab.com/l/louane/',
      'https://www.guitaretab.com/j/johnny-hallyday/',
      'https://www.guitaretab.com/c/christophe-mae/',
      // DE — artistas alemães (idioma alemão)
      'https://www.guitaretab.com/r/rammstein/',
      'https://www.guitaretab.com/t/tokio-hotel/',
      'https://www.guitaretab.com/a/annenmay-kantereit/',
      'https://www.guitaretab.com/d/die-toten-hosen/',
      'https://www.guitaretab.com/x/xavier-naidoo/',
      // JA — alguns artistas japoneses também aparecem no agregador
      'https://www.guitaretab.com/o/one-ok-rock/',
      'https://www.guitaretab.com/r/radwimps/',
    ],
    limitPerArtist: 3,
    delayMs: 800,
    enabled: true,
  },
  // ── SEM FONTE ESTÁVEL (testado 2026-08) — desabilitadas com motivo ──────
  {
    id: 'lacuerda-es',
    name: 'LaCuerda (ES)',
    region: 'INT',
    lang: 'es',
    instrument: 'violão',
    artistPages: ['https://www.lacuerda.net/adele/'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason:
      'Redireciona por JS e devolve 404 em páginas de artista/música (testado 2026-08). Sem HTML estável.',
  },
  {
    id: 'partoch-fr',
    name: 'Partoch (FR)',
    region: 'INT',
    lang: 'fr',
    instrument: 'violão/guitarra',
    artistPages: ['https://www.partoch.com/tablature/artistes'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason:
      'A tablatura é carregada via AJAX/Alpine (pre vazio no HTML). Precisa de headless browser.',
  },
  {
    id: 'echords-multi',
    name: 'E-Chords (ES/FR/DE/IT)',
    region: 'INT',
    lang: 'multi',
    instrument: 'violão/ukulele',
    artistPages: ['https://www.e-chords.com/chords/adele'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason: 'Cloudflare challenge ("Just a moment...") — 403 para HTML puro.',
  },
  {
    id: 'jtotal-ja',
    name: 'J-Total Music (JA)',
    region: 'INT',
    lang: 'ja',
    instrument: 'violão/guitarra',
    artistPages: ['https://www.j-total.net/'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason:
      'Cifra renderizada por JS (tabelas vazias no HTML) + encoding Shift-JIS + busca via CGI. Usar U-FRET (habilitado) no lugar.',
  },
  {
    id: 'jita17-zh',
    name: '17Jita (ZH)',
    region: 'INT',
    lang: 'zh',
    instrument: 'violão/guitarra',
    artistPages: ['https://www.17jita.com/'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason: 'Anti-bot com JS obfuscado (cookie token) — impossível sem headless.',
  },
  {
    id: 'tan8-zh',
    name: 'Tan8 (ZH)',
    region: 'INT',
    lang: 'zh',
    instrument: 'piano/violão',
    artistPages: ['https://www.tan8.com/'],
    limitPerArtist: 3,
    delayMs: 1000,
    enabled: false,
    disabledReason: 'Partituras em imagem (não há letra+cifra em texto no HTML).',
  },
  {
    id: 'letras-br',
    name: 'Letras.mus.br',
    region: 'BR',
    lang: 'pt',
    instrument: 'violão/guitarra',
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
];
