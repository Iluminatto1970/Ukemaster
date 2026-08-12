#!/usr/bin/env node
/**
 * scripts/add-doc-headers.mjs
 *
 * Documentação em massa: insere um cabeçalho JSDoc descritivo no topo de
 * cada arquivo TS/TSX que ainda não tenha documentação. Idempotente — só
 * adiciona quando o arquivo começa com um comentário de bloco já existe
 * (ou com um cabeçalho `//` de propósito), ele é preservado.
 *
 * Uso:
 *   node scripts/add-doc-headers.mjs            # roda e mostra o que mudou
 *   node scripts/add-doc-headers.mjs --dry-run  # só mostra
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** Mapa arquivo → descrição (o que aquele módulo faz / papel no sistema). */
const DOCS = {
  'src/main.tsx':
    'Entrada do app (bootstrap): monta o React no DOM, configura Clerk (auth), analytics e o ThemeProvider/estilos globais.',
  'src/App.tsx':
    'Componente raiz: orquestra toda a experiência — acervo (Supabase + cache local), busca/filtros, votação, repertórios, playlists, modais de anúncio/doação/lead, rotas SPA (/musica/:id) e SEO.',
  'src/auth.tsx':
    'Camada de autenticação: wrapper do Clerk com fallback de sessão local (guest) para o app funcionar sem login; expõe useAuth(), ClerkProvider e utilitários de usuário atual.',
  'src/types.ts':
    'Tipos compartilhados do domínio: Song, Playlist, Repertoire, User, ActiveTab, AdSenseConfig e estruturas usadas pelo app, cron e APIs.',
  'src/config.ts':
    'Configuração global: URLs públicas (APOIA.se, Monetag, scripts de anúncio) e constantes de ambiente do projeto.',
  'src/vite-env.d.ts':
    'Declarações de tipos das variáveis de ambiente VITE_* (import.meta.env) para o TypeScript.',
  // ── lib ────────────────────────────────────────────────────────────────
  'src/lib/supabase.ts':
    'Cliente Supabase do lado do cliente (browser): acesso ao acervo de músicas, votos, playlists e repertórios via PostgREST com fallback localStorage.',
  'src/lib/supabaseServer.ts':
    'Cliente Supabase usado apenas em server-side (APIs Vercel/Express): leitura do acervo para prerender de cifras, sitemap e robots.',
  'src/lib/cloudSync.ts':
    'Sincronização do acervo com a nuvem: push de alterações locais para o Supabase com debounce, filtro anti-corrupção (nunca envia música sem conteúdo) e fallback offline.',
  'src/lib/scraper.ts':
    'Scraping de cifras: extrai músicas de CifraClub e sites internacionais, detecta acordes, limpa títulos/artistas, descarta cifras vazias e lixo de metadados.',
  'src/lib/platforms.ts':
    'Catálogo de plataformas de cifras (BR e internacionais) para o cron: URLs de artistas, delayMs por site e habilitação.',
  'src/lib/platformCron.ts':
    'Motor do cron de plataformas: varre artistas por plataforma até sincronizar tudo, com dedupe anti-duplicata, histórico (cron_imports), cursor de progresso e modo REPARO (restaura conteúdo vazio preservando ids/votos).',
  'src/lib/ratings.ts':
    'Votação e tendências: vota em músicas (1 por usuário), calcula rankings (Mais Votadas / Em Alta 14 dias) e persiste no Supabase com fallback local.',
  'src/lib/repertoires.ts':
    'Repertórios privados por usuário: CRUD no Supabase com fallback localStorage (cada usuário tem o seu; opção de tornar público).',
  'src/lib/leads.ts':
    'Captura de leads (nome/e-mail/WhatsApp) antes do cadastro: grava no Supabase para o banco próprio do proprietário.',
  'src/lib/analytics.ts':
    'Analytics leve (GA4/Plausible via configuração): rastreia page views e eventos-chave (abrir cifra, votar, login, doação).',
  // ── hooks ─────────────────────────────────────────────────────────────
  'src/hooks/useSongSeo.ts':
    'SEO por música: gera JSON-LD, meta tags Open Graph/Twitter e título canônico para páginas de cifra.',
  // ── utils ─────────────────────────────────────────────────────────────
  'src/utils/ads.ts':
    'Utilitários de publicidade: hooks/helpers para anúncios (Carbon Ads e afins).',
  'src/utils/audio.ts':
    'Áudio: geração de tons de referência e metrônomo (Web Audio API).',
  'src/utils/chordUtils.ts':
    'Manipulação de cifras/acordes: transposição de tom, extração de acordes, normalização e formatação para exibição.',
  'src/utils/license.ts':
    'Licenciamento: marca d\'água/textos legais e helpers de atribuição.',
  'src/utils/pitchDetector.ts':
    'Detecção de pitch (afinador): captura do microfone e análise de frequência (autocorrelação/FFT).',
  'src/utils/seoUtils.ts':
    'SEO global: funções de descrição, palavras-chave e estrutura de dados para crawlers.',
  // ── data ──────────────────────────────────────────────────────────────
  'src/data/chords.ts':
    'Dicionário de acordes de ukulele: digitações (posições) para o diagrama SVG, organizadas por nota e tipo.',
  'src/data/defaultSongs.ts':
    'Acervo inicial/semente: músicas e playlists padrão usadas no primeiro carregamento (fallback sem nuvem).',
  // ── components ────────────────────────────────────────────────────────
  'src/components/Header.tsx':
    'Cabeçalho fixo: busca global, logo, botões de apoio/doação, notificações e autenticação (Clerk).',
  'src/components/Sidebar.tsx':
    'Menu lateral de navegação (desktop e mobile): HOME, Repertórios, Dicionário, Playlists, Estudo de Ritmos, Afinador e ADMIN (só proprietário).',
  'src/components/SongList.tsx':
    'Listagem principal do acervo: busca/filtros por gênero e nível, ranking Mais Votadas (estilo CifraClub), linhas densas de músicas, ações (votar, playlist, editar, excluir só admin) e widgets laterais (Em Alta, Artistas, Repertório).',
  'src/components/SongViewer.tsx':
    'Leitor de cifra: transposição, auto-scroll, tamanho de fonte, tablaturas, vídeo YouTube, voto, repertório e ações (editar/excluir admin).',
  'src/components/SongEditor.tsx':
    'Editor de cifra: criar/editar músicas com busca de vídeo, adaptação de tom, tags/SEO e estrutura passo a passo.',
  'src/components/PlaylistManager.tsx':
    'Gerenciamento de playlists: criar, renomear, excluir e adicionar músicas da biblioteca.',
  'src/components/ImportSongModal.tsx':
    'Importação de músicas: de texto livre, URL de cifra (scraping) ou JSON exportado.',
  'src/components/Dashboard.tsx':
    'Repertórios privados do usuário: listagem, organização e compartilhamento público.',
  'src/components/ChordDiagram.tsx':
    'Diagrama SVG de acorde de ukulele (tamanhos xs→lg) com posição dos dedos e som de referência.',
  'src/components/ChordDictionary.tsx':
    'Dicionário de acordes: grade navegável com diagramas, busca e filtros por tom/tipo.',
  'src/components/Tuner.tsx':
    'Afinador: microfone + detecção de pitch em tempo real, com indicação de afinação por corda (G C E A).',
  'src/components/StrummingGuide.tsx':
    'Guia de ritmos/levadas (estudo de ritmos): padrões de batida com notação e dicas para o ukulele.',
  'src/components/TraditionalTabBlock.tsx':
    'Renderização de tablatura tradicional (linhas de corda com números) dentro da cifra.',
  'src/components/YouTubePlayer.tsx':
    'Player de vídeo do YouTube embutido (se a música tiver vídeo associado).',
  'src/components/AdInterstitialModal.tsx':
    'Anúncio intersticial antes de abrir cifras (a cada 2ª): espera mínima para monetizar a impressão e botão Continuar liberado após o tempo.',
  'src/components/AdSenseSlot.tsx':
    'Bloco de anúncio Google AdSense real: injeta adsbygoogle.js e registra o slot (formatos auto/rectangle/horizontal).',
  'src/components/StickyBottomAd.tsx':
    'Anúncio fixo na base (mobile): aparece após rolar, com botão fechar — âncora de alto eCPM.',
  'src/components/Monetag.tsx':
    'Injeção dos scripts Monetag (push, vignette e tags) no <head> para monetização sem paywall.',
  'src/components/LeadCaptureModal.tsx':
    'Captura de lead (nome/e-mail/WhatsApp) antes do cadastro — alimenta o banco do proprietário.',
  'src/components/DonationModal.tsx':
    'Modal de doação: APOIA.se + QR Pix (chave copiável) para apoiar o portal gratuito.',
  'src/components/SupportPrompt.tsx':
    'Banner de apoio no topo: convida a doar no APOIA.se e explica que anúncios mantêm o portal.',
  'src/components/AdminScraper.tsx':
    'Área ADMIN (só iluminatto@gmail.com): importação em massa, scraping por URL/artista e disparo do cron de plataformas.',
  'src/components/Logo.tsx':
    'Logo do UkeMaster Pro (SVG/texto) nas variações usadas no header e footer.',
  // ── api (serverless Vercel) ───────────────────────────────────────────
  'api/musica.ts':
    'Endpoint /api/musica: prerender da página de cifra para crawlers (HTML com conteúdo), usado pela rota /musica/:id.',
  'api/sitemap.ts':
    'Endpoint /api/sitemap: gera o sitemap.xml dinâmico com todas as cifras (SEO para o Google indexar).',
  'api/robots.ts':
    'Endpoint /api/robots: gera robots.txt apontando para o sitemap.',
  'api/scrape.ts':
    'Endpoint /api/scrape: scraping on-demand de uma URL de cifra (usado pelo AdminScraper).',
  'api/scrape-platforms.ts':
    'Endpoint /api/scrape-platforms: dispara o cron de plataformas (BR/internacionais) sob demanda.',
  'api/fetch-url.ts':
    'Endpoint utilitário: proxy de fetch de URLs (usado para ler páginas no editor/importação).',
  // ── scripts ───────────────────────────────────────────────────────────
  'scripts/cron-runner.ts':
    'CLI do cron de plataformas (gera ukemaster-cron.mjs): flags --platform/--artist/--repair/--fast/--budget/--reset e leitura de .env.',
  'scripts/handoff.ts':
    'Helper de handoff para outras IAs/CLIs: despeja HANDOFF.md + git status + diff resumido.',
  'scripts/add-doc-headers.mjs':
    'Este script: insere cabeçalhos JSDoc descritivos nos arquivos TS/TSX sem documentação.',
};

