/**
 * Painel ADMIN de conteúdo monetizável: links de AFILIADO e PARCEIROS.
 *
 * - Afiliados: cola/importa um TXT (uma linha por link, "Nome | URL" ou só
 *   URL) → salva no Supabase → os cards "Patrocinado" aparecem no site.
 * - Parceiros: vídeos do YouTube, cursos e links úteis (TXT ou formulário).
 *
 * Visível apenas para o proprietário (iluminatto@gmail.com) — renderizado
 * dentro da aba Admin do app.
 */
import React, { useRef, useState } from 'react';
import { AffiliateLink, PartnerLink, PartnerType, BlogPost } from '../types';
import {
  parseAffiliateTxt,
  parsePartnersTxt,
  saveAffiliateLinks,
  savePartnerLinks,
  deleteAffiliateLink,
  deletePartnerLink,
  youtubeIdFromUrl,
} from '../lib/affiliateContent';
import {
  ShoppingBag,
  GraduationCap,
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Plus,
  Power,
  ExternalLink,
  Wand2,
  Newspaper,
  Pencil,
} from 'lucide-react';
import { saveBlogPosts, deleteBlogPost } from '../lib/blogContent.tsx';

interface AdminContentPanelProps {
  affiliateLinks: AffiliateLink[];
  onAffiliateChange: (links: AffiliateLink[]) => void;
  partnerLinks: PartnerLink[];
  onPartnerChange: (links: PartnerLink[]) => void;
  blogPosts?: BlogPost[];
  onBlogChange?: (posts: BlogPost[]) => void;
  /** Total de usuários cadastrados (do AdminSignupWatch) — resumo no topo. */
  userCount?: number;
}

