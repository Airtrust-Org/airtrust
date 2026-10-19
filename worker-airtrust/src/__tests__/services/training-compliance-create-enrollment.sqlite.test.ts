import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { createComplianceEnrollmentAtomic } from '../../services/training-compliance-create-enrollment';

const databases: SqliteD1Database[] = [];
afterEach(() => databases.splice(0).forEach(db => db.close()));

function setup() {
  const sqlite = new SqliteD1Database(); databases.push(sqlite);
  sqlite.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN status TEXT DEFAULT 'ATIVO';
    ALTER TABLE funcionarios ADD COLUMN ativo INTEGER DEFAULT 1;
    ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
    ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER DEFAULT 1;
    UPDATE qualificacoes_tipos SET categoria='EAD' WHERE id=100;
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
      escopo TEXT, setor_id INTEGER, funcao_id INTEGER, funcionario_id INTEGER,
      obrigatoriedade TEXT, auto_matricular_ead INTEGER, modalidade_requerida TEXT,
      perfil_competencia TEXT, condicao_id INTEGER, aeronave_modelo TEXT,
      vigencia_inicio TEXT, vigencia_fim TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    INSERT INTO treinamento_requisitos
      (id,empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,auto_matricular_ead,modalidade_requerida)
      VALUES (91,1,100,'EMPRESA','OBRIGATORIA',1,'EAD');
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
      ativo INTEGER DEFAULT 1, publicado INTEGER DEFAULT 1, deleted_at TEXT
    );
    INSERT INTO lms_cursos VALUES (56,1,100,1,1,NULL);
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,curso_id INTEGER,
      funcionario_id INTEGER,observacoes TEXT,perfil_competencia TEXT,
      data_matricula TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'NAO_INICIADO',
      deleted_at TEXT,
      UNIQUE(empresa_id,curso_id,funcionario_id)
    );
    CREATE TABLE lms_matricula_ciclos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,empresa_id INTEGER,matricula_id INTEGER,
      curso_id INTEGER,funcionario_id INTEGER,numero_ciclo INTEGER,
      origem TEXT,status TEXT,ciclo_atual INTEGER,observacoes TEXT,
      data_matricula TEXT,progresso_pct INTEGER,tentativas INTEGER
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,action TEXT,entity_type TEXT,
      entity_id INTEGER,old_values TEXT,new_values TEXT,empresa_id INTEGER,created_at TEXT
    );
  `);
  return sqlite;
}
const request = (overrides:Partial<Parameters<typeof createComplianceEnrollmentAtomic>[1]> = {}) => ({
  empresaId:1,funcionarioId:1000,cursoId:56,qualificacaoTipoId:100,regraId:91,
  origin:'CARGO_COMPLIANCE' as const,observacoes:'synthetic test', ...overrides,
});
const count = (sqlite:SqliteD1Database, table:string) =>
  (sqlite.database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number}).n;

describe('Compliance atomic enrollment, policy and tenant guards (SQLite D1)', () => {
  it('creates enrollment, first cycle, profile column and audit in one batch', async () => {
    const db=setup();
    const id=await createComplianceEnrollmentAtomic(db.asD1(),request());
    expect(id).toBeGreaterThan(0);
    expect(count(db,'lms_matriculas')).toBe(1);
    expect(count(db,'lms_matricula_ciclos')).toBe(1);
    expect(count(db,'audit_logs')).toBe(1);
    expect(db.database.prepare('SELECT matricula_id,ciclo_atual FROM lms_matricula_ciclos').get())
      .toMatchObject({matricula_id:id,ciclo_atual:1});
    expect(db.database.prepare('SELECT entity_id,empresa_id FROM audit_logs').get())
      .toMatchObject({entity_id:id,empresa_id:1});
    expect(await createComplianceEnrollmentAtomic(db.asD1(),request())).toBeNull();
    expect(count(db,'lms_matriculas')).toBe(1);
    expect(count(db,'audit_logs')).toBe(1);
  });

  it.each([
    ["opt-out zero","UPDATE treinamento_requisitos SET auto_matricular_ead=0"],
    ["opt-out NULL","UPDATE treinamento_requisitos SET auto_matricular_ead=NULL"],
    ["modalidade NULL","UPDATE treinamento_requisitos SET modalidade_requerida=NULL"],
    ["presencial","UPDATE treinamento_requisitos SET modalidade_requerida='PRESENCIAL'"],
    ["não obrigatório","UPDATE treinamento_requisitos SET obrigatoriedade='OPCIONAL'"],
    ["expirado","UPDATE treinamento_requisitos SET vigencia_fim='2020-01-01'"],
    ["futuro","UPDATE treinamento_requisitos SET vigencia_inicio='2999-01-01'"],
    ["regra inativa","UPDATE treinamento_requisitos SET ativo=0"],
    ["funcionário inativo","UPDATE funcionarios SET ativo=0 WHERE id=1000"],
    ["funcionário desligado","UPDATE funcionarios SET status='INATIVO' WHERE id=1000"],
    ["curso despublicado","UPDATE lms_cursos SET publicado=0"],
    ["curso inativo","UPDATE lms_cursos SET ativo=0"],
    ["curso apagado","UPDATE lms_cursos SET deleted_at='2026-01-01'"],
    ["modelo não EAD","UPDATE qualificacoes_tipos SET categoria='Presencial' WHERE id=100"],
    ["escopo inadequado","UPDATE treinamento_requisitos SET escopo='FUNCIONARIO',funcionario_id=1001"],
  ])('fails closed when %s changes after planning', async (_name, sql) => {
    const db=setup();
    db.database.exec(sql);
    expect(await createComplianceEnrollmentAtomic(db.asD1(),request())).toBeNull();
    expect(count(db,'lms_matriculas')).toBe(0);
    expect(count(db,'lms_matricula_ciclos')).toBe(0);
    expect(count(db,'audit_logs')).toBe(0);
  });

  it('rejects cross-tenant employee/course/rule even if IDs are known', async () => {
    const db=setup();
    expect(await createComplianceEnrollmentAtomic(db.asD1(),request({funcionarioId:2000}))).toBeNull();
    expect(await createComplianceEnrollmentAtomic(db.asD1(),request({empresaId:2}))).toBeNull();
    expect(await createComplianceEnrollmentAtomic(db.asD1(),request({regraId:999}))).toBeNull();
    expect(count(db,'lms_matriculas')).toBe(0);
  });

  it('rolls back enrollment if cycle insertion fails, without phantom audit', async () => {
    const db=setup();
    db.database.exec(`CREATE TRIGGER deny_cycle BEFORE INSERT ON lms_matricula_ciclos
      BEGIN SELECT RAISE(ABORT,'denied synthetic cycle'); END;`);
    await expect(createComplianceEnrollmentAtomic(db.asD1(),request())).rejects.toThrow('denied synthetic cycle');
    expect(count(db,'lms_matriculas')).toBe(0);
    expect(count(db,'lms_matricula_ciclos')).toBe(0);
    expect(count(db,'audit_logs')).toBe(0);
  });

  it('rolls back enrollment and cycle if audit insertion fails', async () => {
    const db=setup();
    db.database.exec(`CREATE TRIGGER deny_audit BEFORE INSERT ON audit_logs
      BEGIN SELECT RAISE(ABORT,'denied synthetic audit'); END;`);
    await expect(createComplianceEnrollmentAtomic(db.asD1(),request())).rejects.toThrow('denied synthetic audit');
    expect(count(db,'lms_matriculas')).toBe(0);
    expect(count(db,'lms_matricula_ciclos')).toBe(0);
    expect(count(db,'audit_logs')).toBe(0);
  });
});
