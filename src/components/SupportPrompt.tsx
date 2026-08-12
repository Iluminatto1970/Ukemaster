/**
 * Banner de apoio no topo: convida a doar no APOIA.se e explica que anúncios mantêm o portal.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { APOIA_SE_URL } from '../config';
import { useT } from '../lib/i18n';

export const SupportPrompt: React.FC = () => {
  const { t, lang } = useT();
  // Mensagens rotativas — montadas com as traduções do idioma ativo
  const messages = useMemo(
    () => [
      t('support.promptFree'),
      t('support.banner'),
      t('support.promptNoPaywall'),
      t('support.adOrDonate'),
      t('support.promptJoin'),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );
  // Mensagem atual + índice — o texto da barra RODIZIA sozinho (a cada 12s)
  // para não cansar: cada mensagem aparece em sequência e volta ao início.
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // Ao montar (ou trocar de idioma), começa da primeira mensagem e liga o
    // timer de rotação. O cleanup garante que a barra desmontada não continua
    // trocando texto em segundo plano.
    setMsg(messages[0]);
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % messages.length;
      setMsg(messages[idx]);
    }, 12_000);
    return () => clearInterval(timer);
  }, [messages]);

  return (
    <div className="bg-[#F26419] text-white text-center text-sm font-bold px-4 py-2 rounded-b-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      {/* key={msg} re-dispara a animação de entrada a cada troca */}
      <span key={msg} className="truncate animate-fade-in">{msg}</span>
      <a
        href={APOIA_SE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-3 py-0.5 text-xs transition-colors whitespace-nowrap"
      >
        {t('support.donate')}
      </a>
    </div>
  );
};
