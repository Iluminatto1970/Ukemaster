import React, { useEffect, useState } from 'react';
import { APOIA_SE_URL } from '../config';

export const SupportPrompt: React.FC = () => {
  const messages = [
    'Apoie no APOIA.se e entre para a comunidade! 💚',
    'Seu apoio mantém o UkeMaster Pro vivo.',
    'Sem paywall: anúncios + comunidade mantêm o portal. 🙏',
    'Ajude a melhorar a experiência, contribua!',
    'Faça parte da comunidade de apoiadores no APOIA.se.',
  ];
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setMsg(messages[Math.floor(Math.random() * messages.length)]);
  }, []);

  return (
    <a
      href={APOIA_SE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-[#F26419] text-white p-2 text-center font-bold text-sm rounded-b-xl hover:bg-[#D9530D] transition-colors"
    >
      {msg}
    </a>
  );
};
