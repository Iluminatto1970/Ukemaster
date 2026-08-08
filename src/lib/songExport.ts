/**
 * Exportação de cifras para download: gera documentos standalone (HTML) com
 * LETRA + CIFRA + DIAGRAMAS de acordes (imagens SVG inline) para uma música,
 * uma playlist ou um repertório. Também exporta o texto ChordPro puro (.txt).
 *
 * Uso:
 *   downloadSongHtml(song)          → baixa .html da música
 *   downloadSongTxt(song)           → baixa .txt (ChordPro)
 *   printSong(song)                 → abre janela de impressão (salvar PDF)
 *   downloadCollectionHtml(title, songs) → baixa .html com N músicas
 */
import { Song, ChordFingering } from '../types';
import { findChord } from '../data/chords';
import { parseChordPro, extractUniqueChords, splitSlashChord } from '../utils/chordUtils';

// ── Logo oficial (emblema PNG) embutido como data URI ─────────────────────

let cachedLogoPromise: Promise<string | null> | null = null;

/**
 * Carrega o emblema oficial (public/logo.png) e o converte para data URI
 * base64 — assim o documento baixado/impresso é 100% standalone e offline.
 * A *promise* é cacheada (chamadas concorrentes não repetem o fetch); em
 * falha (offline/CDN), resolve null e o documento usa o fallback em texto
 * com as cores da marca.
 */
