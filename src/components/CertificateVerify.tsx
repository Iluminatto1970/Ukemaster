/**
 * Verificação pública de certificados (/verificar/UKM-ANO-XXXXXX).
 *
 * Confere o código no registro oficial (tabela `certificates` no Supabase)
 * e mostra se o certificado é autêntico — com nome, trilha, nível e data.
 * Renderizado como overlay em tela cheia quando o App detecta a rota.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n';
import { fetchCertificate, CertificateRecord } from '../lib/certificatesRegistry';
import { getSupabase } from '../lib/supabase';
import { LEARNING_TRAILS } from '../data/learningTrails';
import {
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Search,
  BadgeCheck,
} from 'lucide-react';

interface CertificateVerifyProps {
  /** Código completo (ex.: UKM-2026-8C18A6). */
  code: string;
  onBack: () => void;
}

const CODE_RE = /^UKM-\d{4}-[0-9A-F]{6}$/i;

type Status = 'checking' | 'found' | 'notfound' | 'invalid' | 'unavailable';

const LEVEL_STYLE: Record<string, { bg: string; text: string }> = {
  iniciante: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  intermediario: { bg: 'bg-orange-100', text: 'text-orange-700' },
  avancado: { bg: 'bg-purple-100', text: 'text-purple-700' },
};

export const CertificateVerify: React.FC<CertificateVerifyProps> = ({ code, onBack }) => {
  const { t, lang } = useT();
  const [status, setStatus] = useState<Status>('checking');
  const [record, setRecord] = useState<CertificateRecord | null>(null);
  const [input, setInput] = useState<string>(code);
  const inputRef = useRef<HTMLInputElement>(null);

  // Normaliza e valida o código recebido, depois consulta o registro
  useEffect(() => {
    let cancelled = false;
    const normalized = code.trim().toUpperCase();
    if (!CODE_RE.test(normalized)) {
      setStatus('invalid');
      return;
    }
    if (!getSupabase()) {
      setStatus('unavailable');
      return;
    }
    setStatus('checking');
    fetchCertificate(normalized).then((rec) => {
      if (cancelled) return;
      setRecord(rec);
      setStatus(rec ? 'found' : 'notfound');
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const check = (raw: string) => {
    const normalized = raw.trim().toUpperCase();
    if (!CODE_RE.test(normalized)) {
      setRecord(null);
      setStatus('invalid');
      return;
    }
    if (!getSupabase()) {
      setRecord(null);
      setStatus('unavailable');
      return;
    }
    setStatus('checking');
    fetchCertificate(normalized).then((rec) => {
      setRecord(rec);
      setStatus(rec ? 'found' : 'notfound');
    });
  };

  // Título da trilha: prioriza os dados locais (traduzido), senão o que veio
  // do registro (denormalizado na emissão).
  const trail = record ? LEARNING_TRAILS.find((tr) => tr.id === record.trail_id) : null;
  const trailTitle = trail ? t(trail.titleKey) : (record?.trail_title ?? '');
  const levelLabel = record
    ? t(`trails.level.${record.level}`) || record.level
    : '';
  const levelStyle = record ? LEVEL_STYLE[record.level] ?? LEVEL_STYLE.iniciante : null;
  const locale =
    ({ pt: 'pt-BR', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP', zh: 'zh-CN', ar: 'ar-SA' } as Record<string, string>)[lang] ??
    'pt-BR';

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0E7C7B]/95 backdrop-blur-sm">
      {/* Topo com a logo e voltar */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-white/90 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> {t('verif.back')}
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="UkeMaster Pro" className="w-8 h-8 object-contain" />
          <span className="text-white font-black text-sm tracking-wide">
            UkeMaster <span className="text-[#F6AE2D]">Pro</span>
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-10">
        <div className="bg-[#FFFDF6] rounded-2xl border-[6px] border-[#F6AE2D] shadow-2xl overflow-hidden animate-fade-in">
          {/* Cabeçalho do cartão */}
          <div className="px-6 pt-8 pb-2 text-center">
            <img src="/logo.png" alt="" className="w-16 h-16 object-contain mx-auto mb-3" />
            <h1 className="text-xl font-black text-[#1D2D44] uppercase tracking-wide">
              {t('verif.title')}
            </h1>
            <p className="text-xs text-slate-500 mt-1 mb-4">{t('verif.subtitle')}</p>

            {/* Caixa do código em verificação */}
            <div className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5">
              <Search className="w-4 h-4 text-slate-400" />
              <code className="text-sm font-black text-[#1D2D44] tracking-wider">{code.toUpperCase()}</code>
            </div>
          </div>

          <div className="px-6 pb-6">
            {/* Estado: verificando */}
            {status === 'checking' && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 text-[#0E7C7B] animate-spin mx-auto mb-3" />
                <p className="text-sm font-bold text-[#1D2D44]">{t('verif.checking')}</p>
              </div>
            )}

            {/* Estado: autêntico */}
            {status === 'found' && record && (
              <div className="pt-4">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider">
                    <BadgeCheck className="w-4 h-4" /> {t('verif.authentic')}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{t('verif.authenticHint')}</p>
                </div>

                <div className="mt-5 rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('verif.issuedTo')}</span>
                    <span className="font-bold text-[#1D2D44] text-right">{record.holder_name}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('verif.trail')}</span>
                    <span className="font-bold text-[#F26419] text-right">{trailTitle}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('verif.level')}</span>
                    {levelStyle && (
                      <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${levelStyle.bg} ${levelStyle.text}`}>
                        {levelLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('verif.date')}</span>
                    <span className="font-bold text-[#1D2D44]">
                      {new Date(`${record.issued_on}T12:00:00`).toLocaleDateString(locale, {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{t('verif.code')}</span>
                    <code className="font-black text-[#0E7C7B] tracking-wider">{record.number}</code>
                  </div>
                </div>

                <p className="mt-3 text-center text-[11px] text-slate-400">
                  {t('verif.verifiedOn')} {new Date().toLocaleDateString(locale)}
                </p>
              </div>
            )}

            {/* Estado: não encontrado */}
            {status === 'notfound' && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2 bg-red-100 text-red-600 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider">
                  <ShieldX className="w-4 h-4" /> {t('verif.notFound')}
                </div>
                <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto">{t('verif.notFoundHint')}</p>
              </div>
            )}

            {/* Estado: formato inválido */}
            {status === 'invalid' && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-600 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" /> {t('verif.invalid')}
                </div>
                <p className="text-sm text-slate-500 mt-3 max-w-sm mx-auto">{t('verif.invalidHint')}</p>
              </div>
            )}

            {/* Estado: serviço indisponível */}
            {status === 'unavailable' && (
              <div className="py-8 text-center">
                <div className="inline-flex items-center gap-2 bg-slate-200 text-slate-600 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" /> {t('verif.unavailable')}
                </div>
                <p className="text-sm text-slate-500 mt-3">{t('verif.unavailableHint')}</p>
              </div>
            )}

            {/* Verificar outro código */}
            {status !== 'checking' && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  {t('verif.checkAnother')}
                </p>
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && check(input)}
                    placeholder="UKM-2026-XXXXXX"
                    spellCheck={false}
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1D2D44] placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:ring-2 focus:ring-[#F26419]/20 transition-all"
                  />
                  <button
                    onClick={() => check(input)}
                    className="px-5 py-2.5 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white text-xs font-black tracking-wider uppercase shadow-sm transition-all cursor-pointer"
                  >
                    {t('verif.check')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-white/70 mt-4">
          {t('cert.portal')}
        </p>
      </div>
    </div>
  );
};
