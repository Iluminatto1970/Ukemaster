// src/components/MonetagAd.js
import React, { useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * Exibe um espaço reservado para anúncios Monetag (ad-magnet).
 *
 * Props:
 *   - adSlotId: string (ID do slot Monetag — ex.: "monetag-slot-01")
 *   - pageType: string (para verificar se deve carregar o script)
 */
export default function MonetagAd({ adSlotId, pageType }) {
  // Bloquear anúncios Monetag nas páginas de listagem (igual ao AdSense)
  if (pageType === 'listing') return null;

  useEffect(() => {
    // Evita duplicação do script Monetag
    if (document.getElementById('monetag-script')) return;

    const script = document.createElement('script');
    script.id = 'monetag-script';
    script.async = true;
    // SUBSTITUA pela URL real do seu script Monetag
    script.src = 'https://cdn.monetag.com/monetag.js';
    document.body.appendChild(script);

    // Quando o Monetag carrega, registre o slot
    script.onload = () => {
      if (window.monetag) {
        window.monetag.render({
          slotId: adSlotId,
          selector: `#monetag-${adSlotId}`,
        });
      }
    };
  }, [adSlotId]);

  const formattedId = adSlotId.replace(/^slot(\d+)$/i, (m, n) => `slot-0${n}`);
  return <div id={`monetag-${formattedId}`} className="monetag-ad" />;
}

MonetagAd.propTypes = {
  adSlotId: PropTypes.string.isRequired,
  pageType: PropTypes.string.isRequired,
};