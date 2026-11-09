/**
 * P07-02: historico de notas e dashboard de manobras de um funcionario nao podem
 * ser lidos por qualquer usuario autenticado do tenant. SQLite real (node:sqlite).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
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
  getTenantContext: () => ({ empresaId: 6 }),
}));
vi.mock('../../middleware/operational-domain-access', () => ({
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../services/simuladores/shared', () => ({ audit: vi.fn() }));

import fichasExtras from '../../routes/simuladores-fichas-extras';

describe('P07-02 leitura individual de simulador por papel', () => {
  let db: SqliteD1Database | null = null;
  afterEach(() => {
    db?.close();
    db = null;
  });

  // Funcionarios (empresa 6): 10 aluno A (setor 1), 11 aluno B (setor 1),
  // 12 aluno C (setor 2), 20 instrutor. Empresa 7: 30 (outro tenant).
  // Usuarios: 100 aluno A, 101 aluno B, 102 gestor setor 1, 103 gestor sem setor,
  // 104 instrutor, 105 admin, 106 aluno sem vinculo.
  function setup() {
    db = new SqliteD1Database();
    db.database.exec(`
      ALTER TABLE funcionarios ADD COLUMN matricula TEXT;
      ALTER TABLE funcionarios ADD COLUMN codigo_anac TEXT;
      ALTER TABLE funcionarios ADD COLUMN email TEXT;
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, funcionario_id INTEGER, email TEXT, deleted_at TEXT);
      CREATE TABLE historico_notas_manobras (
        id INTEGER PRIMARY KEY, funcionario_id INTEGER, instrutor_id INTEGER,
        codigo_manobra TEXT, nota REAL, data_sessao TEXT, deleted_at TEXT
      );
      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER, colaborador_id_aluno INTEGER,
        data_sessao TEXT, tipo_sessao TEXT, tipo_aeronave TEXT, deleted_at TEXT
      );
      CREATE TABLE fichas_sessao_manobras (
        id INTEGER PRIMARY KEY, ficha_id INTEGER, codigo TEXT, descricao TEXT,
        resultado TEXT, deleted_at TEXT
      );
      CREATE TABLE alertas_reforco (
        id INTEGER PRIMARY KEY, funcionario_id INTEGER, instrutor_id_notificado INTEGER,
        status TEXT, created_at TEXT, deleted_at TEXT
      );
      INSERT INTO funcionarios (id, empresa_id, nome, matricula, codigo_anac, setor_id) VALUES
        (10,6,'Aluno A','M10','A10',1),(11,6,'Aluno B','M11','A11',1),
        (12,6,'Aluno C','M12','A12',2),(20,6,'Instrutor','M20','A20',1),
        (30,7,'Outro tenant','M30','A30',1);
      INSERT INTO usuarios VALUES
        (100,10,'a@x',NULL),(101,11,'b@x',NULL),(102,NULL,'g@x',NULL),(103,NULL,'g2@x',NULL),
        (104,20,'i@x',NULL),(105,NULL,'adm@x',NULL),(106,NULL,'sv@x',NULL);
      INSERT INTO setores (id, empresa_id) VALUES (1,6),(2,6);
      INSERT INTO setores_gestores (empresa_id, setor_id, usuario_id) VALUES (6,1,102);
      INSERT INTO historico_notas_manobras VALUES
        (1,10,20,'MAN1',4.0,'2026-10-01',NULL),(2,11,20,'MAN1',2.0,'2026-10-02',NULL),
        (3,12,20,'MAN1',3.0,'2026-10-03',NULL);
    `);
  }

  async function get(path: string, user: Record<string, unknown>) {
    return fichasExtras.fetch(
      new Request(`http://localhost${path}`, { headers: { 'x-test-user': JSON.stringify(user) } }),
      { DB: db!.asD1() } as unknown as Env,
      {} as ExecutionContext,
    );
  }

  const aluno = (userId: number, funcionarioId: number | null) => ({ userId, role: 'aluno', funcionarioId });

  it('aluno le o proprio historico, mas nao o de um colega', async () => {
    setup();
    const own = await get('/historico-notas/10', aluno(100, 10));
    expect(own.status).toBe(200);
    expect(((await own.json()) as { data: unknown[] }).data).toHaveLength(1);

    const colleague = await get('/historico-notas/11', aluno(100, 10));
    expect(colleague.status).toBe(403);
    expect(await colleague.json()).toMatchObject({ code: 'SIMULADOR_FUNCIONARIO_READ_FORBIDDEN' });
  });

  it('aluno nao le ultima nota nem dashboard de colega; le o proprio dashboard', async () => {
    setup();
    expect((await get('/historico-notas/ultima/11/MAN1', aluno(100, 10))).status).toBe(403);
    expect((await get('/dashboard/11', aluno(100, 10))).status).toBe(403);
    expect((await get('/historico-notas/ultima/10/MAN1', aluno(100, 10))).status).toBe(200);
    expect((await get('/dashboard/10', aluno(100, 10))).status).toBe(200);
  });

  it('usuario sem funcionario vinculado nao le nenhum registro', async () => {
    setup();
    expect((await get('/historico-notas/10', aluno(106, null))).status).toBe(403);
    expect((await get('/dashboard/10', aluno(106, null))).status).toBe(403);
  });

  it('gestor le apenas funcionarios dos seus setores; gestor sem setor nao le nada', async () => {
    setup();
    const gestor = { userId: 102, role: 'gestor', funcionarioId: null };
    expect((await get('/historico-notas/11', gestor)).status).toBe(200);
    expect((await get('/historico-notas/12', gestor)).status).toBe(403);
    expect((await get('/dashboard/12', gestor)).status).toBe(403);

    const semSetor = { userId: 103, role: 'gestor', funcionarioId: null };
    expect((await get('/historico-notas/10', semSetor)).status).toBe(403);
  });

  it('instrutor e admin leem qualquer funcionario do tenant; tenant alheio continua sem dados', async () => {
    setup();
    for (const user of [
      { userId: 104, role: 'instrutor', funcionarioId: 20 },
      { userId: 105, role: 'admin', funcionarioId: null },
    ]) {
      expect((await get('/historico-notas/12', user)).status).toBe(200);
      expect((await get('/dashboard/12', user)).status).toBe(200);
    }
    const otherTenant = await get('/historico-notas/30', { userId: 105, role: 'admin', funcionarioId: null });
    expect(otherTenant.status).toBe(200);
    expect(((await otherTenant.json()) as { data: unknown[] }).data).toEqual([]);
  });

  it('papel ausente ou desconhecido falha fechado', async () => {
    setup();
    // Sem papel conhecido so resta o proprio registro (vinculo do usuario); colega e negado.
    expect((await get('/historico-notas/11', { userId: 100, funcionarioId: null })).status).toBe(403);
    expect((await get('/historico-notas/11', { userId: 100, role: 'qualquer', funcionarioId: null })).status).toBe(403);
    expect((await get('/historico-notas/10', { userId: 100, role: 'qualquer', funcionarioId: null })).status).toBe(200);
  });
});
