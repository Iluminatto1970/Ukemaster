/**
 * Contador público de membros cadastrados (rodapé do site).
 * Busca /api/members-count uma única vez; se falhar, não renderiza nada
 * (o rodapé continua limpo). O rótulo traduzido vem do App (i18n).
 */
import React, { useEffect, useState } from 'react';

interface MembersCountProps {
  label: string;
}

export const MembersCount: React.FC<MembersCountProps> = ({ label }) => {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/members-count')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.total === 'number') setTotal(d.total);
      })
      .catch(() => {
        /* offline — não mostra nada */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (total === null || total <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span aria-hidden>👥</span>
      {total} {label}
    </span>
  );
};
