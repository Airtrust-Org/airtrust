import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const prereqs = [
  'worker-airtrust/migrations/0491_training_compliance_requirements.sql',
  'worker-airtrust/migrations/0497_training_compliance_aircraft_scope.sql',
  'worker-airtrust/migrations/0517_training_compliance_conditions.sql',
  'worker-airtrust/migrations/0521_training_compliance_designation_overrides.sql',
  'worker-airtrust/migrations/0523_training_compliance_governed_designation_rules.sql',
].map(read);
const migrationPath = 'worker-airtrust/migrations/0524_training_compliance_requirement_sanitization.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0524_training_compliance_requirement_sanitization.sql';
const planPath = 'worker-airtrust/schema-v2/plans/training-compliance-requirement-sanitization-0524.md';
const manifestPath = 'worker-airtrust/schema-v2/training-compliance-requirement-sanitization-0524.json';
const migration = read(migrationPath);
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-sanitize-0524-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  const setup = execSql(db, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_categorias (id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,nome TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_areas (id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,nome TEXT,ativo INTEGER,deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY,codigo TEXT,nome TEXT,descricao TEXT,categoria TEXT,carga_horaria REAL,
      carga_horaria_inicial REAL,carga_horaria_recorrente REAL,conteudo_programatico TEXT,validade INTEGER,
      vencimento_fim_mes INTEGER DEFAULT 0,observacoes TEXT,ativo INTEGER DEFAULT 1,is_check INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,updated_at TEXT,deleted_at TEXT,empresa_id INTEGER NOT NULL,formato_id INTEGER,categoria_id INTEGER,
      classe_requisito TEXT,dominio_codigo TEXT,area_id INTEGER
    );
    CREATE TABLE setores (id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,codigo TEXT,nome TEXT,ativo INTEGER DEFAULT 1,deleted_at TEXT);
    CREATE TABLE funcoes (id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,codigo TEXT,nome TEXT,ativo INTEGER DEFAULT 1,deleted_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,deleted_at TEXT);
    CREATE TABLE matriz_treinamento_funcao (
      id INTEGER PRIMARY KEY,empresa_id INTEGER NOT NULL,funcao_id INTEGER NOT NULL,qualificacao_tipo_id INTEGER NOT NULL,
      obrigatoriedade TEXT NOT NULL,nivel_requerido INTEGER,critico_operacional INTEGER NOT NULL DEFAULT 0,
      origem TEXT NOT NULL,observacoes TEXT,ativo INTEGER NOT NULL DEFAULT 1,created_at TEXT,updated_at TEXT,deleted_at TEXT
    );
    INSERT INTO empresas VALUES (6),(7);
    INSERT INTO qualificacoes_categorias VALUES (13,6,'TERICO','Teórico',1,NULL);
    INSERT INTO qualificacoes_areas VALUES (1,6,'OPERACOES','Operações',1,NULL);
    INSERT INTO setores VALUES (10,6,'TRI','Tripulação',1,NULL),(20,6,'MNT','Manutenção',1,NULL),(70,7,'OUT','Outro',1,NULL);
    INSERT INTO funcoes VALUES
      (1,6,'CMD','Comandante',1,NULL),(2,6,'COP','Copiloto',1,NULL),(3,6,'MEC','Mecânico',1,NULL),
      (4,6,'AUXM','Auxiliar de Manutenção',1,NULL),(5,6,'COORDENG','Coordenador de Engenharia',1,NULL),
      (6,6,'ANCTM','Analista de CTM',1,NULL),(7,6,'AUXCTM','Auxiliar de CTM',1,NULL),(8,6,'GRO','Gerente de Operações',1,NULL),
      (9,6,'ASO','Assistente de Segurança Operacional',1,NULL),(10,6,'AQSMS','Auxiliar de QSMS',1,NULL),
      (11,6,'TST','Técnico de Segurança do Trabalho',1,NULL),(70,7,'EXT','Externo',1,NULL);
    INSERT INTO funcionarios VALUES (1000,6,NULL),(7000,7,NULL);
    INSERT INTO qualificacoes_tipos (id,codigo,nome,ativo,deleted_at,empresa_id,is_check) VALUES
      (187,'CRM_CORP','CRM Corporativo',1,NULL,6,0),(520,'CRM_DIR_RBAC119','CRM Direção',1,NULL,6,0),
      (530,'D3','CRM Tripulação',1,NULL,6,0),(540,'FDM-EAD','FDM',1,NULL,6,0),
      (541,'MNT_AW139','AW139 Manutenção',1,NULL,6,0),(542,'MNT_S76AC','S-76 Manutenção',1,NULL,6,0),
      (543,'OUT_DIDATICA_ENSINO','Didática',1,NULL,6,0),(544,'EN-ASSES','English Assessment',1,'2026-09-30',6,0),
      (545,'D1','AVSEC específico',1,NULL,6,0),(700,'OUT','Outro tenant',1,NULL,7,0);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  for (const sql of prereqs) {
    const applied = execSql(db, sql);
    expect(applied.code, applied.stderr).toBe(0);
  }
  const seed = execSql(db, `
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem)
      VALUES (6,187,'EMPRESA','OBRIGATORIA','EMPRESA');
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,setor_id,obrigatoriedade,origem)
      VALUES (6,187,'SETOR',10,'NAO_APLICA','EMPRESA'),(6,530,'SETOR',10,'OBRIGATORIA','REGULATORIO'),(6,540,'SETOR',10,'OBRIGATORIA','REGULATORIO');
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,origem,observacoes)
      VALUES (6,543,'EMPRESA','NAO_APLICA','EMPRESA','regra-base explícita N/A'),(6,544,'EMPRESA','NAO_APLICA','EMPRESA','ghost'),(7,700,'EMPRESA','NAO_APLICA','EMPRESA','outro tenant');
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcionario_id,obrigatoriedade,origem)
      VALUES (6,543,'FUNCIONARIO',1000,'OBRIGATORIA','EMPRESA');
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,funcao_id,obrigatoriedade,origem)
      VALUES (6,541,'FUNCAO',3,'OBRIGATORIA','EMPRESA'),(6,541,'FUNCAO',4,'OBRIGATORIA','EMPRESA'),
             (6,542,'FUNCAO',3,'OBRIGATORIA','EMPRESA'),(6,542,'FUNCAO',4,'OBRIGATORIA','EMPRESA'),(6,542,'FUNCAO',5,'OBRIGATORIA','EMPRESA');
    INSERT OR IGNORE INTO treinamento_requisitos (empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,origem,fundamento_tipo)
      SELECT 6,540,'EMPRESA',id,'OBRIGATORIA','SGSO','DESIGNACAO' FROM compliance_condicoes WHERE empresa_id=6 AND codigo='FDM_EQUIPE';
  `);
  expect(seed.code, seed.stderr).toBe(0);
  return db;
}

describe('0524 training compliance requirement sanitization', () => {
  it('pins Schema V2 change, migration and plan hashes', () => {
    const change = read(changePath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath)) as Record<string, string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({ changeId: 'training-compliance-requirement-sanitization-0524', baselineId: 'production-d1-baseline-v2-20260714', filePath: changePath, planPath });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('removes redundant fallbacks, preserves specific overrides and reconciles reviewed audiences', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND escopo='EMPRESA' AND obrigatoriedade='NAO_APLICA' AND condicao_id IS NULL AND setor_id IS NULL AND funcao_id IS NULL AND funcionario_id IS NULL AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(0);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=543 AND escopo='FUNCIONARIO' AND funcionario_id=1000 AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(1);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.deleted_at IS NOT NULL AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(0);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=187 AND escopo='SETOR' AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(1);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo LIKE 'RBAC119_%' AND tr.obrigatoriedade='NAO_APLICA' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(5);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-EAD' AND tr.escopo='FUNCAO' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(11);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id WHERE tr.empresa_id=6 AND qt.codigo='FDM-EAD' AND cc.codigo='FDM_EQUIPE' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(1);
    for (const code of ['MNT_AW139','MNT_S76AC']) expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='${code}' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(2);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='AVSEC_CONSC' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;`)[0].total).toBe(1);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM treinamento_requisitos WHERE empresa_id=7 AND obrigatoriedade='NAO_APLICA' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(1);
  });

  it('is idempotent', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(execSql(db, migration).code).toBe(0);
    expect(querySql<{ total:number }>(db, `SELECT COUNT(*) total FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='AVSEC_CONSC' AND ativo=1 AND deleted_at IS NULL;`)[0].total).toBe(1);
  });

  it('fails closed on the legacy reconciler instead of deriving obligations from history', () => {
    const legacyPath = 'scripts/production/reconcile-training-compliance-requirements.py';
    const legacy = read(legacyPath);
    expect(legacy).not.toContain('qualificacoes_historico');
    expect(legacy).not.toContain('DESIGNATED_FROM_HISTORY');
    expect(legacy).not.toContain('MAINT_HISTORY_FUNCTION');
    expect(legacy).toContain('Qualification history must never create a current Compliance obligation');
    const blocked = spawnSync('python3', [legacyPath], { cwd: ROOT, encoding: 'utf8' });
    expect(blocked.status).toBe(2);
    expect(blocked.stderr).toContain('BLOCKED:');
  });

  it('is wired through governed staging and production paths', () => {
    expect(read('scripts/staging/apply-approved-migrations.sh')).toContain('0524_training_compliance_requirement_sanitization.sql');
    const recovery = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    expect(recovery).toContain('validate-0524-preflight.sh');
    expect(recovery).toContain('validate-0524-postconditions.sh');
    expect(read('.github/workflows/apply-schema-change-v2.yml')).toContain("inputs.change_id == 'training-compliance-requirement-sanitization-0524'");
    expect(read('.github/workflows/staging-d1-schema-change.yml')).toContain('0524_training_compliance_requirement_sanitization.sql');
    for (const file of ['scripts/schema-v2/validate-0524-production-preflight.sh','scripts/schema-v2/validate-0524-production-postconditions.sh','scripts/staging/validate-0524-preflight.sh','scripts/staging/validate-0524-postconditions.sh']) expect(spawnSync('bash', ['-n', file], { cwd: ROOT }).status).toBe(0);
  });
});
