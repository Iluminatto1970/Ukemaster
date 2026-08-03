import React, { useState } from 'react';
import { Song } from '../types';
import { autoConvertTextToChordPro, extractUniqueChords, extractYouTubeId, extractSongMetadata, generateSongSeoAndHashtags, findDuplicateSong } from '../utils/chordUtils';
import { findChord, ALL_KEYS } from '../data/chords';
import { ChordDiagram } from './ChordDiagram';
import { YouTubePlayer } from './YouTubePlayer';
import { FileText, Upload, Sparkles, X, Check, Music, FileCode, Edit3, Volume2, Link, Globe, Loader2, AlertCircle, Youtube, Search, ExternalLink, Copy, Share2, Tag, RefreshCw } from 'lucide-react';
import { playUkuleleChord } from '../utils/audio';

interface ImportSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSongs: (importedSongs: Song[]) => void;
  existingSongs?: Song[];
  onSelectSong?: (song: Song) => void;
}

export const ImportSongModal: React.FC<ImportSongModalProps> = ({
  isOpen,
  onClose,
  onImportSongs,
  existingSongs = [],
  onSelectSong,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste' | 'link'>('file');
  const [pastedText, setPastedText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  // Link / URL Import State
  const [urlInput, setUrlInput] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string>('');

  // Editable song fields for the imported song
  const [title, setTitle] = useState<string>('');
  const [artist, setArtist] = useState<string>('');
  const [songKey, setSongKey] = useState<string>('C');
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'Iniciante' | 'Intermediário' | 'Avançado'>('Iniciante');
  const [formattedContent, setFormattedContent] = useState<string>('');
  const [detectedChords, setDetectedChords] = useState<string[]>([]);
  const [seoDescription, setSeoDescription] = useState<string>('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [copiedHashtags, setCopiedHashtags] = useState<boolean>(false);
  const [isProcessed, setIsProcessed] = useState<boolean>(false);

  const duplicateMatch = isProcessed ? findDuplicateSong(title, artist, existingSongs) : undefined;

  if (!isOpen) return null;

  // Process raw text through automatic chord & metadata detection
  const processRawSongText = (raw: string, fallbackTitle: string = 'Nova Música') => {
    if (!raw.trim()) return;

    // Check if JSON array first
    try {
      const parsedJson = JSON.parse(raw);
      const jsonSongs: Song[] = Array.isArray(parsedJson)
        ? parsedJson
        : parsedJson.songs && Array.isArray(parsedJson.songs)
        ? parsedJson.songs
        : null;

      if (jsonSongs) {
        let duplicateCount = 0;
        jsonSongs.forEach((s) => {
          if (findDuplicateSong(s.title || '', s.artist || '', existingSongs)) {
            duplicateCount++;
          }
        });

        if (duplicateCount > 0) {
          if (
            window.confirm(
              `Análise de duplicidade: Sua base de dados já possui ${duplicateCount} das ${jsonSongs.length} músicas deste arquivo JSON.\n\nDeseja atualizar as existentes e importar as novas?`
            )
          ) {
            onImportSongs(jsonSongs);
            onClose();
            return;
          } else if (
            window.confirm('Deseja importar APENAS as músicas novas (ignorando as duplicadas)?')
          ) {
            const onlyNew = jsonSongs.filter(
              (s) => !findDuplicateSong(s.title || '', s.artist || '', existingSongs)
            );
            onImportSongs(onlyNew);
            onClose();
            return;
          }
        } else {
          onImportSongs(jsonSongs);
          onClose();
          return;
        }
      }
    } catch {
      // Not JSON, continue text processing
    }

    // Auto-detect Title, Artist, Key & Difficulty
    const meta = extractSongMetadata(raw, fallbackTitle);

    // Run auto chord converter
    const { content, detectedChords: chordsFound, suggestedKey } = autoConvertTextToChordPro(raw);

    const finalKey = meta.suggestedKey || suggestedKey || 'C';
    const finalDiff = meta.difficulty || 'Iniciante';

    // Auto-generate SEO Description, Hashtags & Search Tags
    const seoData = generateSongSeoAndHashtags(
      meta.title,
      meta.artist,
      finalKey,
      finalDiff,
      chordsFound
    );

    setTitle(meta.title);
    setArtist(meta.artist);
    setSongKey(finalKey);
    setDifficulty(finalDiff);
    setFormattedContent(content);
    setDetectedChords(chordsFound);
    setSeoDescription(seoData.seoDescription);
    setHashtags(seoData.hashtags);
    setTags(seoData.tags);
    setIsProcessed(true);
  };

  const handleRegenerateSeo = () => {
    const seoData = generateSongSeoAndHashtags(
      title,
      artist,
      songKey,
      difficulty,
      detectedChords
    );
    setSeoDescription(seoData.seoDescription);
    setHashtags(seoData.hashtags);
    setTags(seoData.tags);
  };

  // Fetch and extract content from web link
  const handleFetchUrlContent = async () => {
    if (!urlInput.trim()) return;

    let cleanUrl = urlInput.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    setIsFetchingUrl(true);
    setUrlError('');

    try {
      let htmlText = '';

      // Primary: Call our backend server API endpoint (/api/fetch-url)
      try {
        const serverRes = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: cleanUrl }),
        });

        if (serverRes.ok) {
          const data = await serverRes.json();
          if (data.ok && data.html) {
            htmlText = data.html;
          }
        }
      } catch (e) {
        console.warn('Servidor local indisponível, tentando proxy de backup...', e);
      }

      // Secondary Fallback: jina.ai reader
      if (!htmlText) {
        const proxyRes = await fetch(`https://r.jina.ai/${cleanUrl}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
          },
        });
        if (proxyRes.ok) {
          htmlText = await proxyRes.text();
        }
      }

      // Tertiary Fallback: corsproxy / allorigins
      if (!htmlText) {
        const altRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(cleanUrl)}`);
        if (altRes.ok) {
          htmlText = await altRes.text();
        }
      }

      if (!htmlText || !htmlText.trim()) {
        throw new Error('Não foi possível obter o conteúdo do site informado.');
      }

      // Parse HTML or Markdown
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // Check if CifraClub or standard HTML with chords
      const isCifraClub = cleanUrl.includes('cifraclub.com.br') || htmlText.includes('data-chord-name') || htmlText.includes('data-chord-content');

      let extractedTitle = '';
      let extractedArtist = '';
      let extractedKey = '';
      let extractedText = '';

      if (isCifraClub) {
        // Dedicated CifraClub parser
        const h1 = doc.querySelector('h1');
        if (h1) extractedTitle = h1.textContent?.trim() || '';

        const h2 = doc.querySelector('h2');
        if (h2) extractedArtist = h2.textContent?.trim() || '';

        const toneBtn = doc.querySelector('[data-anchor="--chord-tone"]') || doc.querySelector('.eVroG');
        if (toneBtn) {
          const k = toneBtn.textContent?.trim();
          if (k && /^[A-G][b#]?m?$/i.test(k)) extractedKey = k;
        }

        const preEl = doc.querySelector('pre[data-chord-content]') || doc.querySelector('pre') || doc.querySelector('#cifra_cnt') || doc.querySelector('article');
        let cifraHtml = preEl ? preEl.innerHTML : doc.body?.innerHTML || '';

        // Replace <b data-chord-name="X">...</b> with [X]
        cifraHtml = cifraHtml.replace(/<b[^>]*data-chord-name="([^"]+)"[^>]*>[\s\S]*?<\/b>/gi, '[$1]');
        cifraHtml = cifraHtml.replace(/<b[^>]*class="[^"]*c-chord[^"]*"[^>]*>([\s\S]*?)<\/b>/gi, '[$1]');
        cifraHtml = cifraHtml.replace(/<\/div>/gi, '\n');
        cifraHtml = cifraHtml.replace(/<\/p>/gi, '\n');
        cifraHtml = cifraHtml.replace(/<br\s*\/?>/gi, '\n');

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = cifraHtml;
        extractedText = tempDiv.textContent || tempDiv.innerText || '';

        extractedText = extractedText
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      } else {
        // Standard HTML extraction
        let pageTitle = doc.querySelector('title')?.textContent || '';
        pageTitle = pageTitle.replace(/[-|–].*$/, '').trim();
        extractedTitle = pageTitle;

        const cifraEl = doc.querySelector('pre') || doc.querySelector('.cifra') || doc.querySelector('#cifra_cnt') || doc.querySelector('article');
        if (cifraEl) {
          let inner = cifraEl.innerHTML;
          inner = inner.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '[$1]');
          inner = inner.replace(/<\/div>/gi, '\n');
          inner = inner.replace(/<br\s*\/?>/gi, '\n');
          const temp = document.createElement('div');
          temp.innerHTML = inner;
          extractedText = temp.textContent || '';
        } else {
          extractedText = doc.body?.textContent || htmlText;
        }
      }

      if (!extractedText.trim()) {
        throw new Error('Nenhum texto de cifra ou letra foi detectado nesta página.');
      }

      // Process song text
      processRawSongText(extractedText, extractedTitle || 'Música do Link');

      // Override Title, Artist & Key if extracted cleanly
      if (extractedTitle) setTitle(extractedTitle);
      if (extractedArtist) setArtist(extractedArtist);
      if (extractedKey) setSongKey(extractedKey);

    } catch (err: any) {
      console.error('Erro na extração de URL:', err);
      setUrlError('Não foi possível extrair a cifra diretamente desse link devido a bloqueios do servidor de origem. Copie a letra/cifra da página e cole na aba "Copiar e Colar Texto".');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // Extract text from DOCX xml binary
  const extractTextFromDocx = (arrayBuffer: ArrayBuffer): string => {
    try {
      const textDecoder = new TextDecoder('utf-8');
      const rawStr = textDecoder.decode(arrayBuffer);
      // Regex matches XML text nodes <w:t>text</w:t>
      const matches = rawStr.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches && matches.length > 0) {
        return matches.map((m) => m.replace(/<\/?[^>]+(>|$)/g, '')).join(' ');
      }
    } catch {
      // Fallback
    }
    return '';
  };

  // Extract text from PDF binary stream
  const extractTextFromPdf = (arrayBuffer: ArrayBuffer): string => {
    try {
      const textDecoder = new TextDecoder('latin1');
      const pdfStr = textDecoder.decode(arrayBuffer);
      // Extract text streams between (text) Tj or [text] TJ
      const textMatches = pdfStr.match(/\(([^)]+)\)\s*Tj/g);
      if (textMatches && textMatches.length > 0) {
        return textMatches
          .map((tm) => tm.replace(/^\(|\)\s*Tj$/g, ''))
          .filter((t) => t.trim().length > 0)
          .join('\n');
      }
    } catch {
      // Fallback
    }
    return '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    setFileName(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();

    const reader = new FileReader();

    if (ext === 'docx' || ext === 'doc' || ext === 'pdf') {
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer;
        let extractedText = '';

        if (ext === 'docx' || ext === 'doc') {
          extractedText = extractTextFromDocx(buffer);
        } else if (ext === 'pdf') {
          extractedText = extractTextFromPdf(buffer);
        }

        if (!extractedText.trim()) {
          alert(
            `O arquivo "${file.name}" foi lido. Para melhor precisão de notas de arquivos PDF/DOC, você também pode copiar e colar o texto diretamente na aba "Copiar e Colar Texto".`
          );
          const textReader = new FileReader();
          textReader.onload = (te) => {
            processRawSongText(te.target?.result as string, nameWithoutExt);
          };
          textReader.readAsText(file);
        } else {
          processRawSongText(extractedText, nameWithoutExt);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (event) => {
        const textContent = event.target?.result as string;
        processRawSongText(textContent, nameWithoutExt);
      };
      reader.readAsText(file);
    }
  };

  const handleConfirmImport = () => {
    if (!title.trim()) {
      alert('Por favor, informe o título da música.');
      return;
    }

    const cleanYtId = extractYouTubeId(youtubeUrl.trim());

    const newSong: Song = {
      id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: title.trim(),
      artist: artist.trim() || 'Artista Desconhecido',
      key: songKey,
      difficulty,
      content: formattedContent,
      youtubeUrl: youtubeUrl.trim() || undefined,
      youtubeId: cleanYtId || undefined,
      seoDescription: seoDescription.trim() || undefined,
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      tags: tags.length > 0 ? tags : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onImportSongs([newSong]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-stone-100 flex items-center gap-2">
                Importar Música & Detecção de Notas
              </h3>
              <p className="text-xs text-stone-400">
                Importe de arquivos (.TXT, .DOC, .PDF), cole o texto ou extraia de links da web.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Mode Tabs */}
          {!isProcessed && (
            <div className="flex flex-wrap border-b border-stone-800 pb-3 gap-2">
              <button
                onClick={() => setActiveTab('file')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'file'
                    ? 'bg-amber-500 text-stone-950 shadow-md'
                    : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                <FileText className="w-4 h-4" /> Arquivo (.TXT, .DOC, .PDF)
              </button>

              <button
                onClick={() => setActiveTab('paste')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'paste'
                    ? 'bg-amber-500 text-stone-950 shadow-md'
                    : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                <Edit3 className="w-4 h-4" /> Copiar e Colar Texto / Cifra
              </button>

              <button
                onClick={() => setActiveTab('link')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  activeTab === 'link'
                    ? 'bg-amber-500 text-stone-950 shadow-md'
                    : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                }`}
              >
                <Link className="w-4 h-4" /> Importar por Link / URL
              </button>
            </div>
          )}

          {/* Step 1: File, Paste, or Link */}
          {!isProcessed ? (
            <div>
              {activeTab === 'file' && (
                <div className="border-2 border-dashed border-stone-800 hover:border-amber-500/50 bg-stone-950 rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center space-y-3 cursor-pointer relative group">
                  <input
                    type="file"
                    accept=".txt,.doc,.docx,.pdf,.cifra,.chordpro,.json"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="p-4 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-stone-200 font-bold text-sm">
                      Clique ou arraste um arquivo de música
                    </h4>
                    <p className="text-stone-500 text-xs mt-1">
                      Suporta arquivos <strong className="text-stone-300">.TXT, .DOC, .DOCX, .PDF, .CIFRA, .JSON</strong>
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full bg-stone-900 border border-stone-800 text-amber-400 text-[11px] font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Detecção automática das posições dos acordes
                  </span>
                </div>
              )}

              {activeTab === 'paste' && (
                <div className="space-y-3">
                  <label className="text-xs text-stone-400 font-bold block">
                    Cole o texto ou cifra da música aqui (copiado do Word, PDF, Cifra Club, etc.):
                  </label>
                  <textarea
                    rows={12}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder={`Cole aqui a letra com os acordes. Exemplo:

Anunciação - Alceu Valença
Tom: G

[G] Na bruma leve das paixões que vem de [Am]dentro
Tu [C]vens chegando pra brincar no meu [G]quintal...`}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-4 text-stone-200 font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => processRawSongText(pastedText, 'Música Copiada')}
                    disabled={!pastedText.trim()}
                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    <Sparkles className="w-4 h-4" /> Processar e Detectar Notas Automaticamente
                  </button>
                </div>
              )}

              {activeTab === 'link' && (
                <div className="space-y-4">
                  <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                      <Globe className="w-4 h-4" /> Copiar Conteúdo de Link Externo
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed">
                      Cole a URL de uma página com a letra/cifra. O aplicativo irá extrair apenas o conteúdo e detectar todas as notas automaticamente para uso local.
                    </p>

                    <div className="flex gap-2 pt-1">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://www.cifraclub.com.br/artista/musica/"
                        className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-200 text-xs focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={handleFetchUrlContent}
                        disabled={isFetchingUrl || !urlInput.trim()}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-colors shadow-md"
                      >
                        {isFetchingUrl ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Extraindo...
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" /> Copiar e Processar Cifra
                          </>
                        )}
                      </button>
                    </div>

                    {urlError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-400 text-xs mt-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <span>{urlError}</span>
                          <button
                            onClick={() => setActiveTab('paste')}
                            className="block font-bold text-amber-400 underline mt-1 cursor-pointer"
                          >
                            Clique aqui para ir para a aba 'Copiar e Colar Texto'
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-[11px] text-stone-500">
                    <strong className="text-stone-400 block mb-1">Nota sobre os links externos:</strong>
                    O link é utilizado apenas <strong>uma única vez</strong> para ler a cifra. Após importado, todo o conteúdo é salvo localmente em seu acervo no formato do Ukulele sem depender do site original.
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Auto-Detected Review Panel with Live Chord Diagrams */
            <div className="space-y-5">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span className="text-xs font-bold text-amber-300">
                    Música Processada! {detectedChords.length} nota(s) identificada(s) automaticamente.
                  </span>
                </div>
                <button
                  onClick={() => setIsProcessed(false)}
                  className="text-xs text-stone-400 hover:text-stone-200 underline cursor-pointer"
                >
                  Carregar outra origem
                </button>
              </div>

              {/* Duplicate Song Analysis Banner */}
              {duplicateMatch && (
                <div className="bg-amber-950/80 border-2 border-amber-500 rounded-2xl p-4 space-y-3 shadow-xl animate-fadeIn">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                          Análise de Duplicidade
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-amber-100">
                        A música <strong className="text-white font-extrabold">"{duplicateMatch.title}"</strong> de <strong className="text-white font-extrabold">"{duplicateMatch.artist}"</strong> já consta na sua base!
                      </h4>
                      <p className="text-xs text-amber-200/80">
                        Tom cadastrado: <strong>{duplicateMatch.key}</strong> • Nível: <strong>{duplicateMatch.difficulty || 'Iniciante'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-500/30">
                    <button
                      type="button"
                      onClick={() => {
                        const updatedSong: Song = {
                          ...duplicateMatch,
                          title: title.trim(),
                          artist: artist.trim() || duplicateMatch.artist,
                          key: songKey,
                          difficulty,
                          content: formattedContent,
                          youtubeUrl: youtubeUrl.trim() || duplicateMatch.youtubeUrl,
                          youtubeId: extractYouTubeId(youtubeUrl) || duplicateMatch.youtubeId,
                          seoDescription: seoDescription.trim() || duplicateMatch.seoDescription,
                          hashtags: hashtags.length > 0 ? hashtags : duplicateMatch.hashtags,
                          tags: tags.length > 0 ? tags : duplicateMatch.tags,
                          updatedAt: new Date().toISOString(),
                        };
                        onImportSongs([updatedSong]);
                        onClose();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Substituir / Atualizar Música Existente
                    </button>

                    {onSelectSong && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSong(duplicateMatch);
                          onClose();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-stone-900 border border-stone-700 hover:border-amber-400 text-stone-200 font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-amber-400" /> Abrir Música Existente
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Tablature Detection Banner */}
              {/(\{sot\}|A\||E\||C\||G\|)/i.test(formattedContent) && (
                <div className="bg-stone-950 border border-amber-500/30 rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold text-[10px] uppercase border border-amber-500/30">
                      Tablatura Formatada
                    </span>
                    <span className="text-xs text-stone-300 font-medium">
                      Tablatura de 4 cordas (A, E, C, G) identificada e estruturada em blocos <code className="text-amber-400 font-mono font-bold">{`{sot}`}</code> e <code className="text-amber-400 font-mono font-bold">{`{eot}`}</code>.
                    </span>
                  </div>
                </div>
              )}

              {/* Detected Chords Diagrams Ribbon */}
              {detectedChords.length > 0 && (
                <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-amber-500" /> Posições das Notas Encontradas no Ukulele:
                    </span>
                    <span className="text-[10px] text-stone-500">Clique no diagrama para ouvir o som</span>
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    {detectedChords.map((chordName) => {
                      const def = findChord(chordName);
                      if (!def) {
                        return (
                          <div key={chordName} className="px-3 py-2 bg-stone-900 border border-stone-800 rounded-lg text-amber-400 text-xs font-mono font-bold">
                            [{chordName}]
                          </div>
                        );
                      }
                      return (
                        <div
                          key={chordName}
                          onClick={() => {
                            if (def.fingerings[0]) {
                              playUkuleleChord(def.fingerings[0].frets);
                            }
                          }}
                          className="cursor-pointer transform hover:scale-105 transition-transform"
                          title={`Ouvir acorde ${chordName}`}
                        >
                          <ChordDiagram chordName={chordName} fingering={def.fingerings[0]} size="sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Editable Metadata Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-stone-400 block mb-1">Título da Música:</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 text-xs focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-400 block mb-1">Artista / Banda:</label>
                  <input
                    type="text"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 text-xs focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-400 block mb-1">Tom Detectado:</label>
                  <select
                    value={songKey}
                    onChange={(e) => setSongKey(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 text-xs focus:border-amber-500"
                  >
                    {ALL_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* YouTube Video Section for Imported Song */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3.5 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                    <Youtube className="w-4 h-4 text-red-500" /> Vídeo do YouTube (Vídeo Aula ou Versão):
                  </label>
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                      `${title || ''} ${artist || ''} ukulele tutorial cifra`.trim() || 'ukulele cifra'
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-amber-400 hover:underline font-bold flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20"
                  >
                    <Search className="w-3.5 h-3.5" /> Buscar Vídeo no YouTube <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="Cole o link ou ID do YouTube da música..."
                    className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-stone-200 text-xs focus:border-amber-500"
                  />
                  {youtubeUrl && (
                    <button
                      type="button"
                      onClick={() => setYoutubeUrl('')}
                      className="px-3 py-2 bg-stone-900 border border-stone-800 text-stone-400 hover:text-rose-400 rounded-xl text-xs font-bold"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                {extractYouTubeId(youtubeUrl) && (
                  <div className="pt-2">
                    <span className="text-[11px] text-emerald-400 font-bold block mb-1 flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Vídeo vinculado com sucesso!
                    </span>
                    <div className="max-w-xs">
                      <YouTubePlayer youtubeUrlOrId={youtubeUrl} songTitle={title} />
                    </div>
                  </div>
                )}
              </div>

              {/* Automatic SEO & Hashtags Section */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <Share2 className="w-4 h-4 text-amber-500" /> SEO & Hashtags Automáticos para Redes Sociais
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateSeo}
                    className="text-[11px] text-stone-400 hover:text-amber-400 flex items-center gap-1 font-semibold cursor-pointer"
                    title="Recalcular SEO com base no título e artista atualizados"
                  >
                    <RefreshCw className="w-3 h-3" /> Recalcular SEO
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-400 block mb-1">
                    Descrição SEO da Música:
                  </label>
                  <textarea
                    rows={2}
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    className="w-full bg-stone-900 border border-stone-800 rounded-lg p-2.5 text-stone-200 text-xs focus:border-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-stone-400 flex items-center gap-1">
                      <Tag className="w-3 h-3 text-amber-400" /> Hashtags Sugeridas:
                    </label>
                    {hashtags.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(hashtags.join(' '));
                          setCopiedHashtags(true);
                          setTimeout(() => setCopiedHashtags(false), 2000);
                        }}
                        className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                      >
                        {copiedHashtags ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedHashtags ? 'Hashtags Copiadas!' : 'Copiar Hashtags'}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-stone-900 border border-stone-800 rounded-lg max-h-24 overflow-y-auto">
                    {hashtags.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded text-[11px] font-mono">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Song Content Live View */}
              <div>
                <label className="text-xs font-bold text-stone-400 block mb-1">
                  Conteúdo Formatado com Acordes [C]:
                </label>
                <textarea
                  rows={8}
                  value={formattedContent}
                  onChange={(e) => {
                    setFormattedContent(e.target.value);
                    setDetectedChords(extractUniqueChords(e.target.value));
                  }}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-stone-200 font-mono text-xs leading-relaxed focus:border-amber-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-800">
                <button
                  onClick={() => setIsProcessed(false)}
                  className="px-4 py-2.5 rounded-xl bg-stone-950 text-stone-400 hover:text-stone-200 text-xs font-bold border border-stone-800"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-2 shadow-lg"
                >
                  <Check className="w-4 h-4" /> Confirmar e Salvar Cifra no Acervo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

