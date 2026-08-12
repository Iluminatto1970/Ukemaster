/**
 * Registro público de certificados (tabela `certificates` no Supabase).
 *
 * A emissão do certificado (client-side) grava uma linha aqui — o registro
 * é a fonte da verdade usada pela página pública /verificar/:code para
 * confirmar a autenticidade do código UKM-ANO-XXXXXX.
 *
 * UNICIDADE DO NÚMERO: o código UKM-ANO-XXXXXX é a PK da tabela. O número
 * gerado já é semeador com o id do usuário/dispositivo (ver
 * makeCertificateNumber), mas este módulo ainda confere ANTES de gravar:
 * se o número já existir com dados DIFERENTES (colisão rara), gera uma
 * variante salgada até achar um número livre — nunca sobrescreve um
 * certificado alheio. Se existir com os MESMOS dados, é re-emissão
 * (idempotente, mantém o número).
 */
import { fetchRows, supabaseRequest, upsertRows } from './supabase';

export interface CertificateRecord {
  number: string;
  trail_id: string;
  trail_title: string;
  level: string;
  holder_name: string;
  issued_on: string;
}

/** Hash djb2 → 6 hexa (mesma função usada na geração do número). */
const hash6 = (str: string): string => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
};

/** Gera uma variante do número com um sal (mantém o formato UKM-ANO-XXXXXX). */
const saltNumber = (number: string, salt: number): string => {
  const year = number.slice(4, 8); // UKM-YYYY-XXXXXX
  const hash = number.slice(9);
  return `UKM-${year}-${hash6(`${hash}|${salt}`)}`;
};

const sameCertificate = (a: CertificateRecord, b: CertificateRecord): boolean =>
  a.trail_id === b.trail_id && a.holder_name === b.holder_name && a.issued_on === b.issued_on;

/**
 * Registra (ou atualiza) um certificado emitido. Garante que o número fique
 * único no registro:
 *  - número livre → grava e retorna ele;
 *  - número já existe com os MESMOS dados → re-emissão, mantém (idempotente);
 *  - número já existe com dados DIFERENTES (colisão) → tenta variantes
 *    salgadas até achar um número livre e retorna o número final;
 *  - falha → retorna null (chamador ignora — o certificado local segue válido).
 */
export const registerCertificate = async (rec: CertificateRecord): Promise<string | null> => {
  const existing = await fetchCertificate(rec.number);
  if (existing) {
    if (sameCertificate(existing, rec)) return rec.number; // re-emissão
    // Colisão: tenta variantes até achar um número que não exista.
    for (let salt = 1; salt <= 10; salt++) {
      const candidate = saltNumber(rec.number, salt);
      const taken = await fetchCertificate(candidate);
      if (!taken) {
        const ok = await upsertRows('certificates', [{ ...rec, number: candidate }]);
        return ok ? candidate : null;
      }
    }
    return null;
  }
  const ok = await upsertRows('certificates', [rec]);
  return ok ? rec.number : null;
};

/** Busca um certificado pelo código de verificação. Null = não encontrado. */
export const fetchCertificate = async (
  number: string
): Promise<CertificateRecord | null> => {
  const rows = await fetchRows<CertificateRecord>(
    'certificates',
    `&number=eq.${encodeURIComponent(number)}`,
    '*',
    true // silent: 404/erro de tabela não deve poluir o console do visitante
  );
  return rows && rows.length > 0 ? rows[0] : null;
};

/**
 * Apaga um certificado do registro pelo número (usado apenas se um dia
 * precisar remover emissão indevida). Retorna true se foi aceito.
 */
export const deleteCertificate = (number: string): Promise<boolean> =>
  supabaseRequest('certificates', {
    method: 'DELETE',
    query: `?number=eq.${encodeURIComponent(number)}`,
  }).then(({ ok }) => ok);