const EXT = new Set(['.ts', '.tsx']);
const files = [];
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!['node_modules', 'dist', 'dist-cron', '.git'].includes(ent.name)) walk(p);
    } else if (EXT.has(path.extname(ent.name))) {
      files.push(p);
    }
  }
};
walk(path.join(ROOT, 'src'));
walk(path.join(ROOT, 'api'));
walk(path.join(ROOT, 'scripts'));

const dryRun = process.argv.includes('--dry-run');
let changed = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');

  // Já documentado? Só pula se a PRIMEIRA linha for um comentário de bloco
  // (/**) ou de linha (//) — guarda simples e previsível.
  const firstLine = src.split('\n')[0].trim();
  if (/^\/\*\*/.test(firstLine) || /^\/\//.test(firstLine)) continue;

  const desc = DOCS[rel];
  if (!desc) continue; // sem descrição mapeada — não inventa

  const header = `/**\n * ${desc}\n */\n`;
  if (src.startsWith(header)) continue;

  if (dryRun) {
    console.log(`+ ${rel}`);
    changed++;
    continue;
  }

  // Insere o cabeçalho na primeira linha, preservando shebang se houver
  if (src.startsWith('#!')) {
    const nl = src.indexOf('\n');
    fs.writeFileSync(file, src.slice(0, nl + 1) + header + src.slice(nl + 1));
  } else {
    fs.writeFileSync(file, header + src);
  }
  changed++;
  console.log(`+ ${rel}`);
}

console.log(`\n${changed} arquivo(s) ${dryRun ? 'a documentar' : 'documentado(s)'}.`);
