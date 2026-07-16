/**
 * Comparador em shadow-mode entre o caminho legado (SIGVOOS → frms_jornada) e o
 * caminho canônico em construção (Controle de Voos → FRMS).
 *
 * Regras de segurança (não negociáveis):
 * - Função pura, sem I/O: não lê nem grava no banco.
 * - Nunca retorna nem grava um "score" ou "jornada oficial" — apenas estatísticas
 *   de divergência para observabilidade.
 * - Não expõe PII: usa apenas `tripulanteId` (numérico), nunca nome/matrícula/CPF.
 */

import type { ControleVoosOperationalRecord } from './controle-voos-source';

export interface FrmsJornadaLegacyRow {
  tripulante_id: number;
  data: string;
  empresa_id: number;
}

export type ControleVoosShadowDivergenceType =
  | 'AUSENTE_NO_CONTROLE_VOOS'
  | 'AUSENTE_NO_LEGADO'
  | 'DIVERGENCIA_MINUTOS_VOO';

export interface ControleVoosShadowDivergence {
  tripulanteId: number;
  data: string;
  tipo: ControleVoosShadowDivergenceType;
  minutosVooLegado: number | null;
  minutosVooControleVoos: number | null;
}

export interface ControleVoosShadowComparisonSummary {
  periodo: { from: string; to: string };
  totalRegistrosLegado: number;
  totalRegistrosControleVoos: number;
  totalDivergencias: number;
  divergenciasPorTipo: Record<ControleVoosShadowDivergenceType, number>;
  /** Amostra limitada para evitar logs excessivamente grandes; não contém PII. */
  amostraDivergencias: ControleVoosShadowDivergence[];
}

export const TOLERANCIA_MINUTOS_VOO = 10;
const AMOSTRA_MAX = 20;

function buildKey(tripulanteId: number, data: string): string {
  return `${tripulanteId}::${data}`;
}

function parseKey(key: string): { tripulanteId: number; data: string } {
  const [tripulanteIdStr, data] = key.split('::');
  return { tripulanteId: Number(tripulanteIdStr), data };
}

/**
 * Compara os registros do Controle de Voos com as linhas de `frms_jornada`
 * (caminho legado) para a mesma janela/empresa, agregando minutos de voo por
 * tripulante+dia e reportando divergências. Não altera nem infere score.
 */
export function compareControleVoosWithLegacyJornada(
  controleVoosRecords: ControleVoosOperationalRecord[],
  legacyJornadaRows: FrmsJornadaLegacyRow[],
  periodo: { from: string; to: string },
): ControleVoosShadowComparisonSummary {
  // Nota: `statusCancelamentoConfirmado` é sempre `false` no contrato atual (ver
  // CONTROLE_VOOS_FRMS_KNOWN_GAPS) — não há como excluir voos cancelados aqui.
  // Os minutos somados podem incluir voos cancelados até essa lacuna ser resolvida.
  const cvMinutosPorChave = new Map<string, number>();
  for (const record of controleVoosRecords) {
    const key = buildKey(record.tripulanteId, record.dataOperacional);
    cvMinutosPorChave.set(key, (cvMinutosPorChave.get(key) ?? 0) + record.minutosVoo);
  }

  const legacyChaves = new Set<string>();
  for (const row of legacyJornadaRows) {
    legacyChaves.add(buildKey(row.tripulante_id, row.data));
  }

  const divergenciasPorTipo: Record<ControleVoosShadowDivergenceType, number> = {
    AUSENTE_NO_CONTROLE_VOOS: 0,
    AUSENTE_NO_LEGADO: 0,
    DIVERGENCIA_MINUTOS_VOO: 0,
  };
  const amostraDivergencias: ControleVoosShadowDivergence[] = [];

  const registrar = (divergencia: ControleVoosShadowDivergence) => {
    divergenciasPorTipo[divergencia.tipo] += 1;
    if (amostraDivergencias.length < AMOSTRA_MAX) {
      amostraDivergencias.push(divergencia);
    }
  };

  const todasAsChaves = new Set<string>([...legacyChaves, ...cvMinutosPorChave.keys()]);

  for (const chave of todasAsChaves) {
    const { tripulanteId, data } = parseKey(chave);
    const noLegado = legacyChaves.has(chave);
    const noCv = cvMinutosPorChave.has(chave);

    if (noLegado && !noCv) {
      registrar({
        tripulanteId,
        data,
        tipo: 'AUSENTE_NO_CONTROLE_VOOS',
        minutosVooLegado: null,
        minutosVooControleVoos: null,
      });
      continue;
    }

    if (!noLegado && noCv) {
      registrar({
        tripulanteId,
        data,
        tipo: 'AUSENTE_NO_LEGADO',
        minutosVooLegado: null,
        minutosVooControleVoos: cvMinutosPorChave.get(chave) ?? null,
      });
      continue;
    }

    // Sem uma fonte confiável de minutos de voo do legado neste contrato (frms_jornada
    // não expõe minutos agregados diretamente), registramos apenas presença aqui.
    // A comparação de minutos por tipo DIVERGENCIA_MINUTOS_VOO fica reservada para quando
    // o chamador fornecer dados legados com minutos agregados (evita falsos positivos).
  }

  const totalDivergencias =
    divergenciasPorTipo.AUSENTE_NO_CONTROLE_VOOS +
    divergenciasPorTipo.AUSENTE_NO_LEGADO +
    divergenciasPorTipo.DIVERGENCIA_MINUTOS_VOO;

  return {
    periodo,
    totalRegistrosLegado: legacyChaves.size,
    totalRegistrosControleVoos: cvMinutosPorChave.size,
    totalDivergencias,
    divergenciasPorTipo,
    amostraDivergencias,
  };
}
