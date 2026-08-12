/**
 * Contribuições da comunidade: registra cada ação (nova cifra, edição, voto,
 * comentário, correção, playlist) com autoria verificada no servidor
 * (user_id = auth.uid()) e alimenta o ranking "Maiores Contribuidores".
 *
 * A regra "NUNCA CONTRIBUIR SEM LOGAR" é aplicada em 3 camadas:
 *   1. UI: os botões de contribuir só agem logado (abrem o login se não);
 *   2. Log: logContribution só é chamada com usuário autenticado;
 *   3. Banco: o RLS da tabela `contributions` exige auth.uid() e força
 *      user_id = auth.uid()::text — impossível forjar a autoria.
 */
import { supabaseRequest, fetchAllRows, isSupabaseConfigured } from './supabase';

export type ContributionAction =
  | 'song_new' // cifra criada
  | 'song_edit' // cifra editada
  | 'vote' // voto em música
  | 'comment' // comentário publicado
  | 'feedback' // correção de cifra enviada
  | 'playlist_new'; // playlist criada

export interface ContributionRow {
  id: string;
  user_id: string;
  user_name: string;
  action: ContributionAction | string;
  target_type?: string | null;
  target_id?: string | null;
  created_at: string;
}

interface ContributionInput {
  userId: string;
  userName: string;
  action: ContributionAction;
  targetType?: string;
  targetId?: string;
}

/**
 * Registra uma contribuição no Supabase. Retorna true se o servidor aceitou.
 * Nunca lança — falha silenciosa (o app segue funcionando sem o ranking).
 */
export async function logContribution(input: ContributionInput): Promise<boolean> {
  if (!isSupabaseConfigured() || !input.userId) return false;
  const row = {
    id: `con-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: input.userId,
    user_name: (input.userName || 'Músico').trim().slice(0, 60),
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
  };
  const { ok } = await supabaseRequest('contributions', {
    method: 'POST',
    body: row,
    prefer: 'return=minimal',
    silent: true, // falha silenciosa — nunca interrompe a ação principal
  });
  return ok;
}

/**
 * Busca contribuições (pagina 1000 em 1000). `since` (ISO) filtra por data
 * (ex.: início do mês → ranking "do mês"). null = indisponível.
 */
export async function fetchContributions(
  since?: string
): Promise<ContributionRow[] | null> {
  if (!isSupabaseConfigured()) return null;
  const filter = since ? `&created_at=gte.${encodeURIComponent(since)}` : '';
  return fetchAllRows<ContributionRow>(
    'contributions',
    filter,
    'id,user_id,user_name,action,target_type,target_id,created_at'
  );
}

/** Início do mês atual em UTC (ISO) — base do ranking "do mês". */
export function startOfCurrentMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface Contributor {
  userId: string;
  name: string;
  count: number;
}

/**
 * Agrega as contribuições por usuário (por user_id, exibindo o último nome
 * usado) e devolve o top N ordenado por contagem. O dono atual recebe sua
 * posição mesmo fora do top N.
 */
export function aggregateContributors(
  rows: ContributionRow[] | null,
  currentUserId?: string | null,
  top = 10
): { top: Contributor[]; my: Contributor | null; myRank: number | null; total: number } {
  const byUser = new Map<string, { name: string; count: number }>();
  for (const r of rows || []) {
    const key = r.user_id || 'desconhecido';
    const entry = byUser.get(key) || { name: r.user_name || 'Músico', count: 0 };
    entry.count += 1;
    // O último nome usado é o mais recente/confiável
    if (r.user_name) entry.name = r.user_name;
    byUser.set(key, entry);
  }

  const sorted = Array.from(byUser.entries())
    .map(([userId, v]) => ({ userId, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  let my: Contributor | null = null;
  let myRank: number | null = null;
  if (currentUserId) {
    const idx = sorted.findIndex((c) => c.userId === currentUserId);
    if (idx >= 0) {
      my = { userId: sorted[idx].userId, name: sorted[idx].name, count: sorted[idx].count };
      myRank = idx + 1;
    }
  }

  return { top: sorted.slice(0, top), my, myRank, total: sorted.length };
}
