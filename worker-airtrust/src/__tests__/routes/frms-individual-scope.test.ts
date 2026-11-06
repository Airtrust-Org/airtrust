import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ current: { mode: 'all', setorIds: [] as number[], funcionarioId: null as number | null } }));
vi.mock('../../middleware/employee-sector-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/employee-sector-access')>()),
  getEmployeeSectorAccess: vi.fn(async () => access.current),
}));

import { assertFuncionarioNoEscopoFrms } from '../../routes/frms-shared';

function ctx(sectorRow: { id: number } | null = null) {
  const first = vi.fn(async () => sectorRow);
  return {
    first,
    c: {
      env: { DB: { prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })) } },
      get: vi.fn(),
      json: vi.fn((body: unknown, status: number) => ({ body, status })),
    } as never,
  };
}

describe('AUD-015/018 — dado individual do FRMS respeita o escopo de setor', () => {
  beforeEach(() => { access.current = { mode: 'all', setorIds: [], funcionarioId: null }; });

  it('admin acessa qualquer tripulante da empresa', async () => {
    expect(await assertFuncionarioNoEscopoFrms(ctx().c, 6, 42)).toBeNull();
  });

  it('tripulante acessa só o próprio cadastro', async () => {
    access.current = { mode: 'self', setorIds: [3], funcionarioId: 42 };
    expect(await assertFuncionarioNoEscopoFrms(ctx().c, 6, 42)).toBeNull();
    expect(await assertFuncionarioNoEscopoFrms(ctx().c, 6, 43)).toMatchObject({
      status: 403, body: { code: 'FRMS_INDIVIDUAL_SCOPE_DENIED' },
    });
  });

  it('gestor acessa só tripulantes dos seus setores', async () => {
    access.current = { mode: 'restricted', setorIds: [3], funcionarioId: null };
    expect(await assertFuncionarioNoEscopoFrms(ctx({ id: 42 }).c, 6, 42)).toBeNull();
    expect(await assertFuncionarioNoEscopoFrms(ctx(null).c, 6, 43)).toMatchObject({ status: 403 });
  });

  it('gestor sem setor vinculado falha fechado', async () => {
    access.current = { mode: 'restricted', setorIds: [], funcionarioId: null };
    expect(await assertFuncionarioNoEscopoFrms(ctx({ id: 42 }).c, 6, 42)).toMatchObject({ status: 403 });
  });

  it('id inválido (jornada sem tripulante resolvido) falha fechado', async () => {
    expect(await assertFuncionarioNoEscopoFrms(ctx().c, 6, Number.NaN)).toMatchObject({ status: 403 });
  });
});
