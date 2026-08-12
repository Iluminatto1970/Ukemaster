/**
 * Widget "Maiores Contribuidores": dois rankings da comunidade (top 5 cada) —
 * GERAL (todas as contribuições) e ESTE MÊS — com medalhas, avatar, nome e
 * contagem, mais a posição do usuário logado em cada um.
 * Contribuir exige login; quem não está logado vê um convite para entrar.
 */
import React, { useEffect, useState } from 'react';
import { Trophy, Loader2, LogIn, Crown, CalendarDays } from 'lucide-react';
import { useT } from '../lib/i18n';
import {
  fetchContributions,
  aggregateContributors,
  Contributor,
  startOfCurrentMonthISO,
} from '../lib/contributions';

interface TopContributorsProps {
  /** Usuário logado (com id) — usado para destacar a própria posição. */
  currentUser?: { id: string; name: string } | null;
  /** Incrementa a cada contribuição da sessão para o ranking atualizar. */
  refreshKey?: number;
  onOpenAuth?: (mode?: 'signup' | 'login') => void;
}

const AVATAR = (name: string) =>
  `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(
    name
  )}&backgroundColor=0e7c7b&fontWeight=600`;

const medalClass = (idx: number) =>
  idx === 0
    ? 'bg-[#F26419] text-white shadow-sm'
    : idx === 1
    ? 'bg-amber-400 text-[#1D2D44] shadow-sm'
    : idx === 2
    ? 'bg-[#F8B833] text-[#1D2D44] shadow-sm'
    : 'bg-slate-100 text-slate-400';

interface Section {
  label: string;
  icon: React.ReactNode;
  top: Contributor[];
  my: Contributor | null;
  myRank: number | null;
  total: number;
}

const RANKING_TOP = 5;

/** Linha individual do ranking (reutilizada pelas duas seções). */
const Row: React.FC<{
  c: Contributor;
  idx: number;
  isMe: boolean;
  t: (k: string) => string;
}> = ({ c, idx, isMe, t }) => (
  <div
    className={`flex items-center gap-2.5 p-1.5 rounded-lg ${
      isMe ? 'bg-[#F6AE2D]/20 border border-[#F6AE2D]/40' : 'hover:bg-white/10'
    } transition-colors`}
  >
    <span
      className={`w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[11px] font-black leading-none ${medalClass(
        idx
      )}`}
    >
      {idx === 0 ? <Crown className="w-3.5 h-3.5" /> : idx + 1}
    </span>
    <img
      src={AVATAR(c.name)}
      alt={c.name}
      loading="lazy"
      className="w-7 h-7 rounded-full object-cover border border-white/30 bg-white/10 shrink-0"
      onError={(e) => {
        const t = e.target as HTMLImageElement;
        t.onerror = null;
        t.src =
          'https://ui-avatars.com/api/?name=' +
          encodeURIComponent(c.name) +
          '&background=0E7C7B&color=fff&bold=true&size=64';
      }}
    />
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-extrabold truncate leading-tight flex items-center gap-1">
        {c.name}
        {isMe && (
          <span className="text-[8px] px-1.5 py-px rounded-full bg-[#F6AE2D] text-[#1D2D44] font-black uppercase">
            {t('contributors.you')}
          </span>
        )}
      </p>
      <p className="text-[9px] text-teal-200/75 font-bold">
        {c.count} {c.count === 1 ? t('contributors.contribution') : t('contributors.contributions')}
      </p>
    </div>
  </div>
);

export const TopContributors: React.FC<TopContributorsProps> = ({
  currentUser = null,
  refreshKey = 0,
  onOpenAuth,
}) => {
  const { t } = useT();
  const [all, setAll] = useState<Section | null>(null);
  const [month, setMonth] = useState<Section | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [allRows, monthRows] = await Promise.all([
        fetchContributions(),
        fetchContributions(startOfCurrentMonthISO()),
      ]);
      if (cancelled) return;
      const aggAll = aggregateContributors(allRows, currentUser?.id, RANKING_TOP);
      const aggMonth = aggregateContributors(monthRows, currentUser?.id, RANKING_TOP);
      setAll({
        label: t('contributors.general'),
        icon: <Trophy className="w-3 h-3 text-[#F6AE2D]" />,
        top: aggAll.top,
        my: aggAll.my,
        myRank: aggAll.myRank,
        total: aggAll.total,
      });
      setMonth({
        label: t('contributors.thisMonth'),
        icon: <CalendarDays className="w-3 h-3 text-[#F6AE2D]" />,
        top: aggMonth.top,
        my: aggMonth.my,
        myRank: aggMonth.myRank,
        total: aggMonth.total,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // refreshKey: atualiza depois de cada contribuição da sessão
  }, [refreshKey, currentUser?.id, t]);

  const sections = [all, month].filter(Boolean) as Section[];

  return (
    <div className="bg-gradient-to-br from-[#1D2D44] to-[#0E7C7B] rounded-2xl p-4 shadow-2xs space-y-3 text-white">
      <div className="flex items-center justify-between border-b border-white/15 pb-2">
        <h3 className="font-black uppercase text-xs tracking-wider flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-[#F6AE2D]" /> {t('contributors.title')}
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-teal-100/80 font-bold py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('contributors.loading')}
        </div>
      ) : sections.every((s) => s.total === 0) ? (
        <div className="py-2">
          <p className="text-[11px] text-teal-100/85 leading-relaxed">
            {t('contributors.empty')}
          </p>
          {!currentUser && onOpenAuth && (
            <button
              onClick={() => onOpenAuth('signup')}
              className="mt-2 w-full py-2 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white text-[11px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" /> {t('contributors.loginCta')}
            </button>
          )}
        </div>
      ) : (
        <>
          {sections.map((s) => (
            <div key={s.label} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-teal-100/90">
                  {s.icon} {s.label}
                </p>
                {s.total > 0 && (
                  <span className="text-[9px] font-bold text-teal-200/70">
                    {s.total} {s.total === 1 ? t('contributors.contributor') : t('contributors.contributors')}
                  </span>
                )}
              </div>

              {s.top.length === 0 ? (
                <p className="text-[10px] text-teal-100/70 italic">
                  {s.label === t('contributors.thisMonth') ? t('contributors.noneMonth') : t('contributors.noneYet')}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {s.top.map((c, idx) => (
                    <Row key={c.userId} c={c} idx={idx} isMe={!!currentUser && c.userId === currentUser.id} t={t} />
                  ))}
                </div>
              )}

              {currentUser && (
                <p className="pt-1 border-t border-white/10 text-[10px] font-bold text-teal-100/80">
                  {s.my ? (
                    <>
                      {t('contributors.youAt')
                        .replace('{rank}', String(s.myRank))
                        .replace('{count}', String(s.my.count))}{' '}
                      {s.my.count === 1 ? t('contributors.contribution') : t('contributors.contributions')}
                    </>
                  ) : (
                    <>
                      {s.label === t('contributors.thisMonth')
                        ? t('contributors.contributeMonth')
                        : t('contributors.contributeNow')}
                    </>
                  )}
                </p>
              )}
            </div>
          ))}

          {!currentUser &&
            onOpenAuth && (
              <button
                onClick={() => onOpenAuth('signup')}
                className="w-full py-2 rounded-xl bg-[#F26419] hover:bg-[#D9530D] text-white text-[11px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                title="Contribuir exige conta — o ranking mostra quem mais ajuda a comunidade"
              >
                <LogIn className="w-3.5 h-3.5" /> {t('contributors.loginCta2')}
              </button>
            )}
        </>
      )}
    </div>
  );
};
