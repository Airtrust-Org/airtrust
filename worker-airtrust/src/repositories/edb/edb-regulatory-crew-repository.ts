export type RegulatoryCrewDataOrigin = 'MANUAL' | 'IMPORTACAO' | 'SISTEMA';

/**
 * Current onboard-function codes from Portaria 3.220/SPO/SAR art. 17, as
 * amended by Portarias 14.096/SPO/2024 and 15.103/SPO/2024.
 *
 * This is intentionally independent from AirTrust operational roles. A caller
 * must supply the regulatory function explicitly; PIC/SIC are never converted.
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
 * Stores an explicit ANAC function code for an existing Controle de Voos crew
 * row. The code is never inferred from PIC/SIC/COM/MEC. The source row itself
 * supplies flight, stage and employee identity, preventing caller-side scope
 * substitution.
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

  const update = await params.db
    .prepare(
      `
      UPDATE cv_voo_tripulantes_regulatorio
      SET codigo_funcao_anac = ?,
          origem_dados = ?,
          validado_por = ?,
          validado_em = datetime('now'),
          updated_by = ?,
          updated_at = datetime('now')
      WHERE empresa_id = ?
        AND voo_id = ?
        AND tripulante_voo_id = ?
        AND deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM cv_voo_tripulantes source
          WHERE source.id = cv_voo_tripulantes_regulatorio.tripulante_voo_id
            AND source.empresa_id = cv_voo_tripulantes_regulatorio.empresa_id
            AND source.voo_id = cv_voo_tripulantes_regulatorio.voo_id
            AND source.funcionario_id = cv_voo_tripulantes_regulatorio.funcionario_id
            AND (
              source.etapa_id = cv_voo_tripulantes_regulatorio.etapa_id
              OR (source.etapa_id IS NULL AND cv_voo_tripulantes_regulatorio.etapa_id IS NULL)
            )
            AND source.deleted_at IS NULL
        )
    `,
    )
    .bind(
      functionCode,
      params.origin,
      params.actorId ?? null,
      params.actorId ?? null,
      params.empresaId,
      params.vooId,
      params.tripulanteRecordId,
    )
    .run();

  if ((update.meta.changes ?? 0) === 1) return;

  const insert = await params.db
    .prepare(
      `
      INSERT INTO cv_voo_tripulantes_regulatorio (
        empresa_id, voo_id, tripulante_voo_id, etapa_id, funcionario_id,
        codigo_funcao_anac, origem_dados, validado_por, validado_em,
        created_by, updated_by, created_at, updated_at
      )
      SELECT
        source.empresa_id, source.voo_id, source.id, source.etapa_id, source.funcionario_id,
        ?, ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now')
      FROM cv_voo_tripulantes source
      WHERE source.id = ?
        AND source.empresa_id = ?
        AND source.voo_id = ?
        AND source.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM cv_voo_tripulantes_regulatorio existing
          WHERE existing.empresa_id = source.empresa_id
            AND existing.tripulante_voo_id = source.id
            AND (
              existing.etapa_id = source.etapa_id
              OR (existing.etapa_id IS NULL AND source.etapa_id IS NULL)
            )
            AND existing.deleted_at IS NULL
        )
    `,
    )
    .bind(
      functionCode,
      params.origin,
      params.actorId ?? null,
      params.actorId ?? null,
      params.actorId ?? null,
      params.tripulanteRecordId,
      params.empresaId,
      params.vooId,
    )
    .run();

  if ((insert.meta.changes ?? 0) !== 1) {
    throw new Error('EDB_REGULATORY_CREW_WRITE_CONFLICT');
  }
}
