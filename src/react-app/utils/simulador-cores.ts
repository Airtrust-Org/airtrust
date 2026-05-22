/**
 * UTILITÁRIOS DE CORES PARA SIMULADORES
 * Centraliza toda a lógica de cores para evitar duplicação.
 *
 * Paleta por aeronave × dispositivo:
 *   AW139 + Simulador → azul       (bg-blue-50 / border-blue-500 / text-blue-900)
 *   AW139 + Voo       → ciano      (bg-cyan-50  / border-cyan-500  / text-cyan-900)
 *   SK76  + Simulador → violeta    (bg-violet-50/ border-violet-500/ text-violet-900)
 *   SK76  + Voo       → fúcsia     (bg-fuchsia-50/border-fuchsia-500/text-fuchsia-900)
 *   Finalizada         → cinza     (bg-slate-100 / border-slate-300 / text-slate-500) — handled in caller
 *   Check (examinador) → versão escura da cor da aeronave
 */

type Cor = { bg: string; border: string; text: string };

/**
 * Paleta fallback (aeronaves não mapeadas)
 */
export const PALETTE_CORES: Cor[] = [
  { bg: 'bg-blue-50',    border: 'border-l-blue-500',    text: 'text-blue-700'    },
  { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-purple-50',  border: 'border-l-purple-500',  text: 'text-purple-700'  },
  { bg: 'bg-orange-50',  border: 'border-l-orange-500',  text: 'text-orange-700'  },
  { bg: 'bg-cyan-50',    border: 'border-l-cyan-500',    text: 'text-cyan-700'    },
  { bg: 'bg-pink-50',    border: 'border-l-pink-500',    text: 'text-pink-700'    },
  { bg: 'bg-indigo-50',  border: 'border-l-indigo-500',  text: 'text-indigo-700'  },
  { bg: 'bg-amber-50',   border: 'border-l-amber-500',   text: 'text-amber-700'   },
];

// Mapeamento de cores normais por aeronave × dispositivo
const CORES_SIMULADOR: Record<string, Cor> = {
  AW139: { bg: 'bg-blue-50',    border: 'border-l-blue-500',    text: 'text-blue-900'    },
  SK76:  { bg: 'bg-violet-50',  border: 'border-l-violet-500',  text: 'text-violet-900'  },
};
const CORES_AERONAVE: Record<string, Cor> = {
  AW139: { bg: 'bg-cyan-50',    border: 'border-l-cyan-500',    text: 'text-cyan-900'    },
  SK76:  { bg: 'bg-fuchsia-50', border: 'border-l-fuchsia-500', text: 'text-fuchsia-900' },
};

// Check (examinador presente) → versão escura
const CORES_CHECK_SIMULADOR: Record<string, Cor> = {
  AW139: { bg: 'bg-blue-200',    border: 'border-l-blue-900',    text: 'text-blue-950'    },
  SK76:  { bg: 'bg-violet-200',  border: 'border-l-violet-700',  text: 'text-violet-900'  },
};
const CORES_CHECK_AERONAVE: Record<string, Cor> = {
  AW139: { bg: 'bg-cyan-200',    border: 'border-l-cyan-900',    text: 'text-cyan-950'    },
  SK76:  { bg: 'bg-fuchsia-200', border: 'border-l-fuchsia-700', text: 'text-fuchsia-900' },
};

/**
 * Mapeamento explícito legado — mantido para compatibilidade com chamadas que
 * não passam tipo_dispositivo (ex: componentes de impressão).
 * Aponta para as cores de Simulador como fallback seguro.
 */
export const MAPEAMENTO_CORES_EXPLICITO: Record<string, Cor> = {
  AW139:   CORES_SIMULADOR['AW139'],
  aw139:   CORES_SIMULADOR['AW139'],
  SK76:    CORES_SIMULADOR['SK76'],
  sk76:    CORES_SIMULADOR['SK76'],
  'SK-76': CORES_SIMULADOR['SK76'],
};

/**
 * Interface para objetos que podem ter cor de simulador.
 * Aceita tanto agendamentos (com tipo_dispositivo) quanto objetos legados.
 */
export interface ObjetoComSimulador {
  simulador_tipo?: string;
  simulador_nome?: string;
  /** Campo do agendamento (SIMULADOR | AERONAVE). Undefined = SIMULADOR (default). */
  tipo_dispositivo?: 'SIMULADOR' | 'AERONAVE';
  /** Modelo da aeronave real (ex: 'AW139', 'SK76') — preenchido em sessões AERONAVE */
  aeronave_modelo?: string | null;
  examinador_id?: number | null;
  examinador_nome?: string | null;
}

/** Normaliza a chave de aeronave: SK-76 → SK76, aw139 → AW139 */
function normalizarChave(raw: string): string {
  return raw.replace(/-/g, '').toUpperCase();
}

/**
 * Detecta a aeronave e retorna 'AW139' | 'SK76' | null
 */
function detectarAeronave(chave: string): 'AW139' | 'SK76' | null {
  if (/AW.?139/i.test(chave)) return 'AW139';
  if (/SK.?76/i.test(chave)) return 'SK76';
  return null;
}

/**
 * Retorna a cor de uma sessão de simulador/voo.
 *
 * Prioridade:
 *   1. Sessões concluídas (CORES_CONCLUIDA) → tratado no componente caller
 *   2. Sessões de check (examinador presente) → versão escura por aeronave × dispositivo
 *   3. Sessões normais → paleta por aeronave × dispositivo
 *   4. Fallback → hash do nome do simulador → PALETTE_CORES
 */
export function getCorSimulador(obj: ObjetoComSimulador): Cor {
  // Chave de busca: preferir aeronave_modelo (sessões AERONAVE) antes de simulador_tipo/nome
  const chaveRaw = obj.aeronave_modelo || obj.simulador_tipo || obj.simulador_nome || '';
  const chave = normalizarChave(chaveRaw);
  const aeronave = detectarAeronave(chave);
  const isAeronave = obj.tipo_dispositivo === 'AERONAVE';

  // Sessões de check (examinador presente)
  if ((obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome) {
    if (aeronave) {
      return isAeronave
        ? (CORES_CHECK_AERONAVE[aeronave] ?? CORES_CHECK_SIMULADOR[aeronave])
        : CORES_CHECK_SIMULADOR[aeronave];
    }
    // Fallback genérico check
    return { bg: 'bg-amber-200', border: 'border-l-amber-700', text: 'text-amber-900' };
  }

  // Sessões normais por aeronave × dispositivo
  if (aeronave) {
    return isAeronave
      ? (CORES_AERONAVE[aeronave] ?? CORES_SIMULADOR[aeronave])
      : CORES_SIMULADOR[aeronave];
  }

  // Compatibilidade: mapeamento explícito legado (para chaves não normalizadas)
  if (MAPEAMENTO_CORES_EXPLICITO[chaveRaw]) {
    return MAPEAMENTO_CORES_EXPLICITO[chaveRaw];
  }

  // Fallback: hash do nome para cor consistente
  const hash = chave.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PALETTE_CORES[hash % PALETTE_CORES.length];
}

/**
 * Verifica se uma sessão é um check (tem examinador)
 */
export function isCheck(obj: ObjetoComSimulador): boolean {
  return (obj.examinador_id != null && obj.examinador_id > 0) || !!obj.examinador_nome;
}

/**
 * Retorna a classe de ring para sessão de check (cor por aeronave × dispositivo)
 */
export function getRingCheck(obj: ObjetoComSimulador): string {
  if (!isCheck(obj)) return '';
  const chave = normalizarChave(obj.aeronave_modelo || obj.simulador_tipo || obj.simulador_nome || '');
  const aeronave = detectarAeronave(chave);
  const isAeronave = obj.tipo_dispositivo === 'AERONAVE';
  if (aeronave === 'SK76') {
    return isAeronave ? 'ring-1 ring-fuchsia-600' : 'ring-1 ring-violet-600';
  }
  // AW139 e outros
  return isAeronave ? 'ring-1 ring-cyan-700' : 'ring-1 ring-blue-700';
}
