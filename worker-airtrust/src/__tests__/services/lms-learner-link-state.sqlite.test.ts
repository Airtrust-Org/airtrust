/**
 * Indicador de conta vinculada do aluno (aviso a quem matricula).
 * SQLite real, fixture 100% sintética: sem CPF, e-mail ou dados de produção.
 */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLmsFuncionarioId } from '../../services/lms-learner-identity';
import {
  listFuncionariosComContaVinculada,
  withAlunoVinculado,
} from '../../services/lms-learner-link-state';
import { resetSchemaCache } from '../../utils/db-schema';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

type Bindable = string | number | null;

function asD1(sqlite: DatabaseSync, executed: string[] = []): D1Database {
  const statement = (sql: string, values: Bindable[] = []) => ({
    bind: (...next: Bindable[]) => statement(sql, next),
    first: async () => {
      executed.push(sql);
      return sqlite.prepare(sql).get(...values) ?? null;
    },
    all: async () => {
      executed.push(sql);
      return { results: sqlite.prepare(sql).all(...values) };
    },
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}

const EMPRESA = 6;
const OUTRA_EMPRESA = 7;

// Funcionários: 1 com conta ok | 2 sem usuário | 3 usuário removido | 4 usuário inativo
// 5 funcionário inativo | 6 usuário sem vínculo na empresa | 7 vínculo só em outra empresa
// 8 funcionário de outra empresa | 9 funcionário removido | 10 vínculo com papel vazio
function seed(sqlite: DatabaseSync, usuariosAtivoColumn: 'active' | 'ativo' | null = 'ativo') {
  const activeColumn = usuariosAtivoColumn ? `, ${usuariosAtivoColumn} INTEGER DEFAULT 1` : '';
  sqlite.exec(`
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, nome TEXT,
      ativo INTEGER DEFAULT 1, status TEXT, deleted_at TEXT
    );
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT${activeColumn}
    );
    CREATE TABLE usuarios_empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL, role TEXT DEFAULT 'viewer', UNIQUE(usuario_id, empresa_id)
    );
    INSERT INTO funcionarios (id, empresa_id, nome, ativo, status, deleted_at) VALUES
      (1, ${EMPRESA}, 'Func 1', 1, 'ATIVO', NULL),
      (2, ${EMPRESA}, 'Func 2', 1, 'ATIVO', NULL),
      (3, ${EMPRESA}, 'Func 3', 1, 'ATIVO', NULL),
      (4, ${EMPRESA}, 'Func 4', 1, 'ATIVO', NULL),
      (5, ${EMPRESA}, 'Func 5', 0, 'INATIVO', NULL),
      (6, ${EMPRESA}, 'Func 6', 1, 'ATIVO', NULL),
      (7, ${EMPRESA}, 'Func 7', 1, 'ATIVO', NULL),
      (8, ${OUTRA_EMPRESA}, 'Func 8', 1, 'ATIVO', NULL),
      (9, ${EMPRESA}, 'Func 9', 1, 'ATIVO', '2026-01-01'),
      (10, ${EMPRESA}, 'Func 10', 1, 'ATIVO', NULL);
    INSERT INTO usuarios (id, funcionario_id, deleted_at) VALUES
      (101, 1, NULL), (103, 3, '2026-01-01'), (104, 4, NULL), (105, 5, NULL),
      (106, 6, NULL), (107, 7, NULL), (108, 8, NULL), (109, 9, NULL), (110, 10, NULL);
    INSERT INTO usuarios_empresas (usuario_id, empresa_id, role) VALUES
      (101, ${EMPRESA}, 'viewer'), (103, ${EMPRESA}, 'viewer'), (104, ${EMPRESA}, 'viewer'),
      (105, ${EMPRESA}, 'viewer'), (107, ${OUTRA_EMPRESA}, 'viewer'),
      (108, ${OUTRA_EMPRESA}, 'viewer'), (109, ${EMPRESA}, 'viewer'), (110, ${EMPRESA}, '');
  `);
  if (usuariosAtivoColumn) sqlite.exec(`UPDATE usuarios SET ${usuariosAtivoColumn} = 0 WHERE id = 104`);
}

describe('listFuncionariosComContaVinculada (SQLite real)', () => {
  let sqlite: DatabaseSync;

  beforeEach(() => {
    resetSchemaCache();
    sqlite = new NodeDatabaseSync(':memory:');
  });
  afterEach(() => sqlite.close());

  it('marca vinculado só quando existe conta ativa, não removida, na empresa e com funcionário ativo', async () => {
    seed(sqlite);
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const linked = await listFuncionariosComContaVinculada(asD1(sqlite), EMPRESA, ids);

    expect([...linked]).toEqual([1]);
  });

  it('não vaza vínculo de outro tenant: a mesma consulta para a outra empresa não enxerga o funcionário 1', async () => {
    seed(sqlite);
    const linkedOutra = await listFuncionariosComContaVinculada(asD1(sqlite), OUTRA_EMPRESA, [1, 7, 8]);

    expect([...linkedOutra]).toEqual([8]);
  });

  it('concorda com resolveLmsFuncionarioId (gate real do aluno) para contas com vínculo de empresa', async () => {
    seed(sqlite);
    const db = asD1(sqlite);
    for (const [userId, funcionarioId] of [[101, 1], [103, 3], [105, 5], [109, 9]] as const) {
      const resolved = await resolveLmsFuncionarioId(db, userId, EMPRESA);
      const linked = await listFuncionariosComContaVinculada(db, EMPRESA, [funcionarioId]);
      expect(linked.has(funcionarioId)).toBe(resolved === funcionarioId);
    }
  });

  it('withAlunoVinculado devolve 1/0 e preserva as demais colunas', async () => {
    seed(sqlite);
    const rows = await withAlunoVinculado(asD1(sqlite), EMPRESA, [
      { id: 900, funcionario_id: 1, status: 'NAO_INICIADO' },
      { id: 901, funcionario_id: 2, status: 'EM_ANDAMENTO' },
    ]);

    expect(rows).toEqual([
      { id: 900, funcionario_id: 1, status: 'NAO_INICIADO', aluno_vinculado: 1 },
      { id: 901, funcionario_id: 2, status: 'EM_ANDAMENTO', aluno_vinculado: 0 },
    ]);
  });

  it('respeita a coluna active quando o schema de usuarios a usa', async () => {
    seed(sqlite, 'active');
    const linked = await listFuncionariosComContaVinculada(asD1(sqlite), EMPRESA, [1, 4]);

    expect([...linked]).toEqual([1]);
  });

  it('funciona sem coluna de ativo em usuarios', async () => {
    seed(sqlite, null);
    const linked = await listFuncionariosComContaVinculada(asD1(sqlite), EMPRESA, [1, 4]);

    expect([...linked].sort()).toEqual([1, 4]);
  });

  it('usa binds, filtra por empresa e divide ids em blocos dentro do limite do D1', async () => {
    seed(sqlite);
    const executed: string[] = [];
    const ids = Array.from({ length: 250 }, (_, index) => index + 1);
    const linked = await listFuncionariosComContaVinculada(asD1(sqlite, executed), EMPRESA, ids);

    expect([...linked]).toEqual([1]);
    const selects = executed.filter((sql) => sql.includes('SELECT DISTINCT f.id'));
    expect(selects.length).toBeGreaterThan(1);
    for (const sql of selects) {
      expect(sql).toContain('f.empresa_id = ?');
      expect(sql).toContain('ue.empresa_id = ?');
      expect(sql).not.toMatch(/f\.id IN \([^?]/);
    }
  });

  it('entrada vazia ou empresa inválida não consulta nem vincula ninguém', async () => {
    seed(sqlite);
    const executed: string[] = [];
    const db = asD1(sqlite, executed);

    expect((await listFuncionariosComContaVinculada(db, EMPRESA, [])).size).toBe(0);
    expect((await listFuncionariosComContaVinculada(db, 'x', [1])).size).toBe(0);
    expect(executed).toHaveLength(0);
  });
});
