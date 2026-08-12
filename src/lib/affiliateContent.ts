/**
 * Conteúdo monetizável do UkeMaster: links de AFILIADO (Mercado Livre,
 * Shopee, Amazon...) e PARCEIROS (vídeos do YouTube, cursos, links).
 *
 * Fluxo (conforme pedido do proprietário):
 *  1. Admin gera um arquivo TXT com os links de afiliado/parceiros
 *     (ou cola o texto direto na área admin).
 *  2. A área admin parseia e salva no Supabase (tabelas affiliate_links /
 *     partner_links) — leitura pública para os cards aparecerem no site.
 *  3. Se o Supabase não estiver configurado/indisponível, degrada para
 *     localStorage (o admin continua gerenciando; o site mostra do cache).
 */
import {
  fetchRows,
  upsertRowsChunked,
  deleteRows,
  isSupabaseConfigured,
} from './supabase';

import type { AffiliateLink, PartnerLink, PartnerType } from '../types';

const LS_AFFILIATE_KEY = 'ukemaster_affiliate_links_v1';
const LS_PARTNER_KEY = 'ukemaster_partner_links_v1';

// ── Mapeamento linha ⇄ objeto (camelCase ⇄ snake_case) ─────────────────
function affiliateToRow(l: AffiliateLink) {
  return {
    id: l.id,
    title: l.title,
    url: l.url,
    store: l.store ?? null,
    enabled: l.enabled,
    sort_order: l.sortOrder,
    created_at: l.createdAt,
  };
}
function rowToAffiliate(r: any): AffiliateLink {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    store: r.store ?? undefined,
    enabled: r.enabled !== false,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  };
}
function partnerToRow(p: PartnerLink) {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    url: p.url,
    description: p.description ?? null,
    enabled: p.enabled,
    sort_order: p.sortOrder,
    created_at: p.createdAt,
  };
}
function rowToPartner(r: any): PartnerLink {
  return {
    id: r.id,
    type: (r.type as PartnerType) || 'link',
    title: r.title,
    url: r.url,
    description: r.description ?? undefined,
    enabled: r.enabled !== false,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at,
  };
}

// ── Fallback localStorage ──────────────────────────────────────────────
function readLocal<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}
function writeLocal<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // cota cheia/privado — segue sem persistir localmente
  }
}

// ── AFILIADOS ──────────────────────────────────────────────────────────
/** Busca os links de afiliado (Supabase → fallback localStorage). */
export async function fetchAffiliateLinks(): Promise<AffiliateLink[]> {
  if (isSupabaseConfigured()) {
    const rows = await fetchRows('affiliate_links', '&order=sort_order.asc,created_at.asc');
    if (rows) return rows.map(rowToAffiliate);
  }
  return readLocal<AffiliateLink>(LS_AFFILIATE_KEY);
}

/** Salva TODOS os links de afiliado (upsert idempotente por id). */
export async function saveAffiliateLinks(links: AffiliateLink[]): Promise<boolean> {
  writeLocal(LS_AFFILIATE_KEY, links);
  if (!isSupabaseConfigured()) return true;
  return upsertRowsChunked('affiliate_links', links.map(affiliateToRow));
}

/** Remove um link de afiliado pelo id. */
export async function deleteAffiliateLink(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  return deleteRows('affiliate_links', `?id=eq.${encodeURIComponent(id)}`);
}

/**
 * Parseia um TXT de afiliados. Formato por linha:
 *   "Nome do Produto | https://link.afiliado"   (nome opcional antes do |)
 *   "https://link.afiliado"                     (nome derivado do domínio)
 * Linhas em branco e iniciadas com # são ignoradas.
 */
