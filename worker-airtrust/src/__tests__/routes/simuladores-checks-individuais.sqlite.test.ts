import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.env.__userId ?? 91));
    c.set('userRole', 'INSTRUTOR');
    c.set('empresaId', Number(c.env.__empresaId ?? 1));
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({ empresaId: Number(c.get('empresaId')) }),
}));
vi.mock('../../services/operational-domain-access', () => ({
  requireOperationalAccess: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import checks from '../../routes/simuladores-checks-individuais';

const migration = readFileSync(
  resolve(process.cwd(), 'schema-v2/changes/0554_simulator_individual_check_evidence.sql'),
  'utf8',
);
describe('individual simulator checks — A approved, B rejected, C pending', () => {
  let db: SqliteD1Database | null = null;

  function setup(withSchema = true) {
    db = new SqliteD1Database();
    db.database.exec(`
      ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER DEFAULT 1;
      CREATE TABLE usuarios (id INTEGER PRIMARY KEY, funcionario_id INTEGER, deleted_at TEXT);
      CREATE TABLE simulador_agendamentos (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
        examinador_id INTEGER, funcionario_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE fichas_sessao (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, agendamento_slot_id INTEGER NOT NULL,
        colaborador_id_aluno INTEGER NOT NULL, instrutor_id INTEGER,
        aprovado INTEGER, status TEXT, assinatura_aluno_timestamp TEXT,
        assinatura_instrutor_timestamp TEXT, deleted_at TEXT
      );
      CREATE TABLE sessoes_checks (
        id INTEGER PRIMARY KEY, sessao_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER, deleted_at TEXT
      );
      CREATE TABLE auditoria_avancada_v2 (
        id INTEGER PRIMARY KEY, tabela TEXT, acao TEXT, registro_id TEXT,
        dados_anteriores TEXT, dados_novos TEXT
      );
      ALTER TABLE simulador_agendamentos ADD COLUMN data TEXT;
      ALTER TABLE fichas_sessao ADD COLUMN data_sessao TEXT;
      UPDATE qualificacoes_tipos SET validade=12 WHERE id=101;
      INSERT INTO funcionarios (id,empresa_id,setor_id,nome)
        VALUES (1100,1,11,'Instrutor'),(1200,1,11,'Examinador');
      INSERT INTO usuarios VALUES
        (91,1100,NULL),(92,1200,NULL),(93,1002,NULL),(94,2000,NULL);
      INSERT INTO simulador_agendamentos VALUES (10,1,1200,NULL,NULL);
      INSERT INTO sessoes_checks VALUES (11,10,101,NULL);
      INSERT INTO fichas_sessao VALUES
        (111,1,10,1002,1100,1,'APROVADO','2026-10-17','2026-10-17',NULL),
        (112,1,10,1000,1100,0,'NAO_APROVADO','2026-10-17','2026-10-17',NULL),
        (113,1,10,1001,1100,NULL,'AGUARDANDO_ASSINATURA_INSTRUTOR','2026-10-17',NULL,NULL);
    `);
    db.database.exec("UPDATE fichas_sessao SET data_sessao='2026-10-17' WHERE empresa_id=1");
    if (withSchema) db.database.exec(migration);
  }
  afterEach(() => { db?.close(); db = null; });

  function request(id: number, body?: Record<string, unknown>, userId = 91, empresaId = 1) {
    return checks.fetch(
      new Request(`http://localhost/fichas/${id}/checks-individuais`, body === undefined
        ? {} : { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(body) }),
      { DB:db!.asD1(), __userId:userId, __empresaId:empresaId } as unknown as Env,
      {} as ExecutionContext,
    );
  }
  const result = (approved: boolean, check = 11) => ({ sessao_check_id:check, aprovado:approved, observacoes:'Resultado assinado' });
  const evidence = () => db!.database.prepare(
    'SELECT funcionario_id, aprovado, estado FROM sessoes_checks_resultados_individuais ORDER BY funcionario_id',
  ).all();

  it('persists A=approved, B=rejected and keeps C without any result', async () => {
    setup();
    expect((await request(111, result(true))).status).toBe(201);
    expect((await request(112, result(false), 92)).status).toBe(201);
    expect((await request(113, result(true))).status).toBe(409);
    expect(evidence()).toEqual([
      { funcionario_id:1000, aprovado:0, estado:'CONFIRMADO' },
      { funcionario_id:1002, aprovado:1, estado:'CONFIRMADO' },
    ]);
    const a = await (await request(111)).json() as any;
    const b = await (await request(112)).json() as any;
    const c = await (await request(113)).json() as any;
    expect(a.data[0]).toMatchObject({
      situacao:'APROVADO', aprovado_comprovado:true, data_conclusao:'2026-10-17',
      data_vencimento:'2027-10-17',
    });
    expect(b.data[0]).toMatchObject({ situacao:'REPROVADO', aprovado_comprovado:false });
    expect(c.data[0]).toMatchObject({ situacao:'PENDENTE_AVALIACAO', aprovado_comprovado:false });
  });

  it('rejects unauthorized employee, including a cross-tenant actor', async () => {
    setup();
    expect((await request(111, result(true), 94)).status).toBe(403);
    expect((await request(111, result(true), 93)).status).toBe(403);
    expect(evidence()).toEqual([]);
  });

  it('rejects nonexistent or foreign check IDs without any write', async () => {
    setup();
    expect((await request(111, result(true, 999))).status).toBe(404);
    expect(evidence()).toEqual([]);
  });

  it('is idempotent but cannot rewrite signed proof or duplicate audit events', async () => {
    setup();
    expect((await request(111, result(true))).status).toBe(201);
    expect((await request(111, result(true))).status).toBe(200);
    expect((await request(111, result(false))).status).toBe(409);
    expect(db!.database.prepare('SELECT COUNT(*) AS total FROM auditoria_avancada_v2').get())
      .toEqual({ total:1 });
    expect(evidence()).toHaveLength(1);
  });

  it('rolls back confirmed proof if the audit write fails', async () => {
    setup();
    db!.database.exec('DROP TABLE auditoria_avancada_v2');
    expect((await request(111, result(true))).status).toBe(409);
    expect(evidence()).toEqual([]);
  });

  it('requires Schema V2 0554 and never creates runtime tables implicitly', async () => {
    setup(false);
    const response = await request(111, result(true));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code:'SCHEMA_0554_PENDING' });
    expect((await request(111)).status).toBe(503);
  });

  it('does not allow revising evidence that belongs to another employee', async () => {
    setup();
    expect((await request(111, result(true))).status).toBe(201);
    const id = db!.database.prepare('SELECT id FROM sessoes_checks_resultados_individuais').get() as {id:number};
    const payload = { ...result(false), revisao_de_id:id.id };
    expect((await request(112, payload)).status).toBe(409);
    expect(evidence()).toHaveLength(1);
  });
});
