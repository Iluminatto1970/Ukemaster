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
import React, { useState, useEffect, useRef } from 'react';
import { X, Mail, Lock, User, Phone, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { signInWithPassword, signUp, signInWithOAuth, SupabaseSession } from '../lib/supabaseAuth';
import { saveLead, normalizeWhatsApp } from '../lib/leads';
import { useT } from '../lib/i18n';
import { Logo } from './Logo';

export type AuthModalMode = 'signin' | 'signup';

/**
 * Mobile (celular/tablet): usa o fluxo REDIRECT (mesma aba) no Google em vez
 * de popup — no iOS Safari e em webviews o window.open é bloqueado ou a popup
 * perde o window.opener (o que quebraria o postMessage de retorno).
 */
const isMobileDevice =
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

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
  const { t } = useT();
  const [formMode, setFormMode] = useState<AuthModalMode>(mode);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Honeypot anti-bot: campo invisível que bots preenchem (humanos não veem).
  const [honeypot, setHoneypot] = useState('');

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

  // Ref da popup do Google — monitorada para reativar o botão se fechada.
  const googlePopupRef = useRef<Window | null>(null);
  const googleWatchRef = useRef<number | null>(null);
  const googleTimeoutRef = useRef<number | null>(null);
  // true quando o Google autenticou com sucesso — o watchdog NÃO deve
  // mostrar "fechada sem login" depois do sucesso (a popup se fecha sozinha).
  const googleDoneRef = useRef(false);

  // Limpa os watchdogs ao desmontar e ao REABRIR o modal (evita setState
  // após unmount e evita erro fantasma vindo de uma tentativa anterior).
  useEffect(() => {
    if (googleWatchRef.current) window.clearInterval(googleWatchRef.current);
    if (googleTimeoutRef.current) window.clearTimeout(googleTimeoutRef.current);
    googlePopupRef.current = null;
    googleWatchRef.current = null;
    googleTimeoutRef.current = null;
  }, [isOpen]);

  if (!isOpen) return null;

  const switchMode = (m: AuthModalMode) => {
    setFormMode(m);
    setError('');
    setInfo('');
  };

  /**
   * Inicia o login com Google (OAuth PKCE).
   *
   * 1) POPUP (padrão): abre a janela do Google e monitora o fechamento dela.
   *    Se o usuário completar o login, a popup posta a sessão e o AuthProvider
   *    fecha o modal automaticamente. Se a popup for FECHADA sem login, o
   *    watchdog reativa o botão (sem erro de navegação).
   * 2) REDIRECT (fallback, popup bloqueada): navega a página para o Google;
   *    um watchdog de beforeunload reativa o botão com aviso se a navegação
   *    for bloqueada (iframe restritivo/bloqueador).
   */
  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setSubmitting(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const result = await signInWithOAuth('google', redirectTo, !isMobileDevice);

      if (result.mode === 'popup' && result.popup) {
        googlePopupRef.current = result.popup;
        googleDoneRef.current = false;
        setInfo(t('auth.googlePopup'));
        // Monitora a popup: se o usuário fechar SEM autenticar, libera o botão
        // de novo (com aviso em vez de ficar preso em "carregando" para sempre).
        // No SUCESSO, o AuthProvider fecha o modal (isOpen=false) → o cleanup
        // acima cancela o intervalo antes de ele ver a popup fechada.
        googleWatchRef.current = window.setInterval(() => {
          if (googlePopupRef.current?.closed && !googleDoneRef.current) {
            if (googleWatchRef.current) window.clearInterval(googleWatchRef.current);
            googleWatchRef.current = null;
            setSubmitting(false);
            setInfo('');
            setError(t('auth.googleClosed'));
          }
        }, 800);
        return;
      }

      // REDIRECT: avisa que vai sair para o Google (visível no mobile, onde
      // este fluxo é o padrão) e detecta se a página realmente navegou. Se não
      // navegou em ~7s, algo bloqueou — reativa o botão e orienta o usuário.
      setInfo(t('auth.googleRedirect'));
      googleDoneRef.current = false;
      let navigated = false;
      const onBeforeUnload = () => {
        navigated = true;
      };
      window.addEventListener('beforeunload', onBeforeUnload);
      googleTimeoutRef.current = window.setTimeout(() => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (!navigated) {
          setSubmitting(false);
          setError(t('auth.googleBlocked'));
        }
      }, 7000);
    } catch (err: any) {
      setError(translateError(err?.message || t('auth.errGoogle'), t));
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
        // Bot caiu no honeypot → responde sucesso falso (sem criar conta).
        if (honeypot.trim()) {
          setInfo(t('auth.accountCreated'));
          setSubmitting(false);
          return;
        }
        // Cadastro: exige senha mínima e confirmação igual.
        if (password.length < 6) {
          setError(t('auth.errShortPassword'));
          setSubmitting(false);
          return;
        }
        if (password !== confirm) {
          setError(t('auth.errPasswordMismatch'));
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
        setInfo(result.message || t('auth.accountCreated'));
        setSubmitting(false);
        return;
      }

      // Login
      const session = await signInWithPassword(email.trim(), password);
      onAuthenticated(session);
    } catch (err: any) {
      const msg = err?.message || t('auth.errGeneric');
      setError(translateError(msg, t));
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
          {/* Logomarca oficial do portal — consistência de marca em todos os modais */}
          <Logo size="sm" />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-800 font-bold text-lg p-1 cursor-pointer"
            aria-label={t('auth.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 text-[#F26419] font-black text-[10px] tracking-wider uppercase border border-orange-200">
            <Sparkles className="w-3 h-3" />
            {formMode === 'signin' ? t('auth.badgeSignin') : t('auth.badgeSignup')}
          </span>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-2">
            {formMode === 'signin' ? t('auth.welcomeBack') : t('auth.createAccount')}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed mt-1">
            {formMode === 'signin' ? t('auth.signinDesc') : t('auth.signupDesc')}
            <strong className="text-[#0E7C7B]">{t('auth.freeCatalog')}</strong>
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
          {t('auth.google')}
        </button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('auth.or')}</span>
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
            {t('auth.signin')}
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={`py-2 rounded-lg text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
              formMode === 'signup'
                ? 'bg-white text-[#F26419] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('auth.signup')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          {/* Honeypot anti-bot: invisível para humanos (fora da tela) */}
          <div className="absolute left-[-9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
            <label htmlFor="auth-company">{t('auth.honeypot')}</label>
            <input
              id="auth-company"
              type="text"
              name="company_website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>
          {formMode === 'signup' && (
            <>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('auth.name')}
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
                  placeholder={t('auth.whatsapp')}
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
              placeholder={t('auth.email')}
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
              placeholder={t('auth.password')}
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
                placeholder={t('auth.confirm')}
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
              t('auth.signin')
            ) : (
              t('auth.signupFree')
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

/** Traduz erros comuns do Supabase para mensagens amigáveis (localizadas). */
function translateError(msg: string, t: (k: string) => string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return t('auth.errInvalid');
  if (m.includes('email not confirmed')) return t('auth.errNotConfirmed');
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists'))
    return t('auth.errExists');
  if (m.includes('password should be at least')) return t('auth.errShortPassword');
  if (m.includes('rate limit') || m.includes('too many requests'))
    return t('auth.errRateLimit');
  return msg;
}
