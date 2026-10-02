import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const migrationPath = 'worker-airtrust/migrations/0526_training_compliance_matrix_alignment.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0526_training_compliance_matrix_alignment.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-matrix-alignment-0526.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-matrix-alignment-0526.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-alignment-0526-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, nome TEXT,
      ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, descricao TEXT, categoria TEXT,
      carga_horaria_inicial REAL, carga_horaria_recorrente REAL, validade INTEGER,
      observacoes TEXT, ativo INTEGER DEFAULT 1, empresa_id INTEGER NOT NULL,
      created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    CREATE TABLE compliance_condicoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      nome TEXT NOT NULL, tipo TEXT NOT NULL, descricao TEXT, referencia_normativa TEXT,
      ativo INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_condicoes_active
      ON compliance_condicoes(empresa_id,codigo COLLATE NOCASE)
      WHERE ativo=1 AND deleted_at IS NULL;
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL, escopo TEXT NOT NULL,
      funcao_id INTEGER, condicao_id INTEGER, obrigatoriedade TEXT NOT NULL,
      critico_operacional INTEGER DEFAULT 0, origem TEXT, referencia_normativa TEXT,
      justificativa TEXT, modalidade_requerida TEXT, fundamento_tipo TEXT,
      fundamento_documento TEXT, validade_fonte TEXT DEFAULT 'EVIDENCIA',
      auto_matricular_ead INTEGER DEFAULT 0, observacoes TEXT,
      ativo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), deleted_at TEXT
    );
    CREATE UNIQUE INDEX idx_req_active
      ON treinamento_requisitos(
        empresa_id,qualificacao_tipo_id,escopo,COALESCE(funcao_id,0),COALESCE(condicao_id,0)
      ) WHERE ativo=1 AND deleted_at IS NULL;

    INSERT INTO empresas VALUES (6),(7);
    INSERT INTO funcoes VALUES
      (1,6,'CMD','Comandante',1,NULL),
      (2,6,'COP','Copiloto',1,NULL),
      (3,6,'MEC','Mecânico',1,NULL),
      (4,6,'AUXM','Aux Manutenção',1,NULL),
      (5,6,'AUXS','Aux Suprimentos',1,NULL),
      (6,6,'SUPS','Supervisor Suprimentos',1,NULL),
      (7,6,'RMP','Agente Rampa',1,NULL),
      (8,6,'CV','Coordenador Voo',1,NULL),
      (70,7,'EXT','Mecânico',1,NULL);

    INSERT INTO qualificacoes_tipos
      (id,codigo,nome,descricao,categoria,carga_horaria_inicial,carga_horaria_recorrente,validade,observacoes,ativo,empresa_id,deleted_at)
    VALUES
      (10,'D2','SGSO',NULL,'Teórico',NULL,NULL,24,NULL,1,6,NULL),
      (11,'PRE','PRE',NULL,'Teórico',NULL,NULL,24,NULL,1,6,NULL),
      (12,'LOFT','LOFT',NULL,'Treinamento',NULL,NULL,12,NULL,0,6,'2026-09-30'),
      (13,'MNT_AW139','AW139',NULL,'Manutenção',NULL,NULL,36,NULL,1,6,NULL),
      (14,'MNT_S76AC','S76 A/C',NULL,'Manutenção',NULL,NULL,36,NULL,1,6,NULL),
      (15,'MNT_OTHER','Treinamento local não controlado',NULL,'Manutenção',NULL,NULL,24,NULL,1,6,NULL),
      (16,'NR-11','NR-11',NULL,'Treinamento',NULL,NULL,NULL,NULL,1,6,NULL),
      (17,'NR-20','NR-20',NULL,'Treinamento',8,8,12,NULL,1,6,NULL),
      (18,'NR-26','NR-26',NULL,'Treinamento',NULL,NULL,NULL,NULL,1,6,NULL),
      (19,'NR-35','NR-35',NULL,'Treinamento',4,NULL,12,NULL,1,6,NULL),
      (20,'AVSEC_CONSC','Conscientização AVSEC',NULL,'Teórico',NULL,NULL,NULL,NULL,1,6,NULL),
      (21,'FDM-EAD','FDM',NULL,'Teórico',NULL,NULL,NULL,NULL,1,6,NULL),
      (22,'PPSP','PPSP',NULL,'Teórico',NULL,NULL,NULL,NULL,1,6,NULL),
      (70,'MNT_AW139','Outro tenant',NULL,'Manutenção',NULL,NULL,36,NULL,1,7,NULL);

    INSERT INTO treinamento_requisitos
      (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,ativo)
    VALUES
      (6,13,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,15,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,16,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,17,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,18,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,19,'EMPRESA','OBRIGATORIA','EMPRESA',1),
      (6,20,'EMPRESA','OBRIGATORIA','REGULATORIO',1),
      (6,21,'EMPRESA','OBRIGATORIA','SGSO',1),
      (6,22,'EMPRESA','OBRIGATORIA','SGSO',1),
      (7,70,'EMPRESA','OBRIGATORIA','EMPRESA',1);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  return db;
}

