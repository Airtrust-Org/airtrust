/**
 * FRMS — resumo gerencial mensal, sem dados individuais ou diagnóstico.
 *
 * Somente agrega linhas CANÔNICAS, previamente escopadas ao tenant e à equipe
 * autorizada pelo backend. Nunca use este builder sobre dados brutos de outro
 * tenant ou o resultado de uma consulta que não aplicou o escopo de equipe.
 *
 * Não é laudo técnico assinado, relatório histórico persistido ou liberação de
 * missão. A revisão em meta é a da emissão, não uma revisão histórica diária.
 */
import type { FrmsComplianceReportRow } from './db-service-relatorios';

const METRICS = [
  'dias_avaliados',
  'dias_conformes',
  'dias_violacao',
  'dias_nao_avaliados',
  'dias_mitigacao',
  'dias_atencao',
] as const;
type Metric = typeof METRICS[number];

export interface FrmsMonthlySummaryMetric {
  /** Null = dado indisponível, incompleto ou suprimido; nunca zero inferido. */
  value: number | null;
  state: 'OBSERVED' | 'SMALL_CELL_SUPPRESSED' | 'INCOMPLETE_SOURCE' | 'NO_OBSERVATION';
}

export interface FrmsMonthlyConsolidatedSummary {
  status: 'SMALL_COHORT_SUPPRESSED' | 'NO_OBSERVATIONS' | 'PARTIAL_COVERAGE' | 'COVERAGE_UNVERIFIED';
  authorized_crew: number | null;
  represented_crew: number | null;
  indicators: Record<Metric, FrmsMonthlySummaryMetric>;
  /** Diferença entre eventos registrados; nunca tendência fisiológica nem taxa populacional. */
  recorded_month_delta: Record<Metric, number | null>;
  recommendations: string[];
  limitations: string[];
}

const missing = (state: FrmsMonthlySummaryMetric['state']): FrmsMonthlySummaryMetric => ({ value: null, state });

function makeMetric(rows: readonly FrmsComplianceReportRow[], key: Metric): FrmsMonthlySummaryMetric {
  if (rows.length === 0) return missing('NO_OBSERVATION');
  let total = 0;
  for (const row of rows) {
    const number = row[key];
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) {
      return missing('INCOMPLETE_SOURCE');
    }
    total += number;
    if (!Number.isSafeInteger(total)) return missing('INCOMPLETE_SOURCE');
  }
  // Suprimir células pequenas inclusive se o agregado representar poucos eventos.
  return total >= 1 && total <= 4
    ? missing('SMALL_CELL_SUPPRESSED')
    : { value: total, state: 'OBSERVED' };
}

export function buildFrmsMonthlyConsolidatedSummary(
  current: readonly FrmsComplianceReportRow[],
  previous: readonly FrmsComplianceReportRow[],
  authorizedCrewCount: number,
): FrmsMonthlyConsolidatedSummary {
  const indicators = {} as Record<Metric, FrmsMonthlySummaryMetric>;
  const recorded_month_delta = {} as Record<Metric, number | null>;
  const limitations = [
    'Contagens se referem somente a dias presentes no snapshot canônico e no escopo autorizado.',
    'Sem denominador de dias de escala/missões comprovadamente coberto, não interpretar ausência de registro como conformidade.',
    'Diferenças mensais são de eventos registrados, não taxas ajustadas por exposição nem evidência causal.',
    'KSS, sono, PVT, motivos individuais e informações médicas não integram este resumo.',
    'Números e providências não constituem diagnóstico nem liberação automática de missão.',
  ];
  const recommendations = [
    'Conferir a cobertura de escalas, check-ins e jornadas antes de assinar o fechamento mensal.',
    'Revisar os casos e registrar medidas, responsáveis, acompanhamento e eficácia na área operacional autorizada.',
  ];
  // Não expor sequer dimensão da equipe quando o escopo autorizado é muito pequeno.
  const validCohort = Number.isSafeInteger(authorizedCrewCount) && authorizedCrewCount >= 5;
  if (!validCohort) {
    for (const key of METRICS) {
      indicators[key] = missing('SMALL_CELL_SUPPRESSED');
      recorded_month_delta[key] = null;
    }
    return {
      status: 'SMALL_COHORT_SUPPRESSED', authorized_crew: null, represented_crew: null,
      indicators, recorded_month_delta, recommendations, limitations,
    };
  }
  const represented = current.length;
  for (const key of METRICS) {
    const now = makeMetric(current, key);
    const before = makeMetric(previous, key);
    indicators[key] = now;
    recorded_month_delta[key] = now.value !== null && before.value !== null
      ? now.value - before.value : null;
  }
  const status = represented === 0 ? 'NO_OBSERVATIONS'
    : represented < authorizedCrewCount ? 'PARTIAL_COVERAGE'
    : 'COVERAGE_UNVERIFIED';
  return {
    status,
    authorized_crew: authorizedCrewCount,
    represented_crew: represented >= 5 ? represented : null,
    indicators, recorded_month_delta, recommendations, limitations,
  };
}
