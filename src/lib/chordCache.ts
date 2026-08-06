/**
 * Cache de acordes gerados pelo motor de voicings (chordGenerator).
 *
 * Hidrata o cache em memória do motor com:
 *   1. localStorage (rápido, por dispositivo);
 *   2. Supabase (tabela `chord_dictionary` — compartilhado entre dispositivos).
 *
 * E persiste novos acordes gerados de volta para os dois. Tudo idempotente
 * (PK = nome do acorde) e silencioso: se a tabela não existir ou a rede
 * falhar, o app continua funcionando com geração local.
 */
import { ChordDefinition, ChordFingering } from '../types';
import { seedGeneratedChords, getAllGeneratedChords } from '../utils/chordGenerator';
import { fetchRows, upsertRows } from './supabase';

const LS_KEY = 'ukemaster_generated_chords_v1';
const TABLE = 'chord_dictionary';

interface ChordDictionaryRow {
  name: string;
  key: string;
  quality: string;
  frets: number[];
  fingers: number[];
  barre_fret?: number;
  base_fret?: number;
  difficulty?: string;
}

function defToRow(def: ChordDefinition): ChordDictionaryRow {
  const f = def.fingerings[0] || ({} as ChordFingering);
  // Chaves SEMPRE presentes (o PostgREST rejeita arrays com chaves
  // diferentes — PGRST102 "All object keys must match").
  return {
    name: def.name,
    key: def.key,
    quality: def.quality,
    frets: f.frets || [],
    fingers: f.fingers || [],
    barre_fret: f.barreFret ?? null,
    base_fret: f.baseFret ?? null,
    difficulty: def.difficulty || 'médio',
  };
}

function rowToDef(row: ChordDictionaryRow): ChordDefinition {
  const fingering: ChordFingering = {
    frets: Array.isArray(row.frets) ? row.frets : [],
    fingers: Array.isArray(row.fingers) ? row.fingers : [],
    ...(row.barre_fret ? { barreFret: row.barre_fret } : {}),
    ...(row.base_fret ? { baseFret: row.base_fret } : {}),
  };
  return {
    id: row.name,
    name: row.name,
    key: row.key,
    quality: row.quality,
    difficulty: (row.difficulty as ChordDefinition['difficulty']) || 'médio',
    generated: true,
    fingerings: [fingering],
  };
}

/** Evento disparado quando a hidratação do cache de acordes termina
 * (localStorage + Supabase) — o Dicionário escuta para re-renderizar e
 * mostrar os acordes gerados compartilhados. */
export const CHORDS_HYDRATED_EVENT = 'ukemaster-chords-hydrated';

let hydrated = false;

/**
 * Carrega os acordes gerados conhecidos (localStorage + Supabase) para o
 * cache do motor. Seguro chamar várias vezes (só carrega uma vez).
 */
export async function hydrateChordCache(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  // 1. localStorage — resposta instantânea
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const rows = JSON.parse(raw) as ChordDictionaryRow[];
      if (Array.isArray(rows) && rows.length) seedGeneratedChords(rows.map(rowToDef));
    }
  } catch {
    // localStorage indisponível (SSR/privado) — segue sem cache local
  }

  // 2. Supabase — compartilhado entre dispositivos (falha silenciosa)
  try {
    const rows = await fetchRows<ChordDictionaryRow>(TABLE, '', '*', true);
    if (rows && rows.length) {
      seedGeneratedChords(rows.map(rowToDef));
    }
  } catch {
    // tabela/rede indisponível — o motor gera localmente
  }

  // Avisa os componentes (ex.: Dicionário) que os acordes compartilhados
  // estão disponíveis para exibição/busca.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHORDS_HYDRATED_EVENT));
  }
}

let persistTimer: number | null = null;

/**
 * Persiste todos os acordes gerados até agora em localStorage + Supabase.
 * Idempotente (upsert por PK). Agrupado em um único flush para não disparar
 * uma escrita a cada acorde novo.
 */
export function schedulePersistGeneratedChords(delayMs = 1500): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    const defs = getAllGeneratedChords();
    if (defs.length === 0) return;

    // localStorage
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(defs.map(defToRow)));
    } catch {
      // cheio/indisponível — ignora
    }

    // Supabase (upsert silencioso; não bloqueia a UI)
    void upsertRows(TABLE, defs.map(defToRow)).catch(() => undefined);
  }, delayMs);
}
