import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  vincularUsuarioAoFuncionarioPorEmail,
  vincularFuncionarioAoUsuarioPorEmail,
} from '../../services/vinculo-usuario-funcionario';

type MockConfig = {
  /** id do usuário retornado na busca por e-mail (usuário → funcionário) */
  usuarioId?: number | null;
  /** id do funcionário retornado na busca por e-mail (funcionário → usuário) */
  funcionarioId?: number | null;
};

function createMockDb(config: MockConfig = {}) {
  const updates: Array<{ args: unknown[] }> = [];
  const db = {
    prepare: vi.fn((sql: string) => {
      const handle = {
        bind: (...args: unknown[]) => {
          (handle as unknown as { _args: unknown[] })._args = args;
          return handle;
        },
        first: async () => {
          const s = sql.toLowerCase();
          if (s.includes('from usuarios u') && s.includes('usuarios_empresas')) {
            if (config.usuarioId == null) return null;
            return { id: config.usuarioId };
          }
          if (s.includes('from funcionarios f')) {
            if (config.funcionarioId == null) return null;
            return { id: config.funcionarioId };
          }
          return null;
        },
        run: async () => {
          updates.push({ args: (handle as unknown as { _args: unknown[] })._args || [] });
          return { meta: { changes: 1 } };
        },
      };
      return handle;
    }),
  } as unknown as D1Database;

  return { db, updates };
}

describe('vinculo-usuario-funcionario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('vincula usuário existente ao funcionário recém-criado por e-mail', async () => {
    const { db, updates } = createMockDb({ usuarioId: 69 });

    const resultado = await vincularUsuarioAoFuncionarioPorEmail(
      db,
      1,
      301,
      '  Rodrigo.Joao@EXEMPLO.com ',
    );

    expect(resultado).toEqual({ usuario_id: 69, funcionario_id: 301 });
    expect(updates).toHaveLength(1);
    expect(updates[0].args).toEqual([301, 69]);
  });

  it('não vincula quando não há usuário com o mesmo e-mail', async () => {
    const { db, updates } = createMockDb({ usuarioId: null });

    const resultado = await vincularUsuarioAoFuncionarioPorEmail(db, 1, 301, 'sem-match@ex.com');

    expect(resultado).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('não vincula quando o e-mail é vazio', async () => {
    const { db, updates } = createMockDb({ usuarioId: 1 });

    const resultado = await vincularUsuarioAoFuncionarioPorEmail(db, 1, 301, '   ');

    expect(resultado).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it('vincula funcionário existente ao usuário recém-criado por e-mail', async () => {
    const { db, updates } = createMockDb({ funcionarioId: 302 });

    const resultado = await vincularFuncionarioAoUsuarioPorEmail(
      db,
      1,
      69,
      'elzo@exemplo.com',
    );

    expect(resultado).toEqual({ usuario_id: 69, funcionario_id: 302 });
    expect(updates).toHaveLength(1);
    expect(updates[0].args).toEqual([302, 69]);
  });

  it('não vincula usuário quando não há funcionário com o mesmo e-mail', async () => {
    const { db, updates } = createMockDb({ funcionarioId: null });

    const resultado = await vincularFuncionarioAoUsuarioPorEmail(db, 1, 69, 'nao-existe@ex.com');

    expect(resultado).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
