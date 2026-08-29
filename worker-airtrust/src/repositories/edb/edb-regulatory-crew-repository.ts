export type RegulatoryCrewDataOrigin = 'MANUAL' | 'IMPORTACAO' | 'SISTEMA';

/**
 * Current onboard-function codes from Portaria 3.220/SPO/SAR art. 17, as
 * amended by Portarias 14.096/SPO/2024 and 15.103/SPO/2024.
 *
 * This remains independent from AirTrust operational roles. PIC/SIC are never
 * silently converted into an ANAC eDB function code.
 */
export const CURRENT_ANAC_EDB_FUNCTION_CODES = [
  'P1',
  'P2',
  'I1',
  'I2',
  'O1',
  'O2',
  'O3',
  'V1',
  'V2',
  'V3',
  'C',
  'M',
  'X',
  'D',
] as const;

export type CurrentAnacEdbFunctionCode =
  (typeof CURRENT_ANAC_EDB_FUNCTION_CODES)[number];

const CURRENT_ANAC_EDB_FUNCTION_CODE_SET = new Set<string>(
  CURRENT_ANAC_EDB_FUNCTION_CODES,
);

export function normalizeAnacFunctionCode(value: string): CurrentAnacEdbFunctionCode {
  const normalized = value.trim().toUpperCase();
  if (!CURRENT_ANAC_EDB_FUNCTION_CODE_SET.has(normalized)) {
    throw new Error('EDB_INVALID_ANAC_FUNCTION_CODE');
  }
  return normalized as CurrentAnacEdbFunctionCode;
}

/**
 * Stores the regulatory function on the existing `cv_voo_tripulantes` source
 * row. No parallel crew registry is created.
 */
export async function setControleVoosRegulatoryCrewFunction(params: {
  db: D1Database;
  empresaId: number;
  vooId: number;
  tripulanteRecordId: number;
  functionCode: string;
  origin: RegulatoryCrewDataOrigin;
  actorId?: number | null;
}): Promise<void> {
  const functionCode = normalizeAnacFunctionCode(params.functionCode);

  const result = await params.db
    .prepare(
      `
      UPDATE cv_voo_tripulantes
      SET codigo_funcao_anac = ?,
          funcao_anac_origem = ?,
          funcao_anac_validado_por = ?,
          funcao_anac_validado_em = datetime('now'),
          updated_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
        AND empresa_id = ?
        AND voo_id = ?
        AND deleted_at IS NULL
    `,
    )
    .bind(
      functionCode,
      params.origin,
      params.actorId ?? null,
      params.actorId ?? null,
      params.tripulanteRecordId,
      params.empresaId,
      params.vooId,
    )
    .run();

  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_CREW_WRITE_CONFLICT');
  }
}
