import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserPermissionOverride } = vi.hoisted(() => ({ getUserPermissionOverride: vi.fn() }));
vi.mock('../../middleware/rbac', () => ({ getUserPermissionOverride }));

import { hasRdvCapability, RDV_CAPABILITIES } from '../../services/controle-voos/rdv-workflow';

function context(role = 'viewer') {
  const values: Record<string, unknown> = {
    userId: 42,
    empresaId: 63,
    userRole: role,
    tenantContext: { role },
  };
  return { get: (key: string) => values[key] } as any;
}

describe('RDV coordination capability bridge', () => {
  beforeEach(() => getUserPermissionOverride.mockReset());

  it('viewer com GRANT controle_voos.edit recebe capability de revisão da Coordenação', async () => {
    getUserPermissionOverride.mockImplementation(async (_c: unknown, permission: string) =>
      permission === 'controle_voos.edit' ? 'GRANT' : null,
    );
    await expect(hasRdvCapability(context('viewer'), RDV_CAPABILITIES.revisar)).resolves.toBe(true);
    await expect(hasRdvCapability(context('viewer'), RDV_CAPABILITIES.corrigir)).resolves.toBe(true);
    await expect(hasRdvCapability(context('viewer'), RDV_CAPABILITIES.exportarPetrobras)).resolves.toBe(true);
  });

  it('DENY específico da capability continua prevalecendo sobre GRANT controle_voos.edit', async () => {
    getUserPermissionOverride.mockImplementation(async (_c: unknown, permission: string) => {
      if (permission === RDV_CAPABILITIES.corrigir) return 'DENY';
      if (permission === 'controle_voos.edit') return 'GRANT';
      return null;
    });
    await expect(hasRdvCapability(context('viewer'), RDV_CAPABILITIES.corrigir)).resolves.toBe(false);
  });

  it('viewer sem grant permanece fail-closed', async () => {
    getUserPermissionOverride.mockResolvedValue(null);
    await expect(hasRdvCapability(context('viewer'), RDV_CAPABILITIES.revisar)).resolves.toBe(false);
  });
});
