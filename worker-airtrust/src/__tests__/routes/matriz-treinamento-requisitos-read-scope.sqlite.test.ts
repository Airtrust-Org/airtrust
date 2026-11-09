/**
 * P07-03: GET /matriz-treinamento/requisitos/:funcionario_id so exigia login e
 * tenant, entao qualquer usuario lia os requisitos/status de qualquer colega.
 * Mesma politica do P07-02. SQLite real (node:sqlite).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: () => async (c: any, next: () => Promise<void>) => {
    const raw = c.req.header('x-test-user');
    const user = raw ? JSON.parse(raw) : {};
    c.set('userId', user.userId ?? 0);
    c.set('userRole', user.role);
    c.set('funcionarioId', user.funcionarioId ?? null);
    c.set('empresaId', 6);
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

import matrizTreinamento from '../../routes/matriz-treinamento';
import { errorHandler } from '../../middleware/error-handler';

describe('P07-03 requisitos da matriz por funcionario', () => {
  let db: SqliteD1Database | null = null;
  afterEach(() => {
    db?.close();
    db = null;
  });

  // Funcionarios empresa 6: 10 aluno A (setor 1), 11 aluno B (setor 1), 12 aluno C (setor 2),
  // 20 instrutor. Empresa 7: 30. Usuarios: 102 gestor do setor 1, 103 gestor sem setor.
  function setup() {
    db = new SqliteD1Database();
    db.database.exec(`
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, funcionario_id INTEGER, email TEXT, deleted_at TEXT);
      INSERT INTO funcionarios (id, empresa_id, nome, setor_id) VALUES
        (10,6,'Aluno A',1),(11,6,'Aluno B',1),(12,6,'Aluno C',2),(20,6,'Instrutor',1),(30,7,'Outro tenant',1);
      INSERT INTO usuarios VALUES (100,10,'a@x',NULL),(102,NULL,'g@x',NULL),(103,NULL,'g2@x',NULL),(105,NULL,'adm@x',NULL),(106,NULL,'sv@x',NULL);
      INSERT INTO setores (id, empresa_id) VALUES (1,6),(2,6);
      INSERT INTO setores_gestores (empresa_id, setor_id, usuario_id) VALUES (6,1,102);
    `);
  }

  async function get(funcionarioId: number, user: Record<string, unknown>) {
    const { Hono } = await import('hono');
    const app = new Hono<{ Bindings: Env }>();
    app.onError(errorHandler);
    app.route('/', matrizTreinamento);
    return app.request(
      `/requisitos/${funcionarioId}`,
      { headers: { 'x-test-user': JSON.stringify(user) } },
      { DB: db!.asD1() } as unknown as Env,
    );
  }

  const aluno = (funcionarioId: number | null) => ({ userId: 100, role: 'aluno', funcionarioId });

  it('aluno nao le requisitos de um colega (403) e a negacao nao vaza dados', async () => {
    setup();
    const res = await get(11, aluno(10));
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain('Sem permissão');
    expect(text).not.toContain('Aluno B');
  });

  it('aluno sem vinculo de funcionario nao le ninguem (falha fechada)', async () => {
    setup();
    expect((await get(10, { userId: 106, role: 'aluno', funcionarioId: null })).status).toBe(403);
  });

  it('aluno passa pela guarda no proprio registro', async () => {
    setup();
    expect((await get(10, aluno(10))).status).not.toBe(403);
  });

  it('gestor le funcionarios do proprio setor, nao de outro setor', async () => {
    setup();
    const gestor = { userId: 102, role: 'manager', funcionarioId: null };
    expect((await get(11, gestor)).status).not.toBe(403);
    expect((await get(12, gestor)).status).toBe(403);
  });

  it('gestor sem setor vinculado nao le ninguem', async () => {
    setup();
    expect((await get(11, { userId: 103, role: 'manager', funcionarioId: null })).status).toBe(403);
  });

  it('admin e instrutor leem qualquer funcionario do tenant', async () => {
    setup();
    expect((await get(12, { userId: 105, role: 'admin', funcionarioId: null })).status).not.toBe(403);
    expect((await get(12, { userId: 104, role: 'instructor', funcionarioId: 20 })).status).not.toBe(403);
  });

  it('funcionario de outro tenant continua inalcancavel (404), mesmo para admin', async () => {
    setup();
    expect((await get(30, { userId: 105, role: 'admin', funcionarioId: null })).status).toBe(404);
  });

  it('id invalido e negado em vez de consultar o banco', async () => {
    setup();
    expect((await get(0, { userId: 105, role: 'admin', funcionarioId: null })).status).toBe(403);
  });
});
