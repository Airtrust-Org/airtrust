import { describe, expect, it } from 'vitest';
import { conhecimentoAtivoEnabledForTenant } from '../../services/conhecimento-ativo/feature-gate';
import type { Env } from '../../types';

function env(value?: string): Env {
  return { CONHECIMENTO_ATIVO_ENABLED_TENANTS: value } as unknown as unknown as Env;
}

describe('Conhecimento Ativo — feature gate', () => {
  it('permanece fail-closed quando a configuração está ausente', () => {
    expect(conhecimentoAtivoEnabledForTenant(env(), 6)).toBe(false);
  });

  it('aceita allowlist explícita por tenant', () => {
    expect(conhecimentoAtivoEnabledForTenant(env('4, 6, 9'), 6)).toBe(true);
    expect(conhecimentoAtivoEnabledForTenant(env('4, 6, 9'), 7)).toBe(false);
  });

  it('aceita all apenas quando explicitamente configurado', () => {
    expect(conhecimentoAtivoEnabledForTenant(env('all'), 999)).toBe(true);
  });
});
