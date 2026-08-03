import React, { useState } from 'react';
import { X, Lock, Sparkles, CheckCircle2, User, Mail, KeyRound, ArrowRight, ShieldCheck, HeartHandshake } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: { name: string; email: string }) => void;
  initialMode?: 'signup' | 'login';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  initialMode = 'signup',
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const displayName = name.trim() || email.split('@')[0] || 'Músico';
    onLoginSuccess({ name: displayName, email: email.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden relative">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-[#1D2D44] via-[#0E7C7B] to-[#1D2D44] p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-[#F26419] text-white font-extrabold text-[10px] tracking-wider uppercase inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              100% Grátis
            </span>
            <span className="text-xs font-semibold text-teal-100">Portal do Ukulele</span>
          </div>

          <h2 className="text-2xl font-black text-white tracking-tight">
            {mode === 'signup' ? 'Criar Conta de Músico' : 'Entrar na sua Conta'}
          </h2>
          <p className="text-teal-100 text-xs mt-1">
            {mode === 'signup'
              ? 'Desbloqueie cifras completas, transposição de tom e seu Repertório Privado!'
              : 'Acesse seu repertório e músicas salvas de qualquer lugar.'}
          </p>
        </div>

        {/* Benefits banner */}
        <div className="bg-[#FEF0E8] border-b border-[#F26419]/20 px-6 py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1D2D44]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#F26419] shrink-0" />
              <span>Acesso ilimitado a cifras e letras completas</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1D2D44]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0E7C7B] shrink-0" />
              <span>Seu próprio **Repertório Privado** personalizado</span>
            </div>
          </div>
        </div>

        {/* Tabs switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 py-3 text-xs font-extrabold transition-all cursor-pointer border-b-2 ${
              mode === 'signup'
                ? 'border-[#F26419] text-[#F26419] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Cadastrar-se Grátis
          </button>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-3 text-xs font-extrabold transition-all cursor-pointer border-b-2 ${
              mode === 'login'
                ? 'border-[#F26419] text-[#F26419] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Já tenho Conta
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Seu Nome de Músico
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João do Ukulele"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#F26419] focus:bg-white"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Endereço de E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@exemplo.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#F26419] focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Senha de Acesso
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#F26419] focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white font-extrabold text-xs tracking-wider uppercase shadow-md shadow-[#F26419]/20 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
          >
            <span>{mode === 'signup' ? 'Cadastrar e Liberar Cifras' : 'Entrar no Sistema'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-[11px] text-center text-slate-500 pt-2">
            Ao continuar, você aceita os Termos de Uso e Política do Ukulele Studio.
          </p>
        </form>
      </div>
    </div>
  );
};
