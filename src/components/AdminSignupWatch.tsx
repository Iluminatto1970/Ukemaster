/**
 * Alerta de NOVO CADASTRO + contagem de usuários — visível APENAS para o
 * proprietário (isAdmin). Faz polling a cada 30s no endpoint protegido
 * /api/admin/users-stats (que valida o token Supabase do dono server-side)
 * e mostra um toast quando alguém novo se cadastra. O total de usuários é
 * repassado ao App (badge no menu ADMIN e resumo no painel).
 */
import React, { useEffect, useRef, useState } from 'react';
import { getSessionAccessToken } from '../lib/supabase';

const POLL_MS = 30000;
const SEEN_KEY = 'ukemaster_admin_signup_seen';

interface AdminSignupWatchProps {
  /** Apenas o e-mail do proprietário liga o watch. */
  isAdmin: boolean;
  /** Recebe o total de usuários cadastrados a cada ciclo (para badges). */
  onUserCount?: (total: number) => void;
  /** Recebe quantos usuários estão online a cada ciclo (topo do painel). */
  onOnlineCount?: (online: number) => void;
}

interface StatsResponse {
  total: number;
  online?: number;
  recent: { id: string; email: string; createdAt: string }[];
}

export const AdminSignupWatch: React.FC<AdminSignupWatchProps> = ({
  isAdmin,
  onUserCount,
  onOnlineCount,
}) => {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenRef = useRef<string>('');

  useEffect(() => {
    if (!isAdmin) return;

    // Marca "agora" na primeira vez — não alerta cadastros antigos
    try {
      const saved = localStorage.getItem(SEEN_KEY);
      if (saved && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(saved)) {
        lastSeenRef.current = saved;
      } else {
        lastSeenRef.current = new Date().toISOString();
        localStorage.setItem(SEEN_KEY, lastSeenRef.current);
      }
    } catch {
      lastSeenRef.current = new Date().toISOString();
    }

    let cancelled = false;

    const poll = async () => {
      const token = getSessionAccessToken();
      if (!token) return; // sem sessão — tenta no próximo ciclo
      try {
        const res = await fetch(
          `/api/admin/users-stats?after=${encodeURIComponent(lastSeenRef.current)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as StatsResponse;
        if (cancelled) return;
        onUserCount?.(data.total);
        onOnlineCount?.(data.online ?? 0);
        const rec = data.recent || [];
        if (rec.length) {
          const msg =
            rec.length === 1
              ? `👤 Novo cadastro: ${rec[0].email || 'novo usuário'}`
              : `👤 ${rec.length} novos cadastros: ${rec
                  .slice(0, 3)
                  .map((u) => u.email || '?')
                  .join(', ')}${rec.length > 3 ? '…' : ''}`;
          setToast(msg);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 7000);
          // o primeiro da lista é o mais recente (ordenado DESC)
          lastSeenRef.current = rec[0].createdAt;
          try {
            localStorage.setItem(SEEN_KEY, lastSeenRef.current);
          } catch {
            /* ignora */
          }
        }
      } catch {
        /* sem rede — tenta no próximo ciclo */
      }
    };

    // Economia de requisições: só faz polling com a aba VISÍVEL. Com a aba
    // em background o interval para (o browser até limitaria o timer, mas
    // parar de vez evita requisições inúteis ao Supabase/Vercel); ao voltar
    // para a aba, um poll imediato atualiza badges/toast na hora.
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (!timer) timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        poll();
        start();
      } else {
        stop();
      }
    };

    onVisibility(); // estado inicial (poll imediato se já estiver visível)
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!isAdmin || !toast) return null;

  return (
    <div
      role="status"
      className="fixed top-20 right-4 z-[80] max-w-[340px] rounded-2xl bg-gradient-to-br from-[#1b7f6e] to-[#12665a] text-white text-[13px] font-semibold px-4 py-3 shadow-xl shadow-emerald-900/25 animate-fade-in pointer-events-none"
    >
      {toast}
    </div>
  );
};
