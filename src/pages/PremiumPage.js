// src/pages/PremiumPage.js
import React from 'react';
import { useMembership } from '../components/MembershipProvider';
import { redirectToCheckout } from '../utils/stripe';

const PremiumPage = () => {
  const { user, isPremium, loading } = useMembership();

  if (loading) return <div>Carregando...</div>;
  if (!user) return <div>Faça login para acessar a área premium.</div>;

  if (!isPremium) {
    return (
      <div className="premium-upsell">
        <h1>Conteúdo exclusivo Ukemaster Pro</h1>
        <p>Assine nosso plano para desbloquear cifras, PDFs e videoaulas.</p>
        <button onClick={() => redirectToCheckout('price_id_exemplo')}>Assinar Agora</button>
      </div>
    );
  }

  return (
    <div className="premium-content">
      <h1>Bem‑vindo à área de membros!</h1>
      {/* Aqui você pode listar os conteúdos premium (cifras exclusivas, tutoriais, etc.) */}
    </div>
  );
};

export default PremiumPage;
