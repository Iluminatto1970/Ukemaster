/**
 * Utilitários de publicidade: hooks/helpers para anúncios (Carbon Ads e afins).
 */
import { useEffect } from 'react';

export function useCarbonAds() {
  useEffect(() => {
    if (document.getElementById('carbonads-script')) return;
    const s = document.createElement('script');
    s.id = 'carbonads-script';
    s.async = true;
    s.src = 'https://cdn.carbonads.com/carbon.js?serve=CKYIKK7E&placement=yourdomain';
    document.head.appendChild(s);
  }, []);
}
