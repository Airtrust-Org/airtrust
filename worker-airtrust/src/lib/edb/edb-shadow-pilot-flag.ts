/**
 * Gate de ativação do protótipo eDB shadow.
 *
 * Regras deliberadamente restritivas:
 * - somente o ambiente `staging` pode habilitar o recurso;
 * - variável ausente ou vazia mantém o recurso desativado;
 * - `all` nunca é aceito;
 * - somente IDs positivos explícitos e separados por vírgula são válidos;
 * - qualquer token inválido faz a configuração falhar fechada por completo.
 */
export interface EdbShadowPilotFlagEnv {
  ENVIRONMENT?: string;
  EDB_SHADOW_PILOT_TENANTS?: string;
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

export function isEdbShadowPilotEnabledForTenant(
  env: EdbShadowPilotFlagEnv,
  tenantId: number,
): boolean {
  if (env.ENVIRONMENT !== 'staging') return false;
  if (!Number.isInteger(tenantId) || tenantId <= 0) return false;

  const raw = (env.EDB_SHADOW_PILOT_TENANTS ?? '').trim();
  if (!raw || raw.toLowerCase() === 'all') return false;

  const allowedTenantIds = parseAllowedTenantIds(raw);
  return allowedTenantIds?.includes(tenantId) ?? false;
}
