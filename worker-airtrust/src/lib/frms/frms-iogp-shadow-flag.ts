/**
 * Gate de ativação do pipeline observacional FRMS IOGP
 * (SIGVOOS -> operational-demand -> REDEMET -> environmental-risk -> snapshot).
 *
 * O pipeline é sempre não-canônico: ele persiste evidência separada e nunca
 * altera fatorização, acumulo, bloqueio ou effectiveness. A ativação continua
 * fail-closed e por tenant explícito.
 *
 * Staging:
 * - `FRMS_IOGP_SHADOW_MODE_TENANTS`
 *
 * Produção (somente evidência observacional):
 * - `FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS`
 *
 * Regras comuns:
 * - variável ausente ou vazia mantém desativado;
 * - `all` nunca é aceito;
 * - somente IDs positivos explícitos separados por vírgula são válidos;
 * - qualquer token inválido faz toda a configuração falhar fechada;
 * - development/test não habilitam por essas variáveis.
 */
export interface FrmsIogpShadowFlagEnv {
  ENVIRONMENT?: string;
  FRMS_IOGP_SHADOW_MODE_TENANTS?: string;
  FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS?: string;
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

function resolveAllowlist(env: FrmsIogpShadowFlagEnv): string {
  if (env.ENVIRONMENT === 'staging') {
    return (env.FRMS_IOGP_SHADOW_MODE_TENANTS ?? '').trim();
  }
  if (env.ENVIRONMENT === 'production') {
    return (env.FRMS_IOGP_PRODUCTION_EVIDENCE_TENANTS ?? '').trim();
  }
  return '';
}

export function isFrmsIogpShadowModeEnabledForTenant(
  env: FrmsIogpShadowFlagEnv,
  tenantId: number,
): boolean {
  if (!Number.isInteger(tenantId) || tenantId <= 0) return false;

  const raw = resolveAllowlist(env);
  if (!raw || raw.toLowerCase() === 'all') return false;

  const allowedTenantIds = parseAllowedTenantIds(raw);
  return allowedTenantIds?.includes(tenantId) ?? false;
}
