/**
 * TEMP: coleta os artistas em destaque de CADA página de gênero do CifraClub.
 * Saída: /tmp/genre-artists.tsv  (genero<TAB>slug<TAB>nome)
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const GENRES = [
  'afrobeats','alternativo-indie','arrocha','axe','bachata','blues','bolero',
  'bossa-nova','brega-funk','brega','cha-cha','classico','corridos','country',
  'cuarteto','cumbia','dance','dancehall','dembow','disco','eletronica','emocore',
  'experimental','fado','flamenco-bulerias','folk','forro','funk-internacional',
  'funk','gospelreligioso','gotico','grunge','guarania','hard-rock','hardcore',
  'heavy-metal','hip-hop-rap','house','hyperpop','industrial','infantil',
  'instrumental','j-popj-rock','jazz','jovem-guarda','k-pop','mambo','marchas-hinos',
  'mariachi','merengue','metal','mpb','musica-andina','musica-de-banda','nativista',
  'new-age','new-wave','pagode','piseiro','pop','poprock','post-rock','power-pop',
  'progressivo','psicodelia','punk-rock','ranchera','rb','reggae','reggaeton',
  'regional','rock-alternativo','rock-roll','rock','rockabilly','romantico','salsa',
  'samba-enredo','samba','sertanejo','ska','soft-rock','soul','surf-music','tango',
  'tecnopop','trap','trova','turreo-rkt','vallenato','velha-guarda','world-music',
  'xote','zamba','zouk',
];

const SKIP = /^\/(estilos|academy|blog|afinador|enviar|assine|catolicas|mais-acessadas|novidades|metronomo|pedir-videoaula|top-musicas|videos|letra|acordes|artistas)\//;

function slugToName(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function collect(genre) {
  const url = `https://www.cifraclub.com.br/estilos/${genre}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const links = new Set();
    const re = /href="\/([a-z0-9][a-z0-9-]*)\/"/g;
    let m;
    while ((m = re.exec(html))) {
      const slug = m[1];
      if (SKIP.test(`/${slug}/`)) continue;
      links.add(slug);
    }
    return [...links];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

import fs from 'fs';
const OUT = 'C:\\Users\\ilumi\\AppData\\Local\\Temp\\genre-artists.tsv';
const seen = new Map();
const raw = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8') : '';
for (const line of raw.split(/\r?\n/).filter(Boolean)) {
  const [genre, slug] = line.split('\t');
  if (slug && !seen.has(slug)) seen.set(slug, genre);
}

// Salva INCREMENTALMENTE (append) — se o script morrer, não refaz tudo.
// Retoma do último gênero já coletado.
let resumed = 0;
for (let i = 0; i < GENRES.length; i++) {
  const g = GENRES[i];
  if ([...seen.values()].includes(g)) { resumed++; continue; }
  const slugs = await collect(g);
  const lines = slugs.filter((s) => !seen.has(s)).map((s) => `${g}\t${s}\t${slugToName(s)}`);
  if (lines.length) {
    fs.appendFileSync(OUT, lines.join('\n') + '\n');
    for (const l of lines) seen.set(l.split('\t')[1], g);
  }
  process.stdout.write(`[${i + 1}/${GENRES.length}] ${g}: +${lines.length} artistas\n`);
  await new Promise((r) => setTimeout(r, 600)); // educado: ~600ms entre requisições
}

const uniq = new Map();
for (const line of fs.readFileSync(OUT, 'utf-8').split(/\r?\n/).filter(Boolean)) {
  const [genre, slug] = line.split('\t');
  if (slug && !uniq.has(slug)) uniq.set(slug, genre);
}
console.log(`\nTOTAL artistas únicos: ${uniq.size} (arquivo em ${OUT})`);
