import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/setores-gestores', () => ({
  getSetorGestoresBySetor: vi.fn(),
}));

import { getSetorGestoresBySetor } from '../../services/setores-gestores';
import { resolveSetorComplianceAlertEmails } from '../../services/setores-responsaveis-compliance';

function dbWithExplicit(rows: Array<{ funcionario_email: string }>, tablePresent = true) {
  return {
    prepare(sql: string) {
      return {
        first: async () =>
          sql.includes('sqlite_master') ? (tablePresent ? { found: 1 } : null) : null,
        bind: () => ({
          first: async () =>
            sql.includes('sqlite_master') ? (tablePresent ? { found: 1 } : null) : null,
          all: async () => ({
            results: rows.map((r, i) => ({
              id: i + 1,
              empresa_id: 6,
              setor_id: 12,
              setor_nome: 'Operações',
              funcionario_id: i + 10,
              funcionario_nome: `Pessoa ${i}`,
              funcionario_email: r.funcionario_email,
              funcionario_cargo: null,
              ativo: 1,
              created_at: null,
              updated_at: null,
            })),
          }),
        }),
      };
    },
  } as unknown as D1Database;
}

describe('resolveSetorComplianceAlertEmails', () => {
  it('uses explicit sector responsibles and does not consult operational access', async () => {
    vi.mocked(getSetorGestoresBySetor).mockClear();
    const db = dbWithExplicit([
      { funcionario_email: 'RESP1@example.com' },
      { funcionario_email: 'RESP2@example.com' },
    ]);
    await expect(resolveSetorComplianceAlertEmails(db, 6, 12)).resolves.toEqual([
      'RESP1@example.com',
      'RESP2@example.com',
    ]);
    expect(getSetorGestoresBySetor).not.toHaveBeenCalled();
  });

  it('preserves legacy operational-manager recipients while sector is unconfigured', async () => {
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'manager@example.com' },
    ] as never);
    const db = dbWithExplicit([]);
    await expect(resolveSetorComplianceAlertEmails(db, 6, 12)).resolves.toEqual([
      'manager@example.com',
    ]);
    expect(getSetorGestoresBySetor).toHaveBeenCalledWith(db, 6, 12, true);
  });

  it('also falls back safely before the additive table is applied', async () => {
    vi.mocked(getSetorGestoresBySetor).mockResolvedValue([
      { gestor_email: 'legacy@example.com' },
    ] as never);
    const db = dbWithExplicit([], false);
    await expect(resolveSetorComplianceAlertEmails(db, 6, 12)).resolves.toEqual([
      'legacy@example.com',
    ]);
  });
});
