import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 101);
    c.set('userRole', 'ADMIN');
    c.set('empresaId', Number(c.env.__mockEmpresaId ?? 6));
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.get('empresaId')) }),
}));

// Exercise the handler's own row-level authorization with an authorized caller.
vi.mock('../../services/operational-domain-access', () => ({
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/simuladores-shared', () => ({ audit: vi.fn() }));

import fichasExtras from '../../routes/simuladores-fichas-extras';

describe('simulator session check-result tenant and session boundaries', () => {
  let db: SqliteD1Database | null = null;

  function setup() {
    db = new SqliteD1Database();
    db.database.exec(`
      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, is_check INTEGER,
        funcionario_id INTEGER, instrutor_id INTEGER, data TEXT, deleted_at TEXT
      );
      CREATE TABLE sessoes_participantes (
        id INTEGER PRIMARY KEY, sessao_id INTEGER NOT NULL,
        funcionario_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY, agendamento_slot_id INTEGER NOT NULL,
        empresa_id INTEGER NOT NULL, colaborador_id_aluno INTEGER, deleted_at TEXT
      );
      CREATE TABLE sessoes_checks (
        id INTEGER PRIMARY KEY, sessao_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE sessoes_checks_resultados (
        id INTEGER PRIMARY KEY, sessao_check_id INTEGER NOT NULL,
        aprovado INTEGER NOT NULL, observacoes TEXT,
        created_at TEXT, updated_at TEXT, deleted_at TEXT
      );
      INSERT INTO simulador_agendamentos (id, empresa_id, is_check)
        VALUES (10, 6, 1), (11, 7, 1), (12, 6, 1);
      INSERT INTO sessoes_participantes (id, sessao_id, funcionario_id)
        VALUES (1, 10, 44), (2, 11, 55), (3, 12, 66);
      INSERT INTO sessoes_checks (id, sessao_id)
        VALUES (101, 10), (102, 10), (201, 11), (301, 12);
    `);
  }

  afterEach(() => {
    db?.close();
    db = null;
  });

  async function save(resultados: unknown[]) {
    return fichasExtras.fetch(
      new Request('http://localhost/sessoes/10/checks/resultados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultados }),
      }),
      { DB: db!.asD1(), __mockEmpresaId: 6 } as unknown as Env,
      {} as ExecutionContext,
    );
  }

  function persisted() {
    return db!.database
      .prepare('SELECT sessao_check_id, aprovado FROM sessoes_checks_resultados ORDER BY sessao_check_id')
      .all();
  }

  it('rejects a check of another tenant even though the requested session is owned', async () => {
    setup();
    const response = await save([{ sessao_check_id: 201, aprovado: true }]);
    expect(response.status).toBe(400);
    expect(persisted()).toEqual([]);
  });

  it('refuses legacy session-wide writes for two distinct participants', async () => {
    setup();
    db!.database.exec("INSERT INTO sessoes_participantes VALUES (4, 10, 99, NULL)");
    const response = await save([{ sessao_check_id: 101, aprovado: true }]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'INDIVIDUAL_CHECK_EVIDENCE_REQUIRED' });
    expect(persisted()).toEqual([]);
  });

  it('refuses legacy writes even if an additional participant was removed', async () => {
    setup();
    db!.database.exec("INSERT INTO sessoes_participantes VALUES (4, 10, 99, datetime('now'))");
    const response = await save([{ sessao_check_id: 101, aprovado: true }]);
    expect(response.status).toBe(409);
    expect(persisted()).toEqual([]);
  });

  it('refuses legacy writes for an additional employee with only a fiche', async () => {
    setup();
    db!.database.exec("INSERT INTO fichas_sessao VALUES (77, 10, 6, 99, NULL)");
    const response = await save([{ sessao_check_id: 101, aprovado: true }]);
    expect(response.status).toBe(409);
    expect(persisted()).toEqual([]);
  });

  it('rejects checks from a different session within the same tenant', async () => {
    setup();
    const response = await save([{ sessao_check_id: 301, aprovado: true }]);
    expect(response.status).toBe(400);
    expect(persisted()).toEqual([]);
  });

  it('validates the whole batch before writing a valid preceding check', async () => {
    setup();
    const response = await save([
      { sessao_check_id: 101, aprovado: true },
      { sessao_check_id: 201, aprovado: true },
    ]);
    expect(response.status).toBe(400);
    expect(persisted()).toEqual([]);
  });

  it('persists only scoped explicit approval and updates its existing result', async () => {
    setup();
    expect((await save([{ sessao_check_id: 101, aprovado: true }])).status).toBe(200);
    expect(persisted()).toEqual([{ sessao_check_id: 101, aprovado: 1 }]);

    expect((await save([{ sessao_check_id: 101, aprovado: false }])).status).toBe(200);
    expect(persisted()).toEqual([{ sessao_check_id: 101, aprovado: 0 }]);
  });

  it('rejects duplicate IDs and malformed results without partial writes', async () => {
    setup();
    expect((await save([
      { sessao_check_id: 101, aprovado: true },
      { sessao_check_id: 101, aprovado: false },
    ])).status).toBe(400);
    expect((await save([{ sessao_check_id: 102, aprovado: 'yes' }])).status).toBe(400);
    expect(persisted()).toEqual([]);
  });
});
