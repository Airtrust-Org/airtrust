/**
 * Feature flag for populating the Controle de Voos tables
 * (`cv_voos` / `cv_voo_etapas` / `cv_voo_tripulantes`) from the same raw SIGVOOS
 * payload the canonical FRMS sync already fetches.
 *
 * This is deliberately separate from `CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS`
 * (which only reads/compares). This flag actually writes to the cv_* tables via
 * the existing governed importer (`runSigvoosImporterBatch`).
 *
 * Safe default: DISABLED for every tenant when the env var is undefined or
 * empty. Rollback = clear the env var (config change only, no code deploy).
 * A cv_* import failure never affects the FRMS sync path.
 */

export interface ControleVoosFrmsImportFlagEnv {
  CONTROLE_VOOS_FRMS_IMPORT_TENANTS?: string;
}

/**
 * `env.CONTROLE_VOOS_FRMS_IMPORT_TENANTS` accepts:
 * - undefined / empty string: disabled for every tenant (safe default);
 * - 'all': enabled for every tenant (only after canary parity is proven);
 * - comma-separated list of empresa ids, e.g. '6,12,47'.
 *
 * Any malformed token disables the whole configuration (fail closed).
 */
export function isControleVoosFrmsImportEnabledForEmpresa(
  empresaId: number,
  env: ControleVoosFrmsImportFlagEnv,
): boolean {
  if (!Number.isInteger(empresaId) || empresaId <= 0) return false;

  const raw = (env.CONTROLE_VOOS_FRMS_IMPORT_TENANTS ?? '').trim();
  if (!raw) return false;
  if (raw.toLowerCase() === 'all') return true;

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return false;
  if (parts.some((part) => !/^[1-9]\d*$/.test(part))) return false;

  return [...new Set(parts.map(Number))].includes(empresaId);
}
