/**
 * Feature flag para ativação do shadow-mode do Controle de Voos no FRMS,
 * com granularidade por empresa (tenant), sem necessidade de migration.
 *
 * Default seguro: DESATIVADO para todas as empresas quando a variável de
 * ambiente não está definida ou está vazia. Rollback = remover/limpar a env var
 * (não requer deploy de código, apenas de configuração).
 */

export interface ControleVoosShadowFlagEnv {
  CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS?: string;
}

/**
 * `env.CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS` aceita:
 * - undefined ou string vazia: desativado para todas as empresas (default seguro).
 * - 'all': ativado para todas as empresas (uso apenas após paridade comprovada em canário).
 * - lista separada por vírgula de ids de empresa, ex: '12,47,103'.
 */
export function isControleVoosShadowModeEnabledForEmpresa(
  empresaId: number,
  env: ControleVoosShadowFlagEnv,
): boolean {
  const raw = (env.CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS ?? '').trim();
  if (!raw) return false;
  if (raw.toLowerCase() === 'all') return true;

  const allowedIds = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));

  return allowedIds.includes(empresaId);
}
