/**
 * Captura de lead (nome/e-mail/WhatsApp) antes do cadastro — alimenta o banco do proprietário.
 */
import React, { useState } from 'react';
import { X, Sparkles, Check, ArrowRight, Phone, Mail, User, PartyPopper } from 'lucide-react';
import { saveLead, normalizeWhatsApp } from '../lib/leads';
import { Logo } from './Logo';

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chamado após salvar o lead — abre o cadastro real (Supabase) com os dados. */
  onComplete: (lead: { name: string; email: string; whatsapp?: string }) => void;
}

/**
 * Captura de lead (nome/e-mail/WhatsApp) antes do cadastro.
 *
 * O acervo é 100% livre (sem paywall), mas ao criar a conta o usuário deixa
 * o contato no SEU banco de leads (Supabase → tabela `leads`, com fallback
 * localStorage). Assim você monta sua base de WhatsApp sem bloquear conteúdo.
 */
export const LeadCaptureModal: React.FC<LeadCaptureModalProps> = ({
  isOpen,
  title,
  onClose,
  onComplete,
}) => {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [whatsapp, setWhatsapp] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await saveLead({
        name: name.trim(),
        email: email.trim(),
        whatsapp: normalizeWhatsApp(whatsapp),
        source: 'signup',
      });
      // Repassa os dados para o cadastro real (Supabase) pré-preenchido.
      onComplete({
        name: name.trim(),
        email: email.trim(),
        whatsapp: normalizeWhatsApp(whatsapp),
      });
    } catch (err) {
      setError('Não foi possível salvar seus dados. Tente novamente.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Logomarca oficial do portal */}
          <Logo size="sm" />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 font-bold text-lg p-1 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-[#F26419] font-black text-[10px] tracking-wider uppercase border border-orange-200">
            <Sparkles className="w-3 h-3" />
            Cadastro Grátis
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-2">
            Crie sua conta para ter seu Repertório Privado
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">
            Preencha seus dados para liberar o repertório privado e ferramentas exclusivas.{' '}
            <strong className="text-[#0E7C7B]">O acervo de cifras continua 100% gratuito.</strong>
          </p>
        </div>

        {submitted ? (
          <div className="text-center space-y-3 py-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200">
              <PartyPopper className="w-7 h-7" />
            </div>
            <h4 className="text-lg font-black text-slate-900">Cadastro recebido!</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Obrigado! Assim que o login estiver ativo no portal, você poderá montar seu
              repertório privado e acompanhar seus estudos. Já estamos te enviando novidades.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 px-5 rounded-2xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white font-black text-xs tracking-wider uppercase shadow-lg transition-all cursor-pointer"
            >
              Fechar
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-2.5">
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
            />
          </div>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu melhor e-mail"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
            />
          </div>
          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="Seu WhatsApp com DDD (ex: 11 98765-4321)"
              required
              minLength={10}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
            />
          </div>

          {error && <p className="text-xs text-rose-600 font-bold">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-5 rounded-2xl bg-[#F26419] hover:bg-[#D9530D] disabled:opacity-60 text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-[#F26419]/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {submitting ? (
              <span>Salvando...</span>
            ) : (
              <>
                <span>Continuar Cadastro</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center gap-2 justify-center pt-1">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <p className="text-[10px] text-slate-400 font-medium text-center">
              Seus dados ficam seguros e são usados apenas para contato e novidades do portal.
            </p>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
