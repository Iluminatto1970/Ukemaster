/**
 * Modal de autenticação do UkeMaster Pro — login e cadastro DIRETO no Supabase.
 *
 * Dois modos:
 *  - signin: e-mail + senha → entra na conta (sessão Supabase).
 *  - signup: nome + WhatsApp + e-mail + senha → cria a conta e salva o lead
 *    no banco do proprietário (sem confirmação de e-mail — cadastro direto).
 *
 * Se o Supabase tiver "Confirm email" LIGADO no painel, o cadastro mostra a
 * mensagem de confirmação; com a confirmação desligada (recomendado para este
 * produto), o usuário já entra autenticado na hora.
 */
import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Phone, Loader2, Sparkles, AlertCircle, LogIn, UserPlus } from 'lucide-react';
import { signInWithPassword, signUp, signInWithOAuth, SupabaseSession } from '../lib/supabaseAuth';
import { saveLead, normalizeWhatsApp } from '../lib/leads';

export type AuthModalMode = 'signin' | 'signup';

/** Dados capturados no LeadCaptureModal (fluxo de repertório) já preenchidos. */
export interface SignUpPrefill {
  name?: string;
  email?: string;
  whatsapp?: string;
}

interface AuthModalProps {
  isOpen: boolean;
  mode: AuthModalMode;
  prefill?: SignUpPrefill;
  onClose: () => void;
  onAuthenticated: (session: SupabaseSession) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  mode,
  prefill,
  onClose,
  onAuthenticated,
}) => {
  const [formMode, setFormMode] = useState<AuthModalMode>(mode);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Ao abrir, sincroniza o modo e aplica o prefill (lead capturado antes).
  useEffect(() => {
    if (isOpen) {
      setFormMode(mode);
      setError('');
      setInfo('');
      setPassword('');
      setConfirm('');
      setName(prefill?.name || '');
      setEmail(prefill?.email || '');
      setWhatsapp(prefill?.whatsapp || '');
    }
  }, [isOpen, mode, prefill]);

  if (!isOpen) return null;

  const switchMode = (m: AuthModalMode) => {
    setFormMode(m);
    setError('');
    setInfo('');
  };

  /** Inicia o login com Google (OAuth PKCE → redireciona para o authorize). */
  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      await signInWithOAuth('google', redirectTo);
      // A página é redirecionada; quando o Google devolver o code, o
      // AuthProvider processa o callback e autentica automaticamente.
    } catch (err: any) {
      setError(translateError(err?.message || 'Não foi possível conectar com o Google.'));
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      if (formMode === 'signup') {
        // Cadastro: exige senha mínima e confirmação igual.
        if (password.length < 6) {
          setError('A senha precisa de pelo menos 6 caracteres.');
          setSubmitting(false);
          return;
        }
        if (password !== confirm) {
          setError('As senhas não conferem.');
          setSubmitting(false);
          return;
        }
        const leadData = {
          name: name.trim() || email.trim().split('@')[0],
          email: email.trim(),
          whatsapp: normalizeWhatsApp(whatsapp),
        };
        // SALVA SEMPRE o lead no cadastro — mesmo que a confirmação de e-mail
        // esteja ligada no Supabase, o contato do usuário não se perde.
        saveLead({ ...leadData, source: 'signup' });
        const result = await signUp(email.trim(), password, {
          name: leadData.name,
          whatsapp: leadData.whatsapp,
        });
        if (result.session) {
          // Cadastro direto (confirmação desligada) → já autenticado.
          onAuthenticated(result.session);
          return;
        }
        // Supabase com "Confirm email" ligado → orienta o usuário.
        setInfo(
          result.message ||
            'Conta criada! Verifique seu e-mail para confirmar e depois faça login.'
        );
        setSubmitting(false);
        return;
      }

      // Login
      const session = await signInWithPassword(email.trim(), password);
      onAuthenticated(session);
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível concluir. Tente novamente.';
      setError(translateError(msg));
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
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#F26419] text-white flex items-center justify-center shadow-md shrink-0">
            {formMode === 'signin' ? (
              <LogIn className="w-5 h-5" />
            ) : (
              <UserPlus className="w-5 h-5" />
            )}
          </div>
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
            {formMode === 'signin' ? 'Entrar na Conta' : 'Cadastro Grátis'}
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-2">
            {formMode === 'signin' ? 'Bem-vindo(a) de volta!' : 'Crie sua conta para o Repertório Privado'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">
            {formMode === 'signin'
              ? 'Entre com seu e-mail e senha para acessar seu repertório, votos e ferramentas.'
              : 'Preencha para liberar o repertório privado. '}
            <strong className="text-[#0E7C7B]">O acervo de cifras continua 100% gratuito.</strong>
          </p>
        </div>

        {/* Entrar com Google — OAuth direto no Supabase */}
        <button
          onClick={handleGoogle}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-5 rounded-2xl bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 disabled:opacity-60 text-sm font-bold text-slate-700 transition-all cursor-pointer"
        >
          <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
          </svg>
          Continuar com Google
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ou</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Abas */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => switchMode('signin')}
            className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
              formMode === 'signin'
                ? 'bg-white text-[#0E7C7B] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Entrar
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
              formMode === 'signup'
                ? 'bg-white text-[#F26419] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          {formMode === 'signup' && (
            <>
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
            </>
          )}
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail"
              required
              autoComplete="email"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
            />
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha (mín. 6 caracteres)"
              required
              minLength={6}
              autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
            />
          </div>
          {formMode === 'signup' && (
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirme sua senha"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F26419] focus:bg-white transition-all"
              />
            </div>
          )}

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 font-bold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
          {info && (
            <p className="flex items-start gap-1.5 text-xs text-[#0E7C7B] font-semibold">
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {info}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-5 rounded-2xl bg-[#F26419] hover:bg-[#D9530D] disabled:opacity-60 text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-[#F26419]/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : formMode === 'signin' ? (
              'Entrar'
            ) : (
              'Criar Conta Grátis'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

/** Traduz erros comuns do Supabase para mensagens amigáveis. */
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists'))
    return 'Já existe uma conta com este e-mail. Faça login ou use "Esqueci a senha".';
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  return msg;
}