async function loadLogoDataUri(): Promise<string | null> {
  if (!cachedLogoPromise) {
    cachedLogoPromise = (async () => {
      try {
        const res = await fetch('/logo.png', { cache: 'force-cache' });
        if (!res.ok) throw new Error(`logo ${res.status}`);
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
  }
  return cachedLogoPromise;
}

/** HTML do cabeçalho de marca (logo oficial + wordmark nas cores da marca). */
function brandHeaderHtml(logoUri: string | null, count: number): string {
  const countLabel = `${count} ${count === 1 ? 'cifra' : 'cifras'}`;
  const logoHtml = logoUri
    ? `<img class="brand-logo" src="${logoUri}" alt="UkeMaster Pro" />`
    : `<span class="brand-badge">🎵</span>`;
  return `
  <div class="brand">
    <div class="brand-id">
      ${logoHtml}
      <div>
        <h1>UKE<span>MASTER</span> <em>PRO</em></h1>
        <p><span class="star">★</span> Seu Portal do Ukulele</p>
      </div>
    </div>
    <span class="count">${countLabel}</span>
  </div>`;
}

// ── Helpers básicos ───────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugify(s: string): string {
  return (s || 'download')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'download';
}

export function downloadTextFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function openPrintWindow(html: string, title = 'Imprimir') {
  const w = window.open('', '_blank', 'width=920,height=720');
  if (!w) {
    alert('Permita pop-ups para imprimir/salvar em PDF.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  w.focus();
  // Deixa o navegador renderizar (fontes/diagramas) e então abre a impressão
  window.setTimeout(() => {
    try {
      w.print();
    } catch {
      // alguns navegadores bloqueiam o print automático — o usuário usa Ctrl+P
    }
  }, 500);
}

// ── Diagrama de acorde como SVG string ────────────────────────────────────

interface DiagramDims {
  width: number;
  height: number;
  padding: number;
  fontSize: number;
}

const DIAGRAM_DIMS: Record<'sm' | 'md', DiagramDims> = {
  sm: { width: 96, height: 108, padding: 14, fontSize: 10 },
  md: { width: 118, height: 132, padding: 17, fontSize: 12 },
};

/**
 * Gera o SVG do diagrama de ukulele (igual ao ChordDiagram da UI, mas como
 * string pura para embutir no documento baixado/imprimido).
 */
export function chordDiagramSvg(chordName: string, size: 'sm' | 'md' = 'md'): string {
  const def = findChord(chordName);
  if (!def || !def.fingerings || def.fingerings.length === 0) return '';
  const fingering: ChordFingering = def.fingerings[0];
  const { frets, fingers = [0, 0, 0, 0], barreFret, baseFret = 1 } = fingering;

  const dims = DIAGRAM_DIMS[size];
  const { width, height, padding, fontSize } = dims;
  const numFrets = 4;
  const boardWidth = width - padding * 2;
  const boardHeight = height - padding * 2.2;
  const stringSpacing = boardWidth / 3;
  const fretSpacing = boardHeight / numFrets;
  const strings = ['G', 'C', 'E', 'A'];

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

  // Casa inicial (traste base) quando começa acima do 1º
  if (baseFret > 1) {
    svg += `<text x="${padding - 8}" y="${padding + fretSpacing / 2 + 4}" fill="#6C7E93" font-size="9" font-weight="bold" text-anchor="end">${baseFret}ª</text>`;
  }

  // Pestana (linha grossa se 1º traste, fina se outro)
  svg += `<line x1="${padding}" y1="${padding}" x2="${padding + boardWidth}" y2="${padding}" stroke="${baseFret === 1 ? '#0E7C7B' : '#8C9BAE'}" stroke-width="${baseFret === 1 ? 3.5 : 1.5}" />`;

  // Linhas horizontais (4 trastes)
  for (let i = 0; i <= numFrets; i++) {
    svg += `<line x1="${padding}" y1="${padding + i * fretSpacing}" x2="${padding + boardWidth}" y2="${padding + i * fretSpacing}" stroke="#D4DCE4" stroke-width="1.3" />`;
  }

  // Cordas verticais (G, C, E, A) — espessura decrescente
  const stringWidths = [2.2, 1.8, 1.4, 1.2];
  strings.forEach((_, i) => {
    const x = padding + i * stringSpacing;
    svg += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${padding + boardHeight}" stroke="#6C7E93" stroke-width="${stringWidths[i]}" />`;
  });

  // Corda solta (O) / abafada (✕)
  frets.forEach((fret, i) => {
    const x = padding + i * stringSpacing;
    const y = padding - 8;
    if (fret === 0) {
      svg += `<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="#0E7C7B" stroke-width="1.4" />`;
    } else if (fret < 0) {
      svg += `<text x="${x}" y="${y + 3}" fill="#F26419" font-size="10" font-weight="bold" text-anchor="middle">✕</text>`;
    }
  });

  // Barre (pestana em traste específico)
  if (barreFret) {
    svg += `<rect x="${padding - 2}" y="${padding + (barreFret - baseFret) * fretSpacing + fretSpacing * 0.25}" width="${boardWidth + 4}" height="${fretSpacing * 0.5}" rx="3.5" fill="#0E7C7B" opacity="0.9" />`;
  }

  // Dedos (bolinhas + número do dedo)
  frets.forEach((fret, stringIdx) => {
    if (fret <= 0) return;
    const relativeFret = fret - baseFret + 1;
    if (relativeFret < 1 || relativeFret > numFrets) return;
    const x = padding + stringIdx * stringSpacing;
    const y = padding + (relativeFret - 0.5) * fretSpacing;
    const fingerNum = fingers[stringIdx] ?? 0;
    svg += `<circle cx="${x}" cy="${y}" r="7.5" fill="#1D2D44" stroke="#F26419" stroke-width="1.4" />`;
    if (fingerNum > 0) {
      svg += `<text x="${x}" y="${y + 3}" fill="#ffffff" font-size="8.5" font-weight="bold" text-anchor="middle">${fingerNum}</text>`;
    }
  });

  // Nomes das cordas na base
  strings.forEach((strName, i) => {
    svg += `<text x="${padding + i * stringSpacing}" y="${height - 3}" fill="#6C7E93" font-size="9" font-weight="600" text-anchor="middle">${strName}</text>`;
  });

  svg += '</svg>';
  return svg;
}

/** Resolve o diagrama do acorde (slash chord → base simplificada). */
function resolveDiagram(chordName: string): { label: string; svg: string; simplified?: string } {
  // Tamanho 'sm' no documento: diagramas compactos, ideais para impressão
  const direct = findChord(chordName);
  if (direct) {
    return { label: chordName, svg: chordDiagramSvg(chordName, 'sm') };
  }
  const { base } = splitSlashChord(chordName);
  if (base !== chordName && findChord(base)) {
    return { label: chordName, svg: chordDiagramSvg(base, 'sm'), simplified: base };
  }
  return { label: chordName, svg: '' };
}

// ── Construção do documento ───────────────────────────────────────────────

const DOC_STYLES = `
  * { box-sizing: border-box; }
  @page { size: A4; margin: 14mm 12mm; }
  body {
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1D2D44; background: #fff; margin: 0; padding: 0;
  }
  .brand {
    background: #0E7C7B; color: #fff; border-radius: 12px; padding: 12px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .brand .brand-id { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand .brand-logo { width: 46px; height: 46px; object-fit: contain; border-radius: 10px;
    background: #fff; padding: 3px; flex-shrink: 0; }
  .brand .brand-badge { font-size: 30px; line-height: 1; flex-shrink: 0; }
  .brand h1 { font-size: 18px; margin: 0; letter-spacing: 1px; font-weight: 900; white-space: nowrap; }
  .brand h1 span { color: #7FD1CF; }
  .brand h1 em { color: #F6AE2D; font-style: normal; }
  .brand p { margin: 2px 0 0; font-size: 10px; opacity: 0.9; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1.5px; }
  .brand p .star { color: #F6AE2D; }
  .brand .count { background: #F26419; color: #fff; font-size: 11px; font-weight: 800;
    padding: 5px 12px; border-radius: 999px; white-space: nowrap; }
  .song { margin-top: 22px; page-break-before: always; }
  .song:first-of-type { page-break-before: avoid; margin-top: 16px; }
  .song-head { border-bottom: 3px solid #F26419; padding-bottom: 10px; margin-bottom: 12px; }
  .song-head h2 { font-size: 22px; margin: 0; color: #1D2D44; }
  .song-head h3 { font-size: 14px; margin: 2px 0 0; color: #0E7C7B; font-weight: 700; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .meta span { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px;
    background: #F0F4F4; color: #33424f; border: 1px solid #dde6e6; }
  .meta .tom { background: #FEF0E8; color: #F26419; border-color: #fbd8c4; }
  .chords-title { font-size: 11px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 1px; color: #0E7C7B; margin: 14px 0 8px; }
  .chords-grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .diagram { border: 1px solid #dde6e6; border-radius: 10px; padding: 8px 10px 6px;
    text-align: center; background: #fff; }
  .diagram .dname { display: block; font-size: 13px; font-weight: 900; color: #1D2D44; }
  .diagram .dnote { display: block; font-size: 9px; color: #F26419; font-weight: 700;
    margin-top: 2px; }
  .lyrics { font-family: ui-monospace, SFMono-Regular, Consolas, Menlo, monospace;
    white-space: pre-wrap; margin-top: 6px; }
  .line { margin: 0; line-height: 1.65; }
  .tok { display: inline-block; vertical-align: bottom; }
  .chord { display: block; color: #F26419; font-weight: 800; font-size: 11px;
    line-height: 1.15; height: 15px; }
  .lyr { font-size: 13px; }
  .section { font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;
    font-size: 11px; color: #0E7C7B; margin: 14px 0 4px; }
  pre.tab { font-family: ui-monospace, SFMono-Regular, Consolas, Menlo, monospace;
    font-size: 11.5px; line-height: 1.4; margin: 2px 0 6px; color: #33424f; }
  .empty { font-size: 12px; color: #8a97a5; font-style: italic; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px dashed #dde6e6;
    font-size: 10.5px; color: #8a97a5; text-align: center; }
  .toc { margin: 14px 0 4px; }
  .toc li { font-size: 12.5px; margin: 3px 0; }
  .toc li b { color: #F26419; }
  @media print {
    .song { page-break-before: always; }
    .song:first-of-type { page-break-before: avoid; }
  }
`;

function songSectionHtml(song: Song, index?: number): string {
  const meta: string[] = [];
  if (song.key) meta.push(`<span class="tom">Tom: ${escapeHtml(song.key)}</span>`);
  if (song.difficulty) meta.push(`<span>${escapeHtml(song.difficulty)}</span>`);
  if (song.category) meta.push(`<span>${escapeHtml(song.category)}</span>`);
  if (song.strummingPattern) meta.push(`<span>Ritmo: ${escapeHtml(song.strummingPattern)}</span>`);

  // Acordes usados → diagramas
  let chordsHtml = '';
  if (song.content) {
    const chords = extractUniqueChords(song.content, 0);
    const diagrams = chords.map(resolveDiagram).filter((d) => d.svg);
    if (diagrams.length > 0) {
      chordsHtml = `
        <div class="chords-title">🎸 Acordes usados (${diagrams.length})</div>
        <div class="chords-grid">
          ${diagrams
            .map(
              (d) => `<div class="diagram">
                <span class="dname">${escapeHtml(d.label)}</span>
                ${d.svg}
                ${d.simplified ? `<span class="dnote">toque como ${escapeHtml(d.simplified)}</span>` : ''}
              </div>`
            )
            .join('')}
        </div>`;
    }
  }

  // Letra + cifra (ChordPro) linha a linha
  let lyricsHtml = '';
  if (song.content) {
    const parsedLines = parseChordPro(song.content, 0);
    lyricsHtml = parsedLines
      .map((line) => {
        if (line.isSectionHeader) {
          return `<div class="section">${escapeHtml(line.sectionTitle || '')}</div>`;
        }
        if (line.isTabLine) {
          const text = line.tabContent || line.rawLine;
          if (!text || text === '--- Tablatura ---') return '';
          return `<pre class="tab">${escapeHtml(text)}</pre>`;
        }
        if (line.tokens.length === 0) return '<div class="line"><br/></div>';
        // Linha só de acordes (sem letra) → linha compacta de acordes
        const hasLyrics = line.tokens.some((t) => (t.text || '').trim() !== '');
        if (!hasLyrics) {
          const chords = line.tokens
            .filter((t) => t.chord)
            .map((t) => `<span class="chord" style="display:inline-block;margin-right:14px;height:auto">${escapeHtml(t.chord || '')}</span>`)
            .join('');
          return chords ? `<div class="line">${chords}</div>` : '';
        }
        return `<div class="line">${line.tokens
          .map((t) =>
            t.chord
              ? `<span class="tok"><span class="chord">${escapeHtml(t.chord)}</span><span class="lyr">${escapeHtml(t.text || '')}</span></span>`
              : `<span class="lyr">${escapeHtml(t.text || '')}</span>`
          )
          .join('')}</div>`;
      })
      .join('');
  } else {
    lyricsHtml = `<div class="empty">Cifra completa indisponível para este download (conteúdo não carregado).</div>`;
  }

  const head = `
    <div class="song-head">
      <h2>${index !== undefined ? `${index}. ` : ''}${escapeHtml(song.title)}</h2>
      <h3>${escapeHtml(song.artist || '')}</h3>
      <div class="meta">${meta.join('')}</div>
    </div>`;

  return `<article class="song">${head}${chordsHtml}<div class="lyrics">${lyricsHtml}</div></article>`;
}

/** Documento completo (HTML standalone, imprimível) de UMA música. */
export function buildSongDocument(song: Song, logoUri: string | null = null): string {
  return buildCollectionDocument(`${song.title} — ${song.artist}`, [song], false, logoUri);
}

/** Documento completo (HTML standalone) de uma coleção (playlist/repertório). */
export function buildCollectionDocument(
  title: string,
  songs: Song[],
  withToc = true,
  logoUri: string | null = null
): string {
  const safeTitle = escapeHtml(title);
  const toc = withToc
    ? `<ol class="toc">${songs
        .map(
          (s, i) =>
            `<li><b>${i + 1}.</b> ${escapeHtml(s.title)} — ${escapeHtml(s.artist || '')}</li>`
        )
        .join('')}</ol>`
    : '';
  const sections = songs
    .map((s, i) => (withToc ? songSectionHtml(s, i + 1) : songSectionHtml(s)))
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${safeTitle} — UkeMaster Pro</title>
<!-- CSP rígida: o documento é estático (SVG inline + CSS inline apenas).
     Nenhum script executa e nenhum recurso externo é carregado — mesmo
     que um conteúdo malicioso passasse pelos escapes, ele não roda aqui. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" />
<meta name="referrer" content="no-referrer" />
<style>${DOC_STYLES}</style>
</head>
<body>
  ${brandHeaderHtml(logoUri, songs.length)}

  <h2 style="font-size:20px;margin:16px 0 2px">${safeTitle}</h2>
  <p style="font-size:12px;color:#6C7E93;margin:0 0 4px">Gerado em ${new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })} • Afinação padrão G C E A</p>
  ${toc}
  ${sections}
  <div class="foot">Documento gerado por UkeMaster Pro — ukemasterpro.com 💚</div>
</body>
</html>`;
}

// ── Ações de download ─────────────────────────────────────────────────────

export async function downloadSongHtml(song: Song) {
  const logoUri = await loadLogoDataUri();
  downloadTextFile(
    `${slugify(song.artist)}-${slugify(song.title)}.html`,
    buildSongDocument(song, logoUri),
    'text/html'
  );
}

export function downloadSongTxt(song: Song) {
  const header = `${song.title} — ${song.artist}${song.key ? ` (Tom: ${song.key})` : ''}\n\n`;
  // A marca fica NO FINAL (não no topo): a 1ª linha é o título da música,
  // então reimportar o .txt no app não confunde o parser de metadados.
  const brand = '\n\n— Baixado de UkeMaster Pro (ukemasterpro.com) 💚 —\n';
  downloadTextFile(
    `${slugify(song.artist)}-${slugify(song.title)}.txt`,
    header + (song.content || 'Cifra indisponível.') + brand
  );
}

export async function printSong(song: Song) {
  const logoUri = await loadLogoDataUri();
  openPrintWindow(buildSongDocument(song, logoUri), `${song.title} — ${song.artist} | UkeMaster Pro`);
}

export async function downloadCollectionHtml(title: string, songs: Song[]) {
  const logoUri = await loadLogoDataUri();
  downloadTextFile(
    `${slugify(title)}-ukemaster.html`,
    buildCollectionDocument(title, songs, true, logoUri),
    'text/html'
  );
}
