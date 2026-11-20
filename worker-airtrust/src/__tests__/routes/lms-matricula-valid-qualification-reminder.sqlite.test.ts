/** Real SQLite regression for reminders: a stale LMS enrollment does not revoke a valid qualification. */
import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { loadAlertableEnrollments } from '../../routes/lms-matriculas-convites';

const Sqlite = createRequire(import.meta.url)('node:sqlite').DatabaseSync as { new (path: string): DatabaseSync };
function dbAdapter(sqlite: DatabaseSync): D1Database {
  const statement = (sql: string, bindings: (number | string)[] = []) => ({
    bind: (...next: (number | string)[]) => statement(sql, next),
    all: async () => ({ results: sqlite.prepare(sql).all(...bindings) }),
    first: async () => sqlite.prepare(sql).get(...bindings) ?? null,
  });
  return { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
}
function seed(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE empresas_config(empresa_id INTEGER, dias_alerta_vencimento INTEGER);
    INSERT INTO empresas_config VALUES(6,30);
    CREATE TABLE funcionarios(id INTEGER, empresa_id INTEGER, nome TEXT, email TEXT, telefone TEXT, ativo INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE lms_cursos(id INTEGER, empresa_id INTEGER, titulo TEXT, categoria TEXT, qualificacao_tipo_id INTEGER, deleted_at TEXT);
    CREATE TABLE lms_matriculas(id INTEGER, empresa_id INTEGER, funcionario_id INTEGER, curso_id INTEGER, data_expiracao TEXT, status TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos(id INTEGER, empresa_id INTEGER, codigo TEXT, nome TEXT, validade INTEGER, categoria TEXT, deleted_at TEXT);
    CREATE TABLE qualificacoes_historico(id INTEGER, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER, data_conclusao TEXT, data_vencimento TEXT, validade_meses INTEGER, status TEXT, renovacao_de INTEGER, deleted_at TEXT);
    INSERT INTO funcionarios VALUES(66,6,'Aluno sintético',null,null,1,'ATIVO',null), (67,7,'Outro tenant',null,null,1,'ATIVO',null);
    INSERT INTO qualificacoes_tipos VALUES(180,6,'STOP_WORK','Stop Work',24,'EAD',null),(181,6,'ANOTHER','Outro',24,'EAD',null),(180,7,'STOP_WORK','Stop Work outro tenant',24,'EAD',null);
    INSERT INTO lms_cursos VALUES(59,6,'Stop Work','EAD',180,null);
    INSERT INTO lms_matriculas VALUES(1332,6,66,59,null,'NAO_INICIADO',null);
    INSERT INTO qualificacoes_historico VALUES(7524,6,66,180,'2026-07-29',null,null,'CONCLUIDA',null,null);
  `);
}
const access = { mode: 'all' as const, setorIds: [] as [], funcionarioId: null };

describe('LMS lembrete vs qualificação válida', () => {
  it('não cobra matrícula duplicada quando o histórico de 24 meses está vigente, mesmo sem data_vencimento persistida', async () => {
    const db = new Sqlite(':memory:');
    try { seed(db); const result = await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true); expect(result.results).toHaveLength(0); }
    finally { db.close(); }
  });
  it('permite lembrete quando histórico venceu, é cancelado, é de outro tipo ou de outra empresa', async () => {
    for (const change of [
      "UPDATE qualificacoes_historico SET data_conclusao='2021-07-29' WHERE id=7524",
      "UPDATE qualificacoes_historico SET status='CANCELADO' WHERE id=7524",
      'UPDATE qualificacoes_historico SET qualificacao_id=181 WHERE id=7524',
      'UPDATE qualificacoes_historico SET empresa_id=7 WHERE id=7524',
      "UPDATE qualificacoes_historico SET deleted_at='2026-01-01' WHERE id=7524",
    ]) {
      const db = new Sqlite(':memory:');
      try { seed(db); db.exec(change); const result = await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true); expect(result.results.map(row=>row.id)).toEqual([1332]); }
      finally { db.close(); }
    }
  });
  it('preserva lembretes de renovação quando certificado vence em até 30 dias', async () => {
    const db = new Sqlite(':memory:');
    try {
      seed(db);
      db.exec("UPDATE qualificacoes_historico SET data_vencimento=date('now','+15 days') WHERE id=7524");
      const result = await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true);
      expect(result.results.map(row=>row.id)).toEqual([1332]);
    } finally { db.close(); }
  });
  it('respeita janela de alerta configurada por empresa', async () => {
    const db = new Sqlite(':memory:');
    try {
      seed(db);
      db.exec("UPDATE qualificacoes_historico SET data_vencimento=date('now','+45 days') WHERE id=7524");
      expect((await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true)).results).toHaveLength(0);
      db.exec('UPDATE empresas_config SET dias_alerta_vencimento=60 WHERE empresa_id=6');
      expect((await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true)).results).toHaveLength(1);
    } finally { db.close(); }
  });
  it('não alerta matrícula cancelada ou excluída; convite inicial conserva política anterior', async () => {
    const db = new Sqlite(':memory:');
    try {
      seed(db);
      expect((await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,false)).results).toHaveLength(1);
      db.exec("UPDATE lms_matriculas SET status='CANCELADO' WHERE id=1332");
      expect((await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true)).results).toHaveLength(0);
      db.exec("UPDATE lms_matriculas SET status='NAO_INICIADO',deleted_at='2026-11-04' WHERE id=1332");
      expect((await loadAlertableEnrollments(dbAdapter(db),6,[1332],access,true)).results).toHaveLength(0);
    } finally { db.close(); }
  });
});