export function parseAffiliateTxt(raw: string): Omit<AffiliateLink, 'id' | 'createdAt'>[] {
  const out: Omit<AffiliateLink, 'id' | 'createdAt'>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    let title = '';
    let url = t;
    const sep = t.indexOf('|');
    if (sep >= 0) {
      title = t.slice(0, sep).trim();
      url = t.slice(sep + 1).trim();
    }
    // Aceita linhas que o admin copiou com aspas/colchetes (ex.: copiar do Excel)
    url = url.replace(/^["'\[\]]+|["'\[\]]+$/g, '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (!title) title = storeFromUrl(url);
    const store = storeFromUrl(url);
    out.push({ title, url, store, enabled: true, sortOrder: out.length });
  }
  return out;
}

/** Deriva o nome da loja a partir da URL (Mercado Livre, Shopee, Amazon...). */
export function storeFromUrl(rawUrl: string): string {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
    const known: Record<string, string> = {
      'mercadolivre.com.br': 'Mercado Livre',
      'mercadolibre.com': 'Mercado Livre',
      'shopee.com.br': 'Shopee',
      'shopee.com': 'Shopee',
      'amazon.com.br': 'Amazon',
      'amazon.com': 'Amazon',
      'ali express.com': 'AliExpress',
      'aliexpress.com': 'AliExpress',
      'shein.com': 'Shein',
      'magazinevoa.com.br': 'Magazine Luiza',
      'magazineluiza.com.br': 'Magazine Luiza',
      'casasbahia.com.br': 'Casas Bahia',
      'centauro.com.br': 'Centauro',
      'submarino.com.br': 'Submarino',
      'americanas.com.br': 'Americanas',
    };
    for (const [k, v] of Object.entries(known)) {
      if (host.includes(k.replace(/ /g, ''))) return v;
    }
    // Deriva nome legível do domínio: "loja-ukulele.com.br" → "Loja Ukulele"
    return host
      .split('.')[0]
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return 'Loja Parceira';
  }
}

/** Detecta o tipo de parceiro a partir da URL (YouTube → vídeo). */
export function partnerTypeFromUrl(url: string): PartnerType {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/coursera|udemy|hotmart|kultivi|alura|cursos?\.|ead|educacao/i.test(url)) return 'course';
  return 'link';
}

// ── PARCEIROS ──────────────────────────────────────────────────────────
export async function fetchPartnerLinks(): Promise<PartnerLink[]> {
  if (isSupabaseConfigured()) {
    const rows = await fetchRows('partner_links', '&order=sort_order.asc,created_at.asc');
    if (rows) return rows.map(rowToPartner);
  }
  return readLocal<PartnerLink>(LS_PARTNER_KEY);
}

export async function savePartnerLinks(links: PartnerLink[]): Promise<boolean> {
  writeLocal(LS_PARTNER_KEY, links);
  if (!isSupabaseConfigured()) return true;
  return upsertRowsChunked('partner_links', links.map(partnerToRow));
}

export async function deletePartnerLink(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  return deleteRows('partner_links', `?id=eq.${encodeURIComponent(id)}`);
}

/**
 * Parseia um TXT de parceiros. Formato por linha:
 *   "tipo | Título | URL [| descrição]"   (tipo: youtube|course|link — opcional)
 *   "Título | URL"                        (tipo inferido da URL)
 * Aceita "youtube", "video" e "curso" como sinônimos de tipo.
 */
export function parsePartnersTxt(raw: string): Omit<PartnerLink, 'id' | 'createdAt'>[] {
  const out: Omit<PartnerLink, 'id' | 'createdAt'>[] = [];
  const typeAlias: Record<string, PartnerType> = {
    youtube: 'youtube',
    video: 'youtube',
    course: 'course',
    curso: 'course',
    link: 'link',
  };
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const parts = t.split('|').map((p) => p.trim());
    if (parts.length < 2) continue;

    let type: PartnerType | undefined;
    let title: string;
    let url: string;
    let description: string | undefined;

    // Detecta se a 1ª parte é um tipo conhecido (youtube/curso/link)
    if (typeAlias[parts[0].toLowerCase()]) {
      type = typeAlias[parts[0].toLowerCase()];
      title = parts[1];
      url = parts[2] ?? '';
    } else {
      title = parts[0];
      url = parts[1] ?? '';
    }
    description = parts[3]?.trim() || undefined;
    url = url.replace(/^["'\[\]]+|["'\[\]]+$/g, '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (!title) title = 'Parceiro';

    out.push({
      type: type || partnerTypeFromUrl(url),
      title,
      url,
      description,
      enabled: true,
      sortOrder: out.length,
    });
  }
  return out;
}

/** Extrai o id do vídeo do YouTube a partir de qualquer formato de URL. */
export function youtubeIdFromUrl(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}
