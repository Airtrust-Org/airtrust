/** BOA synthetic source→canonical employee crosswalk QA; read-only, no source approval. */
import { z } from 'zod';
import { BoaOperationalSourceBatchSchema } from './bombeiros-duty-source-contract';
const code = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
export const BoaQaCrosswalkSchema = z.object({
  schema: z.literal('BOA_QA_SYNTHETIC_CROSSWALK_V1'),
  source_system_id: z.literal('BOA-QA-SYNTHETIC'),
  mappings: z.array(z.object({
    external_crew_id: code, external_sector_id: code,
    funcionario_id: z.number().int().positive().safe(),
    setor_id: z.number().int().positive().safe(),
  }).strict()).min(1).max(130),
}).strict();
export interface BoaQaCrosswalkStatus {
  status: 'QA_CROSSWALK_STRUCTURALLY_MATCHED_SOURCE_UNVERIFIED';
  mapped_crew_count: number; mapped_duty_count: number;
  tenant_identity_link: 'QA_CANDIDATE_ONLY_NOT_APPROVED';
  source_approval: 'NOT_EVALUATED'; personal_data_returned: false;
  persisted: false; scientific_risk_score: null;
  dispatch_permission: 'NOT_GRANTED';
}
/** Only an authorized BOA admin may call: tenant context never comes from upload. */
export async function checkBoaQaCrosswalk(
  db: D1Database, authenticatedTenantId: number, sourceInput: unknown,
  mappingInput: unknown,
): Promise<BoaQaCrosswalkStatus> {
  if (!Number.isSafeInteger(authenticatedTenantId)
    || authenticatedTenantId <= 0 || authenticatedTenantId === 6)
    throw new Error('BOA_QA_CROSSWALK_TENANT_REQUIRED');
  const source = BoaOperationalSourceBatchSchema.parse(sourceInput);
  const crosswalk = BoaQaCrosswalkSchema.parse(mappingInput);
  if (source.source.source_system_id !== 'BOA-QA-SYNTHETIC'
    || crosswalk.source_system_id !== source.source.source_system_id
    || !source.source.dataset_id.startsWith('qa-')
    || !source.source.source_document_reference.startsWith('qa-'))
    throw new Error('BOA_QA_CROSSWALK_SYNTHETIC_ONLY');
  const byCrew = new Map<string, typeof crosswalk.mappings[number]>();
  const usedEmployees = new Set<number>();
  for (const mapping of crosswalk.mappings) {
    if (byCrew.has(mapping.external_crew_id)
      || usedEmployees.has(mapping.funcionario_id))
      throw new Error('BOA_QA_CROSSWALK_DUPLICATE_IDENTITY');
    byCrew.set(mapping.external_crew_id, mapping);
    usedEmployees.add(mapping.funcionario_id);
  }
  const dutyCrew = new Set<string>();
  for (const duty of source.records) {
    dutyCrew.add(duty.external_crew_id);
    const mapping = byCrew.get(duty.external_crew_id);
    if (!mapping || mapping.external_sector_id !== duty.external_sector_id)
      throw new Error('BOA_QA_CROSSWALK_SOURCE_UNMAPPED');
  }
  if (byCrew.size !== dutyCrew.size)
    throw new Error('BOA_QA_CROSSWALK_EXTRA_MAPPING');
  const ids = [...usedEmployees].sort((a, b) => a - b);
  const placeholders = ids.map(() => '?').join(',');
  const sql = 'SELECT f.id AS funcionario_id, f.setor_id FROM funcionarios f '
    + 'JOIN setores s ON s.id=f.setor_id AND s.empresa_id=f.empresa_id '
    + 'WHERE f.empresa_id=? AND s.empresa_id=? AND f.id IN (' + placeholders + ') '
    + 'AND f.ativo=1 AND f.deleted_at IS NULL '
    + "AND UPPER(COALESCE(NULLIF(TRIM(f.status),''),'ATIVO'))='ATIVO' "
    + 'AND s.ativo=1 AND s.deleted_at IS NULL';
  const response = await db.prepare(sql)
    .bind(authenticatedTenantId, authenticatedTenantId, ...ids)
    .all<{ funcionario_id: number; setor_id: number }>();
  const canonical = new Map<number, number>();
  for (const row of response.results ?? []) {
    if (!Number.isSafeInteger(row.funcionario_id)
      || !Number.isSafeInteger(row.setor_id)
      || canonical.has(row.funcionario_id))
      throw new Error('BOA_QA_CROSSWALK_CANONICAL_INTEGRITY');
    canonical.set(row.funcionario_id, row.setor_id);
  }
  if (canonical.size !== ids.length
    || crosswalk.mappings.some(m => canonical.get(m.funcionario_id) !== m.setor_id))
    throw new Error('BOA_QA_CROSSWALK_CANONICAL_MISMATCH');
  return {
    status: 'QA_CROSSWALK_STRUCTURALLY_MATCHED_SOURCE_UNVERIFIED',
    mapped_crew_count: dutyCrew.size, mapped_duty_count: source.records.length,
    tenant_identity_link: 'QA_CANDIDATE_ONLY_NOT_APPROVED',
    source_approval: 'NOT_EVALUATED', personal_data_returned: false,
    persisted: false, scientific_risk_score: null,
    dispatch_permission: 'NOT_GRANTED',
  };
}
