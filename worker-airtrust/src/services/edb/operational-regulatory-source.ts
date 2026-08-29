import type { EdbTechnicalDiscrepancy } from './contracts';

export type EdbRegulatoryDataOrigin = 'MANUAL' | 'SIGVOOS' | 'IMPORTACAO' | 'SISTEMA';

/**
 * Canonical regulatory semantics now live on the source `cv_voo_etapas` row.
 * `etapa_id` is an alias of that row id when loaded by the repository.
 */
export interface ControleVoosEtapaRegulatoriaRow {
  id: number;
  empresa_id: number;
  voo_id: number;
  etapa_id: number;
  tempo_voo_diurno_minutos: number | null;
  tempo_voo_noturno_minutos: number | null;
  tempo_voo_total_minutos: number | null;
  tempo_ifr_real_minutos: number | null;
  tempo_ifr_simulado_minutos: number | null;
  /** Preserved source IFR that has not yet been classified as actual/simulated. */
  tempo_ifr_nao_classificado_minutos: number | null;
  pousos_total: number | null;
  ciclos: number | null;
  combustivel_antes_partida_motor: number | null;
  pessoas_a_bordo_total: number | null;
  carga_regulatoria_kg: number | null;
  ocorrencias_json: string | null;
  origem_dados: EdbRegulatoryDataOrigin | null;
  versao: number;
  preenchido_por: number | null;
  preenchido_em: string | null;
}

export interface ControleVoosTripulanteRegulatorioRow {
  id: number;
  empresa_id: number;
  voo_id: number;
  tripulante_voo_id: number;
  etapa_id: number | null;
  funcionario_id: number;
  codigo_funcao_anac: string | null;
  origem_dados: Exclude<EdbRegulatoryDataOrigin, 'SIGVOOS'> | null;
  validado_por: number | null;
  validado_em: string | null;
}

export interface EdbExplicitRegulatoryStageData {
  dayMinutes: number | null;
  nightMinutes: number | null;
  totalMinutes: number | null;
  ifrActualMinutes: number | null;
  ifrSimulatedMinutes: number | null;
  /** Evidence only; it never satisfies actual/simulated IFR requirements. */
  ifrUnclassifiedMinutes: number | null;
  landingsTotal: number | null;
  cycles: number | null;
  fuelBeforeEngineStart: number | null;
  personsOnBoard: number | null;
  cargoKg: number | null;
  occurrences: string[] | null;
  technicalDiscrepancies: EdbTechnicalDiscrepancy[] | null;
}

function assertNonNegative(value: number | null, field: string): void {
  if (value !== null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${field} must be a non-negative finite number or null`);
  }
}

function assertNonNegativeInteger(value: number | null, field: string): void {
  assertNonNegative(value, field);
  if (value !== null && !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer or null`);
  }
}

export function parseExplicitOccurrencesJson(value: string | null): string[] | null {
  if (value === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('ocorrencias_json must be valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('ocorrencias_json must be a JSON array of strings');
  }

  return parsed.map((item) => item.trim()).filter(Boolean);
}

export function validateExplicitRegulatoryStage(
  row: ControleVoosEtapaRegulatoriaRow,
): void {
  for (const [field, value] of [
    ['tempo_voo_diurno_minutos', row.tempo_voo_diurno_minutos],
    ['tempo_voo_noturno_minutos', row.tempo_voo_noturno_minutos],
    ['tempo_voo_total_minutos', row.tempo_voo_total_minutos],
    ['tempo_ifr_real_minutos', row.tempo_ifr_real_minutos],
    ['tempo_ifr_simulado_minutos', row.tempo_ifr_simulado_minutos],
    ['tempo_ifr_nao_classificado_minutos', row.tempo_ifr_nao_classificado_minutos],
    ['combustivel_antes_partida_motor', row.combustivel_antes_partida_motor],
    ['carga_regulatoria_kg', row.carga_regulatoria_kg],
  ] as const) {
    assertNonNegative(value, field);
  }

  for (const [field, value] of [
    ['pousos_total', row.pousos_total],
    ['ciclos', row.ciclos],
    ['pessoas_a_bordo_total', row.pessoas_a_bordo_total],
  ] as const) {
    assertNonNegativeInteger(value, field);
  }

  if (
    row.tempo_voo_diurno_minutos !== null &&
    row.tempo_voo_noturno_minutos !== null &&
    row.tempo_voo_total_minutos !== null &&
    row.tempo_voo_diurno_minutos + row.tempo_voo_noturno_minutos !==
      row.tempo_voo_total_minutos
  ) {
    throw new Error('day + night flight time must equal total flight time');
  }

  if (
    row.tempo_voo_total_minutos !== null &&
    row.tempo_ifr_real_minutos !== null &&
    row.tempo_ifr_simulado_minutos !== null &&
    row.tempo_ifr_real_minutos + row.tempo_ifr_simulado_minutos >
      row.tempo_voo_total_minutos
  ) {
    throw new Error('actual + simulated IFR time cannot exceed total flight time');
  }

  parseExplicitOccurrencesJson(row.ocorrencias_json);
}

export function buildExplicitRegulatoryStageData(params: {
  row: ControleVoosEtapaRegulatoriaRow;
  technicalDiscrepancies?: EdbTechnicalDiscrepancy[] | null;
}): EdbExplicitRegulatoryStageData {
  validateExplicitRegulatoryStage(params.row);

  return {
    dayMinutes: params.row.tempo_voo_diurno_minutos,
    nightMinutes: params.row.tempo_voo_noturno_minutos,
    totalMinutes: params.row.tempo_voo_total_minutos,
    ifrActualMinutes: params.row.tempo_ifr_real_minutos,
    ifrSimulatedMinutes: params.row.tempo_ifr_simulado_minutos,
    ifrUnclassifiedMinutes: params.row.tempo_ifr_nao_classificado_minutos,
    landingsTotal: params.row.pousos_total,
    cycles: params.row.ciclos,
    fuelBeforeEngineStart: params.row.combustivel_antes_partida_motor,
    personsOnBoard: params.row.pessoas_a_bordo_total,
    cargoKg: params.row.carga_regulatoria_kg,
    occurrences: parseExplicitOccurrencesJson(params.row.ocorrencias_json),
    technicalDiscrepancies:
      params.technicalDiscrepancies === undefined
        ? null
        : params.technicalDiscrepancies === null
          ? null
          : params.technicalDiscrepancies.map((item) => ({
              description: item.description,
              detectedBy: { ...item.detectedBy },
            })),
  };
}
