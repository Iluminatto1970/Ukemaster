/**
 * Banco de leads do UkeMaster Pro.
 *
 * Captura nome/e-mail/WhatsApp no cadastro (paywall estilo Scribd) e envia
 * para o SEU banco de dados de leads:
 *  - Supabase (Postgres) via REST — quando VITE_SUPABASE_URL e
 *    VITE_SUPABASE_ANON_KEY estão configurados (`.env.local` / Vercel).
 *  - Fallback: localStorage (desenvolvimento) — útil para testar o fluxo.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Setup do Supabase (2 minutos):
 * 1. Crie um projeto grátis em https://supabase.com/
 * 2. SQL Editor → execute:
 *
 *    create table leads (
 *      id uuid primary key default gen_random_uuid(),
 *      created_at timestamptz not null default now(),
 *      name text not null,
 *      email text not null,
 *      whatsapp text,
 *      source text
 *    );
 *
 *    alter table leads enable row level security;
 *
 *    -- (opcional) permite INSERT anônimo com a anon key, sem permitir SELECT
 *    create policy "insert_leads" on leads for insert with check (true);
 *
 * 3. Project Settings → API: copie "Project URL" e "anon public key".
 * 4. Cole no .env.local como VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
 *    Seus leads ficam em Supabase → Table Editor → leads.
 * ─────────────────────────────────────────────────────────────────────
 */

import { supabaseRequest, isSupabaseConfigured } from './supabase';

export interface Lead {
  name: string;
  email: string;
  whatsapp?: string;
  source?: string;
  createdAt?: string;
}

const LOCAL_STORAGE_LEADS_KEY = 'ukemaster_leads_v1';

/**
 * Salva um lead. Retorna onde foi armazenado: 'supabase' ou 'local'.
 */
export async function saveLead(lead: Lead): Promise<{ stored: 'supabase' | 'local' }> {
  if (isSupabaseConfigured()) {
    const { ok } = await supabaseRequest('leads', {
      method: 'POST',
      body: lead,
      prefer: 'return=minimal',
    });
    if (ok) {
      console.info('[leads] Lead salvo no Supabase ✅');
      return { stored: 'supabase' };
    }
    // Se falhou (rede/CORS/RLS), cai no fallback local para não perder o lead.
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_LEADS_KEY);
    const leads: Lead[] = raw ? JSON.parse(raw) : [];
    leads.push({ ...lead, createdAt: new Date().toISOString() });
    localStorage.setItem(LOCAL_STORAGE_LEADS_KEY, JSON.stringify(leads));
    console.info('[leads] Lead salvo localmente (dev) ✅', lead);
  } catch (e) {
    console.error('[leads] Erro ao salvar localmente:', e);
  }
  return { stored: 'local' };
}

/**
 * Normaliza WhatsApp para o formato internacional com DDI brasileiro:
 * "(11) 98765-4321" → "5511987654321".
 */
export function normalizeWhatsApp(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return '55' + digits; // número brasileiro sem DDI
  }
  return digits;
}
