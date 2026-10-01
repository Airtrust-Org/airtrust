import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserPermissionOverride } = vi.hoisted(() => ({ getUserPermissionOverride: vi.fn() }));
vi.mock('../../middleware/rbac', () => ({ getUserPermissionOverride }));

import { hasRdvCapability, RDV_CAPABILITIES } from '../../services/controle-voos/rdv-workflow';

function context(role = 'viewer', profile: string | null = null) {
  const values: Record<string, unknown> = {
    userId: 42,
    empresaId: 63,
    userRole: role,
    tenantContext: { role },
  };
  const first = vi.fn(async () => (profile === null ? null : { perfil: profile }));
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    get: (key: string) => values[key],
    env: { DB: { prepare } },
  } as any;
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

describe('RDV pilot own-scope viewer/student profile bridge', () => {
  beforeEach(() => getUserPermissionOverride.mockReset());

  it('viewer com perfil ALUNO recebe somente capabilities de escopo próprio', async () => {
    getUserPermissionOverride.mockResolvedValue(null);
    const c = context('viewer', 'ALUNO');

    await expect(hasRdvCapability(c, RDV_CAPABILITIES.visualizarProprio)).resolves.toBe(true);
    await expect(hasRdvCapability(c, RDV_CAPABILITIES.editarRascunhoProprio)).resolves.toBe(true);
    await expect(hasRdvCapability(c, RDV_CAPABILITIES.visualizarTodos)).resolves.toBe(false);
  });

  it('viewer sem perfil de aluno permanece fail-closed no escopo próprio', async () => {
    getUserPermissionOverride.mockResolvedValue(null);
    await expect(
      hasRdvCapability(context('viewer', 'GESTOR'), RDV_CAPABILITIES.visualizarProprio),
    ).resolves.toBe(false);
  });

  it('DENY explícito continua prevalecendo sobre o fallback ALUNO', async () => {
    getUserPermissionOverride.mockImplementation(async (_c: unknown, permission: string) =>
      permission === RDV_CAPABILITIES.visualizarProprio ? 'DENY' : null,
    );
    await expect(
      hasRdvCapability(context('viewer', 'ALUNO'), RDV_CAPABILITIES.visualizarProprio),
    ).resolves.toBe(false);
  });
});
