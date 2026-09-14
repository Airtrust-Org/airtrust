import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migration = readFileSync(
  join(ROOT, 'worker-airtrust/migrations/0492_organizational_structure_normalization.sql'),
  'utf8',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-org-0492-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const setup = execSql(dbPath, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE setores (
      id INTEGER PRIMARY KEY, codigo TEXT NOT NULL, nome TEXT NOT NULL, ativo INTEGER DEFAULT 1,
      created_at TEXT, updated_at TEXT, deleted_at TEXT, empresa_id INTEGER NOT NULL
    );
    CREATE TABLE funcoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL, nome TEXT NOT NULL,
      descricao TEXT, categoria TEXT, ativo INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT,
      deleted_at TEXT, empresa_id INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_funcoes_codigo ON funcoes(empresa_id,codigo);
    CREATE TABLE funcionarios (
      id INTEGER PRIMARY KEY, nome TEXT, cargo TEXT, funcao TEXT, setor TEXT, setor_id INTEGER,
      status TEXT DEFAULT 'ATIVO', ativo INTEGER DEFAULT 1, empresa_id INTEGER NOT NULL,
      created_at TEXT, updated_at TEXT, deleted_at TEXT,
      FOREIGN KEY (setor_id) REFERENCES setores(id)
    );
    CREATE TABLE qualificacoes_tipos_setores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tipo_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT,
      FOREIGN KEY (setor_id) REFERENCES setores(id)
    );
    CREATE UNIQUE INDEX idx_qts_unique_active
      ON qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) WHERE deleted_at IS NULL;
    CREATE TABLE lms_cursos_setores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, curso_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
      empresa_id INTEGER NOT NULL, created_at TEXT, updated_at TEXT, deleted_at TEXT,
      FOREIGN KEY (setor_id) REFERENCES setores(id)
    );
    CREATE UNIQUE INDEX idx_lms_cursos_setores_unique_active
      ON lms_cursos_setores(curso_id,setor_id,empresa_id) WHERE deleted_at IS NULL;
    CREATE TABLE setores_gestores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, setor_id INTEGER NOT NULL, gestor_id INTEGER,
      empresa_id INTEGER NOT NULL, role TEXT DEFAULT 'manager', ativo INTEGER DEFAULT 1,
      created_at TEXT, updated_at TEXT, deleted_at TEXT, usuario_id INTEGER,
      FOREIGN KEY (setor_id) REFERENCES setores(id)
    );
    CREATE UNIQUE INDEX idx_setores_gestores_usuario_unique
      ON setores_gestores(setor_id,usuario_id,empresa_id)
      WHERE deleted_at IS NULL AND usuario_id IS NOT NULL;
    CREATE TABLE treinamento_requisitos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER NOT NULL, escopo TEXT NOT NULL, setor_id INTEGER,
      funcao_id INTEGER, funcionario_id INTEGER, obrigatoriedade TEXT DEFAULT 'OBRIGATORIA',
      ativo INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT, deleted_at TEXT,
      FOREIGN KEY (setor_id) REFERENCES setores(id), FOREIGN KEY (funcao_id) REFERENCES funcoes(id)
    );
    CREATE UNIQUE INDEX idx_treinamento_requisitos_unique_active
      ON treinamento_requisitos(
        empresa_id,qualificacao_tipo_id,escopo,COALESCE(setor_id,0),
        COALESCE(funcao_id,0),COALESCE(funcionario_id,0)
      ) WHERE ativo=1 AND deleted_at IS NULL;

    INSERT INTO empresas VALUES (6),(7);
    INSERT INTO setores(id,codigo,nome,ativo,empresa_id) VALUES
      (10,'TRI','Tripulação',1,6),(11,'MAN','Manutenção',1,6),(14,'ADM','Administrativo',1,6),
      (15,'QUA','Qualidade',1,6),(21,'CTM','CTM',1,6),(28,'QSMS','QSMS',1,6),
      (31,'LOGISTICA','Logística',1,6),(111,'T7','Tenant 7',1,7);
    INSERT INTO funcoes(id,codigo,nome,categoria,ativo,empresa_id) VALUES
      (2,'SIC','Copiloto','OPERACIONAL',1,6),(5,'MEC','Mecânico','MANUTENCAO',1,6),
      (17,'PIC','Comandante','OPERACIONAL',1,6),(700,'T7ROLE','Tenant 7 Role','OTHER',1,7);

    INSERT INTO funcionarios(id,nome,cargo,funcao,setor,setor_id,status,ativo,empresa_id) VALUES
      (1,'Trip A','1º Oficial','Comandante','Tripulação',10,'ATIVO',1,6),
      (2,'Trip B','Copiloto','Copiloto','Tripulação',10,'ATIVO',1,6),
      (3,'Trip C','Piloto de Aeronaves','Comandante','Tripulação',10,'ATIVO',1,6),
      (4,'Eng','Coordenador de Engenharia','Coord de Engenharia','Manutenção',11,'ATIVO',1,6),
      (5,'Supply','Auxiliar de Suprimentos','Auxiliar de Suprimentos II','Manutenção',11,'ATIVO',1,6),
      (6,'QA','QA Fictício',NULL,'Manutenção',11,'ATIVO',1,6),
      (7,'Mechanic','Mecânico','Mecânico','Manutenção',11,'ATIVO',1,6),
      (8,'Admin','Auxiliar de Serviços Gerais',NULL,'Administrativo',14,'ATIVO',1,6),
      (9,'Quality','Auxiliar de QSMS',NULL,'Qualidade',15,'ATIVO',1,6),
      (10,'CTM person','Analista de CTM','Analista de CTM I','CTM',21,'ATIVO',1,6),
      (70,'Tenant7','Tenant 7 Role','Tenant 7 Role','Tenant 7',111,'ATIVO',1,7);

    INSERT INTO qualificacoes_tipos_setores(tipo_id,setor_id,empresa_id) VALUES
      (23,11,6),(23,21,6),(24,15,6),(24,28,6),(25,21,6),(700,111,7);
    INSERT INTO lms_cursos_setores(curso_id,setor_id,empresa_id) VALUES
      (1,11,6),(1,21,6),(2,15,6),(3,21,6),(700,111,7);
    INSERT INTO setores_gestores(setor_id,empresa_id,usuario_id,ativo) VALUES
      (11,6,59,1),(21,6,59,1),(15,6,60,1),(111,7,700,1);
    INSERT INTO treinamento_requisitos(
      empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,funcionario_id,ativo
    ) VALUES
      (6,100,'SETOR',11,NULL,NULL,1),(6,100,'SETOR',21,NULL,NULL,1),
      (6,101,'SETOR',15,NULL,NULL,1),(7,700,'SETOR',111,NULL,NULL,1);
  `);
  expect(setup.code, setup.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0492 organizational structure normalization', () => {
  it('normalizes approved sectors and roles while preserving other tenants', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);

    const columns = querySql<{ name: string }>(dbPath, "PRAGMA table_info('funcionarios');");
    expect(columns.some((column) => column.name === 'funcao_id')).toBe(true);

    const sourceSectors = querySql<{ id: number; ativo: number; deleted_at: string | null }>(
      dbPath,
      'SELECT id,ativo,deleted_at FROM setores WHERE id IN (15,21) ORDER BY id;',
    );
    expect(sourceSectors.every((row) => row.ativo === 0 && Boolean(row.deleted_at))).toBe(true);

    const liveSourceRefs = querySql<{ n: number }>(dbPath, `
      SELECT
        (SELECT COUNT(*) FROM funcionarios WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21)) +
        (SELECT COUNT(*) FROM qualificacoes_tipos_setores WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21)) +
        (SELECT COUNT(*) FROM lms_cursos_setores WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21)) +
        (SELECT COUNT(*) FROM setores_gestores WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21)) +
        (SELECT COUNT(*) FROM treinamento_requisitos WHERE empresa_id=6 AND deleted_at IS NULL AND setor_id IN (15,21)) AS n;
    `);
    expect(liveSourceRefs[0]?.n).toBe(0);

    const trip = querySql<{ id: number; cargo: string; funcao: string; funcao_id: number }>(dbPath, `
      SELECT id,cargo,funcao,funcao_id FROM funcionarios
       WHERE empresa_id=6 AND setor_id=10 AND deleted_at IS NULL ORDER BY id;
    `);
    expect(trip).toEqual([
      { id: 1, cargo: 'Copiloto', funcao: 'Copiloto', funcao_id: 2 },
      { id: 2, cargo: 'Copiloto', funcao: 'Copiloto', funcao_id: 2 },
      { id: 3, cargo: 'Comandante', funcao: 'Comandante', funcao_id: 17 },
    ]);

    const engineer = querySql<{ funcao: string; funcao_id: number }>(
      dbPath,
      'SELECT funcao,funcao_id FROM funcionarios WHERE id=4;',
    )[0];
    expect(engineer.funcao).toBe('Coordenador de Engenharia');
    expect(engineer.funcao_id).toBeGreaterThan(0);

    const supply = querySql<{ setor_id: number; setor: string; cargo: string; funcao: string; funcao_id: number }>(
      dbPath,
      'SELECT setor_id,setor,cargo,funcao,funcao_id FROM funcionarios WHERE id=5;',
    )[0];
    expect(supply).toMatchObject({
      setor_id: 31,
      setor: 'Logística',
      cargo: 'Auxiliar de Suprimentos',
      funcao: 'Auxiliar de Suprimentos',
    });
    expect(supply.funcao_id).toBeGreaterThan(0);

    const qa = querySql<{ ativo: number; status: string; deleted_at: string | null }>(
      dbPath,
      'SELECT ativo,status,deleted_at FROM funcionarios WHERE id=6;',
    )[0];
    expect(qa.ativo).toBe(0);
    expect(qa.status).toBe('INATIVO');
    expect(qa.deleted_at).toBeTruthy();

    const unmapped = querySql<{ n: number }>(dbPath, `
      SELECT COUNT(*) AS n FROM funcionarios
       WHERE empresa_id=6 AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND funcao_id IS NULL;
    `);
    expect(unmapped[0]?.n).toBe(0);

    const tenant7 = querySql<Record<string, unknown>>(
      dbPath,
      'SELECT setor_id,cargo,funcao,funcao_id,deleted_at FROM funcionarios WHERE id=70;',
    )[0];
    expect(tenant7).toEqual({
      setor_id: 111,
      cargo: 'Tenant 7 Role',
      funcao: 'Tenant 7 Role',
      funcao_id: null,
      deleted_at: null,
    });
  });

  it('enforces tenant ownership for normalized function IDs', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    const crossTenant = execSql(dbPath, 'UPDATE funcionarios SET funcao_id=17 WHERE id=70;');
    expect(crossTenant.code).not.toBe(0);
    expect(crossTenant.stderr).toContain('funcionarios: funcao fora do tenant');
  });
});
