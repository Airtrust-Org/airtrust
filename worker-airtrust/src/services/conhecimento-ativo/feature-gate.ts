import type { Env } from '../../types';

export function conhecimentoAtivoEnabledForTenant(env: Env, empresaId: number): boolean {
  const raw = env.CONHECIMENTO_ATIVO_ENABLED_TENANTS?.trim();
  if (!raw) return false;
  if (raw.toLowerCase() === 'all') return true;

  const allowed = new Set(
    raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0),
  );
  return allowed.has(empresaId);
}
