/**
 * Gate de ativação do FRMS IOGP shadow pipeline (SIGVOOS -> leg-context ->
 * operational-demand -> weather -> environmental-risk -> compliance-policy ->
 * frms-risk-orchestrator -> evaluation-contract -> iogp-decision-adapter).
 *
 * Modeled directly on `lib/edb/edb-shadow-pilot-flag.ts` — same fail-closed
 * shape, deliberately restrictive:
 * - somente o ambiente `staging` pode habilitar o recurso;
 * - variável ausente ou vazia mantém o recurso desativado;
 * - `all` nunca é aceito;
 * - somente IDs positivos explícitos e separados por vírgula são válidos;
 * - qualquer token inválido faz a configuração falhar fechada por completo.
 *
 * When disabled for a tenant, callers MUST NOT: query any of the new
 * frms_iogp_* / frms_regulatory_profiles / frms_location_catalog /
 * frms_jornada_avaliacoes tables, call REDEMET, or affect the canonical
 * operational decision in any way.
 */
export interface FrmsIogpShadowFlagEnv {
  ENVIRONMENT?: string;
  FRMS_IOGP_SHADOW_MODE_TENANTS?: string;
}

function parseAllowedTenantIds(raw: string): number[] | null {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) return [];
  if (parts.some((part) => !/^[1-9]\d*$/.test(part))) return null;

  return [...new Set(parts.map((part) => Number(part)))];
}

export function isFrmsIogpShadowModeEnabledForTenant(
  env: FrmsIogpShadowFlagEnv,
  tenantId: number,
): boolean {
  if (env.ENVIRONMENT !== 'staging') return false;
  if (!Number.isInteger(tenantId) || tenantId <= 0) return false;

  const raw = (env.FRMS_IOGP_SHADOW_MODE_TENANTS ?? '').trim();
  if (!raw || raw.toLowerCase() === 'all') return false;

  const allowedTenantIds = parseAllowedTenantIds(raw);
  return allowedTenantIds?.includes(tenantId) ?? false;
}
