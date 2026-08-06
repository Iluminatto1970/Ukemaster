/**
 * Aba BLOG: artigos do proprietário (SEO + links de afiliado), gerenciados
 * no admin. Lista de cards → leitor inline do post (markdown-lite).
 */
import React, { useMemo, useState } from 'react';
import type { BlogPost } from '../types';
import { renderPostContent } from '../lib/blogContent.tsx';
import { useT } from '../lib/i18n';
import { Newspaper, ArrowLeft, Calendar, Clock, Tag } from 'lucide-react';

interface BlogTabProps {
  posts: BlogPost[];
}

export const BlogTab: React.FC<BlogTabProps> = ({ posts }) => {
  const { t } = useT();
  const published = useMemo(
    () =>
      posts
        .filter((p) => p.enabled)
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [posts]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? published.find((p) => p.id === selectedId) : null;

  // Categorias para filtro rápido
  const categories = useMemo(() => {
    const set = new Set<string>();
    published.forEach((p) => p.category && set.add(p.category));
    return Array.from(set);
  }, [published]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const visible = activeCategory === 'all' ? published : published.filter((p) => p.category === activeCategory);

  if (selected) {
    return (
      <div className="space-y-5 text-slate-900 max-w-3xl">
        <button
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 text-slate-700 hover:text-orange-600 font-extrabold text-xs px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 hover:border-orange-400 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('viewer.back')} {t('tab.blog')}
        </button>

        <article className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {selected.category && (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-extrabold border border-[#0E7C7B]/20 uppercase tracking-wider">
                {selected.category}
              </span>
            )}
            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(selected.updatedAt).toLocaleDateString('pt-BR')}
            </span>
            <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1">
              <Clock className="w-3 h-3" /> Leitura de ~{Math.max(1, Math.round(selected.content.split(/\s+/).length / 180))} min
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight">
            {selected.title}
          </h1>
          {selected.excerpt && (
            <p className="text-slate-500 text-sm mt-2 font-medium leading-relaxed">{selected.excerpt}</p>
          )}

          <div className="border-t border-slate-100 mt-6 pt-4">
            {renderPostContent(selected.content)}
          </div>

          {selected.tags && selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-6 pt-4 border-t border-slate-100">
              {selected.tags.map((t) => (
                <span key={t} className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-bold">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </article>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-900">
      {/* Cabeçalho */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 relative overflow-hidden shadow-2xs">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Newspaper className="w-48 h-48 text-orange-500" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 text-orange-600 text-xs font-bold mb-3 border border-orange-200">
            <Newspaper className="w-3.5 h-3.5" /> {t('blog.comingSoon').replace('artigos', 'Dicas, Técnicas & Novidades')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{t('blog.title')}</h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            {t('blog.comingSoon')}
          </p>
        </div>
      </div>

      {/* Filtro por categoria */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              activeCategory === 'all'
                ? 'bg-orange-500 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-300'
            }`}
          >
            {t('dictionary.all')}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                activeCategory === c
                  ? 'bg-orange-500 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-300'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className="text-left bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-md rounded-2xl p-5 shadow-2xs transition-all cursor-pointer group flex flex-col"
            >
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {p.category && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0E7C7B]/10 text-[#0E7C7B] font-extrabold border border-[#0E7C7B]/20 uppercase tracking-wider">
                    {p.category}
                  </span>
                )}
                <span className="text-[10px] text-slate-400 font-bold">
                  {new Date(p.updatedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <h3 className="text-base font-black text-slate-900 leading-snug group-hover:text-orange-600 transition-colors">
                {p.title}
              </h3>
              {p.excerpt && (
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-3 flex-1">
                  {p.excerpt}
                </p>
              )}
              <span className="mt-3 text-[11px] font-extrabold text-[#F26419] flex items-center gap-1">
                {t('viewer.back')} artigo <ArrowLeft className="w-3 h-3 rotate-180" />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-14 bg-white border border-slate-200/90 rounded-2xl p-8">
          <Newspaper className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-extrabold text-slate-800">{t('blog.comingSoon')}</h3>
          <p className="text-slate-500 text-xs mt-1">
            {t('blog.comingSoon')}
          </p>
        </div>
      )}

      {published.length === 0 && (
        <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
          <Tag className="w-3 h-3" /> Gestão de artigos: aba Admin → Blog/Artigos.
        </p>
      )}
    </div>
  );
};
