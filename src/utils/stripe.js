// src/utils/stripe.js
import { loadStripe } from '@stripe/stripe-js';

// Inicialização segura do Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLIC_KEY || '');

export const redirectToCheckout = async (sessionId) => {
  const stripe = await stripePromise;
  if (!stripe) {
    throw new Error('Stripe não pôde ser carregado.');
  }
  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    console.error('Erro no redirecionamento do Stripe:', error);
  }
};
