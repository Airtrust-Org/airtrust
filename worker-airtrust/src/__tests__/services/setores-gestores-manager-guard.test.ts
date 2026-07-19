/**
 * Cobertura da correção de RBAC setorial para gestores:
 * - gestor exige ao menos um setor válido, da mesma empresa e ativo
 * - inserts de setor pulam vínculos já ativos (idempotência de sync)
 * - remoção do último setor ativo de um gestor ativo é bloqueada
 */

import { describe, expect, it } from 'vitest';
import {
  assertSetoresValidosParaEmpresa,
  buildManagerSetorInsertStatements,
  deleteSetorGestor,
  isManagerPerfil,
  SetorGestorConflictError,
  SetorGestorValidationError,
  updateSetorGestor,
} from '../../services/setores-gestores';

type MockResponse = {
  match: string | RegExp;
  first?: unknown;
  all?: unknown[];
  run?: unknown;
};

function createDb(responses: MockResponse[]) {
  const calls: Array<{ sql: string; bindings: unknown[] }> = [];

  function resolve(sql: string) {
    return responses.find((r) =>
      typeof r.match === 'string' ? sql.includes(r.match) : r.match.test(sql),
    );
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...bindings: unknown[]) {
          calls.push({ sql, bindings });
          return {
            all: async () => ({ results: resolve(sql)?.all ?? [] }),
            first: async () => resolve(sql)?.first ?? null,
            run: async () => resolve(sql)?.run ?? { meta: { last_row_id: 1 } },
          };
        },
      };
    },
    batch: async (stmts: unknown[]) => stmts,
  };

  return { db: db as unknown as D1Database, calls };
}

describe('isManagerPerfil', () => {
  it('reconhece variações de perfil gestor', () => {
    expect(isManagerPerfil('GESTOR')).toBe(true);
    expect(isManagerPerfil('manager')).toBe(true);
    expect(isManagerPerfil('coordenador')).toBe(true);
    expect(isManagerPerfil('ALUNO')).toBe(false);
    expect(isManagerPerfil(undefined)).toBe(false);
  });
});

describe('assertSetoresValidosParaEmpresa', () => {
  it('rejeita lista vazia (gestor sem setor é o bug raiz desta missão)', async () => {
    const { db } = createDb([]);
    await expect(assertSetoresValidosParaEmpresa(db, 6, [])).rejects.toBeInstanceOf(
      SetorGestorValidationError,
    );
    await expect(assertSetoresValidosParaEmpresa(db, 6, undefined)).rejects.toBeInstanceOf(
      SetorGestorValidationError,
    );
  });

  it('rejeita setor de outra empresa ou inativo', async () => {
    const { db } = createDb([
      { match: 'FROM setores WHERE id IN', all: [{ id: 10 }] }, // apenas o 10 é válido
    ]);
    await expect(assertSetoresValidosParaEmpresa(db, 6, [10, 999])).rejects.toBeInstanceOf(
      SetorGestorValidationError,
    );
  });

  it('aceita setores válidos e ativos da empresa', async () => {
    const { db } = createDb([
      { match: 'FROM setores WHERE id IN', all: [{ id: 10 }, { id: 11 }] },
    ]);
    const result = await assertSetoresValidosParaEmpresa(db, 6, [10, 11, 10]);
    expect(result.sort()).toEqual([10, 11]);
  });
});

describe('buildManagerSetorInsertStatements', () => {
  it('gera INSERT apenas para setores ainda não vinculados ativamente', async () => {
    const { db, calls } = createDb([
      { match: 'FROM setores WHERE id IN', all: [{ id: 10 }, { id: 11 }] },
      { match: 'FROM setores_gestores', all: [{ setor_id: 10 }] }, // já vinculado ao 10
    ]);

    const statements = await buildManagerSetorInsertStatements(db, 6, 63, [10, 11]);
    expect(statements).toHaveLength(1);

    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO setores_gestores'));
    expect(insertCall?.bindings).toEqual([11, 63, 6]);
  });

  it('propaga a validação de setor obrigatório (fail-closed)', async () => {
    const { db } = createDb([]);
    await expect(buildManagerSetorInsertStatements(db, 6, 63, [])).rejects.toBeInstanceOf(
      SetorGestorValidationError,
    );
  });
});

describe('bloqueio de remoção do último setor de um gestor ativo', () => {
  const currentRow = {
    match: /^\s*SELECT[\s\S]*FROM setores_gestores sg/,
    first: {
      id: 7,
      setor_id: 10,
      usuario_id: 63,
      gestor_id: null,
      empresa_id: 6,
      role: 'manager',
      ativo: 1,
    },
  };

  it('deleteSetorGestor rejeita quando é o último setor ativo de um gestor ativo', async () => {
    const { db } = createDb([
      currentRow,
      { match: 'SELECT active, perfil FROM usuarios', first: { active: 1, perfil: 'GESTOR' } },
      { match: 'SELECT COUNT(*) as n FROM setores_gestores', first: { n: 0 } },
    ]);

    await expect(deleteSetorGestor(db, 6, 7)).rejects.toBeInstanceOf(SetorGestorConflictError);
  });

  it('deleteSetorGestor permite quando o gestor ainda tem outro setor ativo', async () => {
    const { db } = createDb([
      currentRow,
      { match: 'SELECT active, perfil FROM usuarios', first: { active: 1, perfil: 'GESTOR' } },
      { match: 'SELECT COUNT(*) as n FROM setores_gestores', first: { n: 1 } },
      { match: 'UPDATE setores_gestores', run: { success: true } },
    ]);

    await expect(deleteSetorGestor(db, 6, 7)).resolves.toBe(true);
  });

  it('deleteSetorGestor permite remover quando o usuário não é mais gestor ativo', async () => {
    const { db } = createDb([
      currentRow,
      { match: 'SELECT active, perfil FROM usuarios', first: { active: 0, perfil: 'GESTOR' } },
      { match: 'UPDATE setores_gestores', run: { success: true } },
    ]);

    await expect(deleteSetorGestor(db, 6, 7)).resolves.toBe(true);
  });

  it('updateSetorGestor rejeita ativo=false quando é o último setor de gestor ativo', async () => {
    const { db } = createDb([
      currentRow,
      { match: 'SELECT active, perfil FROM usuarios', first: { active: 1, perfil: 'GESTOR' } },
      { match: 'SELECT COUNT(*) as n FROM setores_gestores', first: { n: 0 } },
    ]);

    await expect(updateSetorGestor(db, 6, 7, { ativo: false })).rejects.toBeInstanceOf(
      SetorGestorConflictError,
    );
  });
});
