import { describe, expect, it } from 'vitest';
import type { OperationalAccessResolution } from '../../services/operational-domain-access';
import { resolveMaintenanceManagementPolicy } from '../../routes/me-operational-access';

function access(overrides: Partial<OperationalAccessResolution> = {}): OperationalAccessResolution {
  return {
    enabled: true,
    domains: [],
    setorIds: [],
    actions: {},
    ...overrides,
  };
}

describe('FRMS maintenance management access policy', () => {
  it('autoriza administrador do tenant mesmo sem setor operacional próprio', () => {
    expect(resolveMaintenanceManagementPolicy('ADMINISTRADOR', access())).toBe('tenant_admin');
  });

  it('autoriza gestor central de fadiga com domínio FRMS', () => {
    expect(
      resolveMaintenanceManagementPolicy(
        'GESTOR',
        access({ domains: ['FRMS'], setorIds: [50] }),
      ),
    ).toBe('frms_manager');
  });

  it('mantém gestor de manutenção limitado ao escopo de setores atribuídos', () => {
    expect(
      resolveMaintenanceManagementPolicy(
        'GESTOR',
        access({ domains: ['MANUTENCAO'], setorIds: [11] }),
      ),
    ).toBe('maintenance_sector_manager');
  });

  it('não concede painel de manutenção a gestor apenas de operações', () => {
    expect(
      resolveMaintenanceManagementPolicy(
        'GESTOR',
        access({ domains: ['OPERACOES'], setorIds: [10] }),
      ),
    ).toBe('denied');
  });
});