const uid = () => `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const AdminContentPanel: React.FC<AdminContentPanelProps> = ({
  affiliateLinks,
  onAffiliateChange,
  partnerLinks,
  onPartnerChange,
  blogPosts = [],
  onBlogChange = (_next: BlogPost[]) => {},
  userCount = 0,
}) => {
  const [affTxt, setAffTxt] = useState<string>('');
  const [parTxt, setParTxt] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const affFileRef = useRef<HTMLInputElement>(null);
  const parFileRef = useRef<HTMLInputElement>(null);

  // ── Formulário manual de parceiro ─────────────────────────────────────
  const [formType, setFormType] = useState<PartnerType>('youtube');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formUrl, setFormUrl] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');

  const flash = (ok: boolean, msg: string) => {
    setStatus({ ok, msg });
    setTimeout(() => setStatus(null), 5000);
  };

  const handleReadFile = (file: File | undefined, setter: (t: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setter(String(reader.result || ''));
    reader.readAsText(file);
  };

  // ── Afiliados ─────────────────────────────────────────────────────────
  const handleImportAffiliates = async () => {
    const parsed = parseAffiliateTxt(affTxt);
    if (parsed.length === 0) {
      flash(false, 'Nenhum link válido encontrado. Formato: "Nome | https://..." por linha.');
      return;
    }
    setSaving(true);
    try {
      // Mantém os existentes e adiciona os novos no final (sem duplicar URLs)
      const existingUrls = new Set(affiliateLinks.map((l) => l.url.toLowerCase()));
      const fresh: AffiliateLink[] = parsed
        .filter((p) => !existingUrls.has(p.url.toLowerCase()))
        .map((p, i) => ({
          ...p,
          id: uid(),
          createdAt: new Date().toISOString(),
          sortOrder: affiliateLinks.length + i,
        }));
      if (fresh.length === 0) {
        flash(false, 'Todos os links já estão cadastrados (nenhum novo).');
        setSaving(false);
        return;
      }
      const next = [...affiliateLinks, ...fresh];
      const ok = await saveAffiliateLinks(next);
      onAffiliateChange(next);
      setAffTxt('');
      flash(ok, `${fresh.length} link(s) de afiliado importado(s) com sucesso.`);
    } catch {
      flash(false, 'Erro ao salvar no Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAffiliate = async (link: AffiliateLink) => {
    const next = affiliateLinks.map((l) =>
      l.id === link.id ? { ...l, enabled: !l.enabled } : l
    );
    onAffiliateChange(next);
    await saveAffiliateLinks(next);
  };

  const handleDeleteAffiliate = async (link: AffiliateLink) => {
    const next = affiliateLinks.filter((l) => l.id !== link.id);
    onAffiliateChange(next);
    await deleteAffiliateLink(link.id);
    await saveAffiliateLinks(next);
    flash(true, `"${link.title}" removido.`);
  };

  // ── Parceiros ─────────────────────────────────────────────────────────
  const handleImportPartners = async () => {
    const parsed = parsePartnersTxt(parTxt);
    if (parsed.length === 0) {
      flash(false, 'Nenhum parceiro válido. Formato: "tipo | Título | URL" por linha.');
      return;
    }
    setSaving(true);
    try {
      const existingUrls = new Set(partnerLinks.map((p) => p.url.toLowerCase()));
      const fresh: PartnerLink[] = parsed
        .filter((p) => !existingUrls.has(p.url.toLowerCase()))
        .map((p, i) => ({
          ...p,
          id: uid(),
          createdAt: new Date().toISOString(),
          sortOrder: partnerLinks.length + i,
        }));
      if (fresh.length === 0) {
        flash(false, 'Todos os parceiros já estão cadastrados.');
        setSaving(false);
        return;
      }
      const next = [...partnerLinks, ...fresh];
      const ok = await savePartnerLinks(next);
      onPartnerChange(next);
      setParTxt('');
      flash(ok, `${fresh.length} parceiro(s) importado(s) com sucesso.`);
    } catch {
      flash(false, 'Erro ao salvar no Supabase.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPartner = async () => {
    if (!formTitle.trim() || !formUrl.trim()) {
      flash(false, 'Preencha título e URL do parceiro.');
      return;
    }
    const newPartner: PartnerLink = {
      id: uid(),
      type: formType,
      title: formTitle.trim(),
      url: formUrl.trim(),
      description: formDesc.trim() || undefined,
      enabled: true,
      sortOrder: partnerLinks.length,
      createdAt: new Date().toISOString(),
    };
    const next = [...partnerLinks, newPartner];
    const ok = await savePartnerLinks(next);
    onPartnerChange(next);
    if (ok) {
      setFormTitle('');
      setFormUrl('');
      setFormDesc('');
      flash(true, 'Parceiro adicionado.');
    } else {
      flash(false, 'Erro ao salvar (Supabase indisponível? Salvando localmente).');
    }
  };

  const handleTogglePartner = async (p: PartnerLink) => {
    const next = partnerLinks.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x));
    onPartnerChange(next);
    await savePartnerLinks(next);
  };

  const handleDeletePartner = async (p: PartnerLink) => {
    const next = partnerLinks.filter((x) => x.id !== p.id);
    onPartnerChange(next);
    await deletePartnerLink(p.id);
    await savePartnerLinks(next);
    flash(true, `"${p.title}" removido.`);
  };

  const typeLabel: Record<PartnerType, string> = {
    youtube: '🎬 Vídeo',
    course: '🎓 Curso',
    link: '🔗 Link',
  };

  // ── Blog / Artigos ────────────────────────────────────────────────────
  const [blogTitle, setBlogTitle] = useState('');
  const [blogCategory, setBlogCategory] = useState('');
  const [blogExcerpt, setBlogExcerpt] = useState('');
  const [blogContent, setBlogContent] = useState('');
  const [blogEditingId, setBlogEditingId] = useState<string | null>(null);
  const [blogSaving, setBlogSaving] = useState(false);

  const handleSaveBlog = async () => {
    if (!blogTitle.trim() || !blogContent.trim()) {
      flash(false, 'Título e conteúdo do artigo são obrigatórios.');
      return;
    }
    setBlogSaving(true);
    try {
      const now = new Date().toISOString();
      let next: BlogPost[];
      if (blogEditingId) {
        next = blogPosts.map((p) =>
          p.id === blogEditingId
            ? {
                ...p,
                title: blogTitle.trim(),
                category: blogCategory.trim() || undefined,
                excerpt: blogExcerpt.trim(),
                content: blogContent.trim(),
                updatedAt: now,
              }
            : p
        );
      } else {
        const post: BlogPost = {
          id: `post-${Date.now()}`,
          title: blogTitle.trim(),
          category: blogCategory.trim() || undefined,
          excerpt: blogExcerpt.trim(),
          content: blogContent.trim(),
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        next = [post, ...blogPosts];
      }
      const ok = await saveBlogPosts(next);
      onBlogChange(next);
      if (ok) {
        setBlogTitle('');
        setBlogCategory('');
        setBlogExcerpt('');
        setBlogContent('');
        setBlogEditingId(null);
        flash(true, blogEditingId ? 'Artigo atualizado!' : 'Artigo publicado na aba Blog!');
      } else {
        flash(false, 'Erro ao salvar (Supabase indisponível? Salvando localmente).');
      }
    } finally {
      setBlogSaving(false);
    }
  };

  const handleEditBlog = (p: BlogPost) => {
    setBlogEditingId(p.id);
    setBlogTitle(p.title);
    setBlogCategory(p.category ?? '');
    setBlogExcerpt(p.excerpt ?? '');
    setBlogContent(p.content);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const handleToggleBlog = async (p: BlogPost) => {
    const next = blogPosts.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled, updatedAt: new Date().toISOString() } : x));
    onBlogChange(next);
    await saveBlogPosts(next);
  };

  const handleDeleteBlog = async (p: BlogPost) => {
    const next = blogPosts.filter((x) => x.id !== p.id);
    onBlogChange(next);
    await deleteBlogPost(p.id);
    await saveBlogPosts(next);
    if (blogEditingId === p.id) setBlogEditingId(null);
    flash(true, `"${p.title}" removido do blog.`);
  };

  return (
    <div className="space-y-6 text-slate-900">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#0E7C7B]/10 border border-[#0E7C7B]/25 text-[#0E7C7B]">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Afiliados & Parceiros</h1>
            <p className="text-xs text-slate-500 font-medium">
              Links de afiliado (Mercado Livre, Shopee...) e parceiros — importados por TXT, exibidos no site.
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-rose-50 text-rose-600 font-extrabold border border-rose-200 uppercase tracking-wider self-start">
          🔒 Restrito ao proprietário
        </span>
      </div>

      {/* Boas práticas / legal — conteúdo publicado no site */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
        <p className="font-black uppercase tracking-wider text-[10px] mb-1">⚖️ Uso responsável</p>
        Use com moderação e respeite os sites de origem (o delay entre requisições já está configurado).{' '}
        <strong>Verifique os direitos autorais das cifras/letras antes de publicar conteúdo protegido.</strong>{' '}
        O acervo é público e 100% gratuito.
      </div>

      {/* Contagem de usuários cadastrados (só o dono vê este painel) */}
      <div className="flex items-center gap-2 rounded-2xl bg-[#0E7C7B]/5 border border-[#0E7C7B]/20 px-4 py-3 text-sm text-slate-700">
        <span className="text-lg">👥</span>
        <span className="font-bold text-[#0E7C7B]">{userCount}</span>
        <span className="font-medium">usuário(s) cadastrado(s)</span>
        {userCount > 0 && (
          <span className="text-[11px] text-slate-400 ml-auto">atualiza a cada 30s</span>
        )}
      </div>

      {status && (
        <div
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-bold ${
            status.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-600'
          }`}
        >
          {status.ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{status.msg}</span>
        </div>
      )}

      {/* ── 1) AFILIADOS ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShoppingBag className="w-5 h-5 text-[#0E7C7B]" />
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            Links de Afiliado (Propagandas no Site)
          </h2>
          <span className="ml-auto text-[10px] font-black text-[#0E7C7B] bg-[#0E7C7B]/10 rounded-full px-2.5 py-0.5">
            {affiliateLinks.filter((l) => l.enabled).length} ativos • {affiliateLinks.length} total
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Cole o TXT com seus links de afiliado (uma linha por link):{' '}
          <code className="text-[#0E7C7B] font-mono">Ukulele Soprano Kala | https://www.mercadolivre.com.br/...</code>{' '}
          ou apenas a URL (a loja é detectada automaticamente). Os cards{' '}
          <strong>“Patrocinado”</strong> aparecem no site para todos os visitantes.
        </p>

        <div className="space-y-2">
          <textarea
            value={affTxt}
            onChange={(e) => setAffTxt(e.target.value)}
            rows={5}
            placeholder={'Ukulele Soprano Kala | https://www.mercadolivre.com.br/...\nCordas Aquila | https://shopee.com.br/...\nhttps://www.amazon.com.br/...'}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-mono resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleImportAffiliates}
              disabled={saving || !affTxt.trim()}
              className="px-4 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#0E7C7B]/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Importar Links do TXT
            </button>
            <button
              onClick={() => affFileRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#0E7C7B] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#0E7C7B]" /> Abrir arquivo .txt
            </button>
            <input
              ref={affFileRef}
              type="file"
              accept=".txt,.csv,text/plain"
              className="hidden"
              onChange={(e) => handleReadFile(e.target.files?.[0], setAffTxt)}
            />
            <span className="text-[10px] text-slate-400 font-medium">
              {parseAffiliateTxt(affTxt).length > 0
                ? `${parseAffiliateTxt(affTxt).length} link(s) detectado(s) no texto`
                : 'Formato: "Nome | URL" por linha'}
            </span>
          </div>
        </div>

        {/* Lista de afiliados */}
        {affiliateLinks.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {affiliateLinks.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => handleToggleAffiliate(l)}
                  title={l.enabled ? 'Ativo — clique para pausar' : 'Pausado — clique para ativar'}
                  className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                    l.enabled
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-extrabold truncate ${l.enabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                    {l.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                    <ExternalLink className="w-2.5 h-2.5" /> {l.url}
                    {l.store && <span className="text-[#0E7C7B] font-bold">• {l.store}</span>}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAffiliate(l)}
                  title="Remover link"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 2) PARCEIROS ─────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <GraduationCap className="w-5 h-5 text-[#F26419]" />
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            Parceiros (Vídeos, Cursos & Links)
          </h2>
          <span className="ml-auto text-[10px] font-black text-[#F26419] bg-orange-50 rounded-full px-2.5 py-0.5">
            {partnerLinks.filter((p) => p.enabled).length} ativos
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Adicione vídeos do YouTube, cursos e links úteis — por formulário ou TXT:{' '}
          <code className="text-[#F26419] font-mono">youtube | Como afinar | https://youtube.com/watch?v=...</code>
        </p>

        {/* Formulário manual */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
          <select
            value={formType}
            onChange={(e) => setFormType(e.target.value as PartnerType)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-[#F26419] cursor-pointer"
          >
            <option value="youtube">🎬 Vídeo do YouTube</option>
            <option value="course">🎓 Curso</option>
            <option value="link">🔗 Link útil</option>
          </select>
          <input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="Título (ex.: Curso de Ukulele Iniciante)"
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium"
          />
          <input
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            placeholder="https://..."
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium sm:col-span-2"
          />
          <input
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="Descrição curta (opcional)"
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-medium sm:col-span-2"
          />
          <button
            onClick={handleAddPartner}
            className="sm:col-span-2 px-4 py-2 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#F26419]/25"
          >
            <Plus className="w-4 h-4" /> Adicionar Parceiro
          </button>
          {formUrl && youtubeIdFromUrl(formUrl) && formType !== 'youtube' && (
            <p className="text-[10px] text-[#F26419] font-bold sm:col-span-2 -mt-1">
              URL do YouTube detectada — sugere trocar o tipo para 🎬 Vídeo.
            </p>
          )}
        </div>

        {/* Import TXT de parceiros */}
        <div className="space-y-2">
          <textarea
            value={parTxt}
            onChange={(e) => setParTxt(e.target.value)}
            rows={3}
            placeholder={'youtube | Como afinar o ukulele | https://youtube.com/watch?v=...\ncurso | Curso de ukulele | https://hotmart.com/...\nlink | Dicionário de acordes | https://...'}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] font-mono resize-y"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleImportPartners}
              disabled={saving || !parTxt.trim()}
              className="px-4 py-2 rounded-xl bg-[#1D2D44] hover:bg-[#0F2537] disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              Importar Parceiros do TXT
            </button>
            <button
              onClick={() => parFileRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#F26419] font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#F26419]" /> Abrir arquivo .txt
            </button>
            <input
              ref={parFileRef}
              type="file"
              accept=".txt,.csv,text/plain"
              className="hidden"
              onChange={(e) => handleReadFile(e.target.files?.[0], setParTxt)}
            />
          </div>
        </div>

        {/* Lista de parceiros */}
        {partnerLinks.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
            {partnerLinks.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => handleTogglePartner(p)}
                  title={p.enabled ? 'Ativo — clique para pausar' : 'Pausado — clique para ativar'}
                  className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                    p.enabled
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
                <span className="text-sm shrink-0">{typeLabel[p.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-extrabold truncate ${p.enabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{p.url}</p>
                </div>
                <button
                  onClick={() => handleDeletePartner(p)}
                  title="Remover parceiro"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 3) BLOG / ARTIGOS ────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Newspaper className="w-5 h-5 text-[#0E7C7B]" />
          <h2 className="text-sm font-extrabold text-[#1D2D44] uppercase tracking-wider">
            Blog / Artigos (SEO + Afiliados)
          </h2>
          <span className="ml-auto text-[10px] font-black text-[#0E7C7B] bg-[#0E7C7B]/10 rounded-full px-2.5 py-0.5">
            {blogPosts.filter((p) => p.enabled).length} publicados • {blogPosts.length} total
          </span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Escreva artigos com dicas de ukulele (afinação, técnicas, repertório). Use{' '}
          <code className="text-[#0E7C7B] font-mono">## Título</code>,{' '}
          <code className="text-[#0E7C7B] font-mono">- item</code>,{' '}
          <code className="text-[#0E7C7B] font-mono">**negrito**</code> e links
          de afiliado (URLs viram links clicáveis) para monetizar seu conteúdo.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-slate-50/70 border border-slate-200 rounded-xl">
          <input
            value={blogTitle}
            onChange={(e) => setBlogTitle(e.target.value)}
            placeholder="Título do artigo *"
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium sm:col-span-2"
          />
          <input
            value={blogCategory}
            onChange={(e) => setBlogCategory(e.target.value)}
            placeholder="Categoria (ex.: Iniciante, Afinação, Técnica)"
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
          />
          <input
            value={blogExcerpt}
            onChange={(e) => setBlogExcerpt(e.target.value)}
            placeholder="Resumo curto (aparece no card do Blog)"
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium"
          />
          <textarea
            value={blogContent}
            onChange={(e) => setBlogContent(e.target.value)}
            placeholder={'Corpo do artigo *\n\n## Como afinar o ukulele\n- Passo 1: ...\n- Passo 2: ...\n\nVeja acessórios recomendados: https://mercadolivre.com.br/...'}
            rows={8}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0E7C7B] font-medium font-mono sm:col-span-2 resize-y"
          />
          <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveBlog}
              disabled={blogSaving}
              className="px-4 py-2 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] disabled:opacity-50 text-white font-extrabold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-[#0E7C7B]/20"
            >
              {blogSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {blogEditingId ? 'Atualizar Artigo' : 'Publicar Artigo'}
            </button>
            {blogEditingId && (
              <button
                onClick={() => {
                  setBlogEditingId(null);
                  setBlogTitle('');
                  setBlogCategory('');
                  setBlogExcerpt('');
                  setBlogContent('');
                }}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-[#0E7C7B] font-bold text-xs transition-colors cursor-pointer"
              >
                Cancelar edição
              </button>
            )}
          </div>
        </div>

        {blogPosts.length > 0 && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
            {blogPosts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => handleToggleBlog(p)}
                  title={p.enabled ? 'Publicado — clique para despublicar' : 'Rascunho — clique para publicar'}
                  className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors cursor-pointer border ${
                    p.enabled
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-extrabold truncate ${p.enabled ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {p.category ? `${p.category} • ` : ''}
                    {new Date(p.updatedAt).toLocaleDateString('pt-BR')} • {p.content.split(/\s+/).length} palavras
                  </p>
                </div>
                <button
                  onClick={() => handleEditBlog(p)}
                  title="Editar artigo"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-[#0E7C7B] hover:bg-[#0E7C7B]/10 transition-colors cursor-pointer shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteBlog(p)}
                  title="Excluir artigo"
                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 leading-relaxed flex items-start gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Os dados são salvos no Supabase (leitura pública) e exibidos como cards no site. Se a tabela ainda não
        existir no banco, tudo é salvo localmente no seu navegador até o schema ser aplicado.
      </p>
    </div>
  );
};