describe('0526 training compliance matrix alignment', () => {
  it('pins the reviewed Schema V2 hashes and mirrors the migration', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-matrix-alignment-0526',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      planPath,
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('applies only the reviewed tenant-6 alignment and keeps the effective rule set stable', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);

    expect(querySql<{ validade:number; inicial:number; recorrente:number }>(db,
      `SELECT validade,carga_horaria_inicial inicial,carga_horaria_recorrente recorrente FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D2';`)[0])
      .toEqual({ validade:36, inicial:8, recorrente:4 });
    expect(querySql<{ validade:number }>(db,
      `SELECT validade FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='PRE';`)[0].validade).toBe(12);

    const loft = querySql<{ ativo:number; deleted_at:string|null; validade:number }>(db,
      `SELECT ativo,deleted_at,validade FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='LOFT';`)[0];
    expect(loft).toEqual({ ativo:1, deleted_at:null, validade:12 });
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=12 AND escopo='FUNCAO' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(2);

    for (const id of [13,14]) {
      expect(querySql<{ validade:number }>(db,
        `SELECT validade FROM qualificacoes_tipos WHERE id=${id};`)[0].validade).toBe(24);
    }
    expect(querySql<{ origem:string; fundamento_tipo:string }>(db,
      `SELECT origem,fundamento_tipo FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=13 AND ativo=1 AND deleted_at IS NULL;`)[0])
      .toEqual({ origem:'CLIENTE', fundamento_tipo:'CONTRATUAL_CLIENTE' });
    expect(querySql<{ validade:number }>(db,
      `SELECT validade FROM qualificacoes_tipos WHERE id=15;`)[0].validade).toBe(24);
    expect(querySql<{ origem:string }>(db,
      `SELECT origem FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=15 AND ativo=1 AND deleted_at IS NULL;`)[0].origem).toBe('EMPRESA');

    const nr20 = querySql<{ validade:number; inicial:number; recorrente:number }>(db,
      `SELECT validade,carga_horaria_inicial inicial,carga_horaria_recorrente recorrente FROM qualificacoes_tipos WHERE id=17;`)[0];
    expect(nr20).toEqual({ validade:24, inicial:16, recorrente:4 });
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=17 AND escopo='FUNCAO' AND modalidade_requerida='HIBRIDO' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(4);
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=16 AND escopo='FUNCAO' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(2);
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=19 AND escopo='FUNCAO' AND modalidade_requerida='PRESENCIAL' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(2);
    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=18 AND escopo='FUNCAO' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(8);

    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=20 AND escopo='EMPRESA' AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(1);
    expect(querySql<{ fundamento_tipo:string }>(db,
      `SELECT fundamento_tipo FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=20 AND ativo=1 AND deleted_at IS NULL;`)[0].fundamento_tipo).toBe('POLITICA_INTERNA');

    expect(querySql<{ total:number }>(db,
      `SELECT COUNT(*) total FROM compliance_condicoes WHERE empresa_id=6 AND codigo IN ('FDM_ADMIN','FDM_COMITE','LOSA_ANALISTA','EDB_LOGBOOK_USUARIO','GESTAO_MUDANCAS_PARTICIPANTE') AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(5);

    expect(querySql<{ validade:number }>(db,
      `SELECT validade FROM qualificacoes_tipos WHERE empresa_id=7 AND codigo='MNT_AW139';`)[0].validade).toBe(36);
    expect(querySql<{ origem:string }>(db,
      `SELECT origem FROM treinamento_requisitos WHERE empresa_id=7 AND qualificacao_tipo_id=70;`)[0].origem).toBe('EMPRESA');
  });

  it('contains no writes to history, certificates, completions or LMS enrollments', () => {
    const normalized = migration.toLowerCase();
    for (const forbidden of [
      'insert into lms_matriculas',
      'update lms_matriculas',
      'delete from lms_matriculas',
      'insert into qualificacoes_historico',
      'update qualificacoes_historico',
      'delete from qualificacoes_historico',
      'insert into certificados',
      'delete from certificados',
    ]) expect(normalized).not.toContain(forbidden);
  });
});
