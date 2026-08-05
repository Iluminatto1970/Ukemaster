/**
 * Banner de apoio no topo: convida a doar no APOIA.se e explica que anúncios mantêm o portal.
 */
import React, { useEffect, useState } from 'react';
import { APOIA_SE_URL } from '../config';

export const SupportPrompt: React.FC = () => {
  const messages = [
    'Este portal é 100% gratuito: os anúncios que você vê mantêm tudo de pé. 🙏',
    'Apoie no APOIA.se e entre para a comunidade! 💚',
    'Sem paywall: anúncios + comunidade mantêm o UkeMaster Pro vivo.',
    'Ver um anúncio ou doar 1 café = acervo de cifras grátis para todos.',
    'Faça parte da comunidade de apoiadores no APOIA.se.',
  ];
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setMsg(messages[Math.floor(Math.random() * messages.length)]);
  }, []);

  return (
    <div className="bg-[#F26419] text-white text-center text-sm font-bold px-4 py-2 rounded-b-xl flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
      <span className="truncate">{msg}</span>
      <a
        href={APOIA_SE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 bg-white/15 hover:bg-white/25 rounded-full px-3 py-0.5 text-xs transition-colors whitespace-nowrap"
      >
        💚 Doar no APOIA.se
      </a>
    </div>
  );
};
