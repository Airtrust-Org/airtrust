import { sha256, stableJson } from './matriz-import-plan.mjs';

/**
 * Reject planner inputs that merely look like a tenant snapshot.  A plan made
 * from empty arrays cannot detect a production change between approval and
 * apply, so it must never be accepted as a production-grade fingerprint.
 */
export function assertRealTenantFingerprintState({
  empresaId,
  currentVersions,
  resolvedManoeuvres,
  links,
  migrationState,
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0)
    throw new Error('empresa_id inválido para snapshot do fingerprint');
  if (!migrationState || typeof migrationState.has_0440 !== 'boolean')
    throw new Error('snapshot sem estado real da migration 0440');
  if (!Array.isArray(currentVersions) || currentVersions.length === 0)
    throw new Error('snapshot sem versões correntes');
  if (!Array.isArray(resolvedManoeuvres) || resolvedManoeuvres.length === 0)
    throw new Error('snapshot sem manobras resolvidas');
  if (!Array.isArray(links) || links.length === 0) throw new Error('snapshot sem vínculos');
}

export function buildTenantFingerprint({
  empresaId,
  currentVersions = [],
  resolvedManoeuvres = [],
  links = [],
  migrationState = {},
}) {
  if (!Number.isInteger(empresaId) || empresaId <= 0)
    throw new Error('empresa_id inválido para fingerprint');
  const payload = {
    empresa_id: empresaId,
    current_versions: [...currentVersions]
      .map((row) => ({
        codigo_canonico: row.codigo_canonico,
        modelo_id: row.modelo_id,
        versao_numero: row.versao_numero,
        versao_matriz: row.versao_matriz,
        is_current: row.is_current,
      }))
      .sort(
        (a, b) =>
          String(a.codigo_canonico).localeCompare(String(b.codigo_canonico)) ||
          a.modelo_id - b.modelo_id,
      ),
    manobras: [...resolvedManoeuvres]
      .map((row) => ({ id: row.id, codigo: row.codigo, empresa_id: row.empresa_id }))
      .sort((a, b) => a.id - b.id),
    links: [...links]
      .map((row) => ({
        id: row.id,
        modelo_id: row.modelo_id,
        manobra_id: row.manobra_id,
        ordem: row.ordem,
        deleted_at: row.deleted_at || null,
      }))
      .sort((a, b) => a.id - b.id),
    migrations: {
      has_0440: Boolean(migrationState.has_0440),
      versionamento_count: Number(migrationState.versionamento_count || 0),
    },
  };
  return { payload, fingerprint: sha256(payload), canonical: stableJson(payload) };
}
