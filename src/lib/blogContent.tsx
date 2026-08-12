/**
 * Blog do UkeMaster: posts gerenciados pelo admin (SEO + links de
 * afiliado). Supabase + fallback localStorage, mesmo padrão do
 * affiliateContent.ts.
 */
import React from 'react';
import { fetchAllRows, upsertRowsChunked, deleteRows, isSupabaseConfigured } from './supabase';
import type { BlogPost } from '../types';

const LS_BLOG_KEY = 'ukemaster_blog_posts_v1';

function rowToPost(r: any): BlogPost {
  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt ?? '',
    content: r.content || '',
    category: r.category ?? undefined,
    tags: Array.isArray(r.tags) ? r.tags : [],
    enabled: r.enabled !== false,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
  };
}
function postToRow(p: BlogPost) {
  return {
    id: p.id,
    title: p.title,
    excerpt: p.excerpt ?? null,
    content: p.content,
    category: p.category ?? null,
    tags: p.tags ?? [],
    enabled: p.enabled,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

function readLocal(): BlogPost[] {
  try {
    const raw = localStorage.getItem(LS_BLOG_KEY);
    return raw ? (JSON.parse(raw) as BlogPost[]) : [];
  } catch {
    return [];
  }
}
function writeLocal(posts: BlogPost[]) {
  try {
    localStorage.setItem(LS_BLOG_KEY, JSON.stringify(posts));
  } catch {
    // cota/privado
  }
}

export async function fetchBlogPosts(): Promise<BlogPost[]> {
  if (isSupabaseConfigured()) {
    const rows = await fetchAllRows<any>(
      'blog_posts',
      '',
      'id,title,excerpt,content,category,tags,enabled,created_at,updated_at',
      1000,
      true
    );
    if (rows) return rows.map(rowToPost);
  }
  return readLocal();
}

export async function saveBlogPosts(posts: BlogPost[]): Promise<boolean> {
  writeLocal(posts);
  if (!isSupabaseConfigured()) return true;
  return upsertRowsChunked('blog_posts', posts.map(postToRow), 100);
}

export async function deleteBlogPost(id: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;
  return deleteRows('blog_posts', `?id=eq.${encodeURIComponent(id)}`);
}

/**
 * Renderiza o conteúdo markdown-lite do post como JSX:
 *  - "## Título"      → h2
 *  - "- item"         → lista
 *  - "**negrito**"    → <strong>
 *  - "https://..."    → link clicável
 *  - linhas com texto → parágrafo
 * Blocos de código entre ``` ficam em <pre>.
 */
export function renderPostContent(content: string): React.ReactNode {
  const blocks: { kind: 'heading' | 'list' | 'code' | 'para'; text: string }[] = [];
  const lines = content.split(/\r?\n/);
  let listBuf: string[] = [];
  let codeBuf: string[] = [];
  let inCode = false;

  const flushList = () => {
    if (listBuf.length) {
      blocks.push({ kind: 'list', text: listBuf.join('\n') });
      listBuf = [];
    }
  };
  const flushCode = () => {
    if (inCode && codeBuf.length) {
      blocks.push({ kind: 'code', text: codeBuf.join('\n') });
      codeBuf = [];
    }
    inCode = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith('```')) {
      if (inCode) flushCode();
      else {
        flushList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^##+\s+/.test(line.trim())) {
      flushList();
      blocks.push({ kind: 'heading', text: line.trim().replace(/^#+\s*/, '') });
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      listBuf.push(line.trim().replace(/^[-*]\s*/, ''));
      continue;
    }
    if (line.trim() === '') {
      flushList();
      continue;
    }
    flushList();
    blocks.push({ kind: 'para', text: line.trim() });
  }
  flushList();
  flushCode();

  // ── Renderização inline (negrito + links) ──────────────────────────
  const inline = (text: string, keyBase: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s]+)/g).filter(Boolean);
    return parts.map((part, i) => {
      const key = `${keyBase}-${i}`;
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={key} className="font-black text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (/^https?:\/\//i.test(part)) {
        // Limpa pontuação que veio grudada no link (ex.: "https://x.com.")
        const clean = part.replace(/[.,;:!?)"']+$/, '');
        return (
          <a
            key={key}
            href={clean}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0E7C7B] font-bold hover:underline"
          >
            {clean}
          </a>
        );
      }
      return <React.Fragment key={key}>{part}</React.Fragment>;
    });
  };

  return (
    <>
      {blocks.map((b, idx) => {
        if (b.kind === 'heading') {
          return (
            <h2
              key={idx}
              className="text-xl font-black text-slate-900 mt-6 mb-2 border-b border-slate-100 pb-2"
            >
              {inline(b.text, `h-${idx}`)}
            </h2>
          );
        }
        if (b.kind === 'list') {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1 text-slate-700 text-sm leading-relaxed my-2">
              {b.text.split('\n').map((item, i) => (
                <li key={i}>{inline(item, `li-${idx}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === 'code') {
          return (
            <pre
              key={idx}
              className="bg-slate-900 text-teal-100 rounded-xl p-3 text-xs font-mono overflow-x-auto my-3"
            >
              {b.text}
            </pre>
          );
        }
        return (
          <p key={idx} className="text-slate-700 text-sm leading-relaxed my-2.5">
            {inline(b.text, `p-${idx}`)}
          </p>
        );
      })}
    </>
  );
}
