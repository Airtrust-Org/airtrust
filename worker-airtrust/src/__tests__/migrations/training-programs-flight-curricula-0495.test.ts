import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migration0493Path = join(
  ROOT,
  'worker-airtrust/migrations/0493_simulator_annual_curriculum_cycles.sql',
);
const migrationPath = join(
  ROOT,
  'worker-airtrust/migrations/0495_training_programs_and_flight_curricula.sql',
);
const changePath = join(
  ROOT,
  'worker-airtrust/schema-v2/changes/0495_training_programs_and_flight_curricula.sql',
);
const planPath = join(
  ROOT,
  'worker-airtrust/schema-v2/plans/training-programs-and-flight-curricula-0495.md',
);
const manifestPath = join(
  ROOT,
  'worker-airtrust/schema-v2/training-programs-and-flight-curricula-0495.json',
);
const migration0493 = readFileSync(migration0493Path, 'utf8');
const migration = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-programs-0495-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const base = execSql(
    dbPath,
    `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_categorias (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT, nome TEXT,
      ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, tipo TEXT, codigo TEXT NOT NULL,
      nome TEXT, descricao TEXT, categoria TEXT, categoria_id INTEGER,
      carga_horaria REAL, carga_horaria_inicial REAL, carga_horaria_recorrente REAL,
      conteudo_programatico TEXT, validade INTEGER, vencimento_fim_mes INTEGER DEFAULT 0,
      observacoes TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, nome TEXT,
      modelo_aeronave TEXT, duracao_estimada INTEGER, qualificacao_tipo_id INTEGER,
      ordem_no_treinamento INTEGER, gera_qualificacao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1, deleted_at TEXT, updated_at TEXT
    );
  `,
  );
  expect(base.code, base.stderr).toBe(0);
  const support = execSql(
    dbPath,
    `
    CREATE TABLE modelos_sessao_versionamento (
      empresa_id INTEGER NOT NULL, modelo_id INTEGER NOT NULL,
      codigo_canonico TEXT NOT NULL, is_current INTEGER NOT NULL
    );
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER, qualificacao_id INTEGER, tipo_treinamento TEXT,
      status TEXT, carga_horaria REAL, deleted_at TEXT
    );
    CREATE TABLE treinamentos_planejados (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER, carga_horaria_prevista REAL, deleted_at TEXT
    );
    CREATE TABLE treinamento_dependencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL,
      qualificacao_origem_id INTEGER NOT NULL, qualificacao_destino_id INTEGER NOT NULL,
      intervalo_meses INTEGER NOT NULL, vigencia_inicio TEXT NOT NULL,
      observacoes TEXT, ativo INTEGER DEFAULT 1, deleted_at TEXT
    );
    INSERT INTO empresas(id) VALUES (6),(7);
    INSERT INTO qualificacoes_categorias(id,empresa_id,codigo,nome) VALUES
      (10,6,'VOO','Voo'),(11,6,'TEORICO','Teórico'),(70,7,'VOO','Voo');
    INSERT INTO qualificacoes_tipos
      (id,empresa_id,tipo,codigo,nome,categoria,categoria_id,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,validade,ativo)
    VALUES
      (33,6,'RECORRENTE','G1','AW139 anual','Voo',10,8,24,8,12,1),
      (106,6,'RECORRENTE','G1-SEM','AW139 semestral','Voo',10,4,NULL,4,6,1),
      (40,6,'RECORRENTE','G2','SK76 anual','Voo',10,6,24,6,12,1),
      (46,6,'RECORRENTE','J','Instrutor de Voo — Voo','Voo',10,1,2,1,24,1),
      (24,6,'RECORRENTE','D3','CRM — Company Resource Management','Teórico',11,8,16,8,12,1),
      (733,7,'RECORRENTE','G1','Outro tenant','Voo',70,8,24,8,12,1);
  `,
  );
  expect(support.code, support.stderr).toBe(0);

  const codes: Array<{ code: string; aircraft: string; minutes: number }> = [];
  for (const cycle of [1, 2, 3]) {
    codes.push(
      { code: `A139-P-01/04-C${cycle}`, aircraft: 'AW139', minutes: 120 },
      { code: `A139-P-02/04-C${cycle}-OFFSHORE`, aircraft: 'AW139', minutes: 120 },
      { code: `A139-P-03/04-C${cycle}-IFR-LOFT`, aircraft: 'AW139', minutes: 120 },
      { code: `A139-P-04/04-C${cycle}-CHECK`, aircraft: 'AW139', minutes: 120 },
      { code: `A139-S-01/02-C${cycle}`, aircraft: 'AW139', minutes: 120 },
      { code: `A139-S-02/02-C${cycle}`, aircraft: 'AW139', minutes: 120 },
      { code: `S76-P-01/04-C${cycle}`, aircraft: 'SK76', minutes: 120 },
      { code: `S76-P-02/04-C${cycle}`, aircraft: 'SK76', minutes: 120 },
    );
  }
  codes.push({ code: 'SK76-P-CHECK', aircraft: 'SK76', minutes: 120 });
  for (let order = 1; order <= 12; order += 1) {
    codes.push(
      { code: `A139-I-${String(order).padStart(2, '0')}/12`, aircraft: 'AW139', minutes: 120 },
      { code: `SK76-I-${String(order).padStart(2, '0')}/12`, aircraft: 'SK76', minutes: 120 },
    );
  }
  codes.push(
    { code: 'SK76-S-01/02', aircraft: 'SK76', minutes: 120 },
    { code: 'SK76-S-02/02', aircraft: 'SK76', minutes: 120 },
  );

  codes.forEach((entry, index) => {
    const id = 100 + index;
    const inserted = execSql(
      dbPath,
      `INSERT INTO modelos_sessao(id,empresa_id,codigo,nome,modelo_aeronave,duracao_estimada,ativo)
       VALUES (${id},6,${sqlQuote(entry.code)},${sqlQuote(entry.code)},${sqlQuote(entry.aircraft)},${entry.minutes},1);
       INSERT INTO modelos_sessao_versionamento(empresa_id,modelo_id,codigo_canonico,is_current)
       VALUES (6,${id},${sqlQuote(entry.code)},1);`,
    );
    expect(inserted.code, inserted.stderr).toBe(0);
  });

  const before0494 = execSql(dbPath, migration0493);
  expect(before0494.code, before0494.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0495 training programs and flight curricula', () => {
  it('keeps the migration and reviewed Schema V2 change byte-identical with pinned hashes', () => {
    const migrationSql = readFileSync(migrationPath, 'utf8');
    const changeSql = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    expect(changeSql).toBe(migrationSql);
    expect(manifest).toMatchObject({
      changeId: 'training-programs-and-flight-curricula-0495',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0495_training_programs_and_flight_curricula.sql',
      planPath: 'worker-airtrust/schema-v2/plans/training-programs-and-flight-curricula-0495.md',
    });
    expect(manifest.fileHash).toBe(sha256(changeSql));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('creates distinct Initial/Periodic programs and preserves one qualification identity', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);

    const rows = querySql<{
      code: string;
      type: string;
      hours: number;
      oneTime: number;
      nextCode: string | null;
    }>(
      dbPath,
      `
      SELECT p.codigo AS code,p.tipo_treinamento AS type,p.carga_horaria AS hours,
             p.uso_unico AS oneTime,n.codigo AS nextCode
        FROM treinamento_programas p
        LEFT JOIN treinamento_programas n ON n.id=p.proximo_programa_id
       WHERE p.empresa_id=6 AND p.codigo IN ('G1:INICIAL','G1:RECORRENTE','G2:INICIAL','G2:RECORRENTE','D3:INICIAL','D3:RECORRENTE')
       ORDER BY p.codigo;
    `,
    );
    expect(rows).toEqual([
      { code: 'D3:INICIAL', type: 'INICIAL', hours: 16, oneTime: 1, nextCode: 'D3:RECORRENTE' },
      {
        code: 'D3:RECORRENTE',
        type: 'RECORRENTE',
        hours: 8,
        oneTime: 0,
        nextCode: 'D3:RECORRENTE',
      },
      { code: 'G1:INICIAL', type: 'INICIAL', hours: 24, oneTime: 1, nextCode: 'G1:RECORRENTE' },
      {
        code: 'G1:RECORRENTE',
        type: 'RECORRENTE',
        hours: 8,
        oneTime: 0,
        nextCode: 'G1:RECORRENTE',
      },
      { code: 'G2:INICIAL', type: 'INICIAL', hours: 24, oneTime: 1, nextCode: 'G2:RECORRENTE' },
      {
        code: 'G2:RECORRENTE',
        type: 'RECORRENTE',
        hours: 6,
        oneTime: 0,
        nextCode: 'G2:RECORRENTE',
      },
    ]);
    expect(
      querySql<{ n: number }>(
        dbPath,
        `SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G1';`,
      )[0].n,
    ).toBe(1);
    expect(
      querySql<{ n: number }>(
        dbPath,
        `SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2';`,
      )[0].n,
    ).toBe(1);
  });

  it('seeds AW139/SK76 Initial, rotating Periodic and SK76 Semiannual curricula', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const counts = querySql<{ code: string; cycle: number; total: number }>(
      dbPath,
      `
      SELECT p.codigo AS code,pm.ciclo AS cycle,COUNT(*) AS total
        FROM treinamento_programa_modelos pm
        JOIN treinamento_programas p ON p.id=pm.programa_id
       WHERE pm.empresa_id=6 AND pm.deleted_at IS NULL
         AND p.codigo IN ('G1:INICIAL','G1:RECORRENTE','G1-SEM:SEMESTRAL','G2:INICIAL','G2:RECORRENTE','G2-SEM:SEMESTRAL')
       GROUP BY p.codigo,pm.ciclo ORDER BY p.codigo,pm.ciclo;
    `,
    );
    expect(counts).toEqual([
      { code: 'G1-SEM:SEMESTRAL', cycle: 1, total: 2 },
      { code: 'G1-SEM:SEMESTRAL', cycle: 2, total: 2 },
      { code: 'G1-SEM:SEMESTRAL', cycle: 3, total: 2 },
      { code: 'G1:INICIAL', cycle: 1, total: 12 },
      { code: 'G1:RECORRENTE', cycle: 1, total: 4 },
      { code: 'G1:RECORRENTE', cycle: 2, total: 4 },
      { code: 'G1:RECORRENTE', cycle: 3, total: 4 },
      { code: 'G2-SEM:SEMESTRAL', cycle: 1, total: 2 },
      { code: 'G2:INICIAL', cycle: 1, total: 12 },
      { code: 'G2:RECORRENTE', cycle: 1, total: 3 },
      { code: 'G2:RECORRENTE', cycle: 2, total: 3 },
      { code: 'G2:RECORRENTE', cycle: 3, total: 3 },
    ]);
    const semi = querySql<{ validity: number; hours: number }>(
      dbPath,
      `
      SELECT validade AS validity,carga_horaria AS hours
        FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='G2-SEM';
    `,
    );
    expect(semi).toEqual([{ validity: 6, hours: 4 }]);
    expect(
      querySql<{ n: number }>(
        dbPath,
        `SELECT COUNT(*) AS n FROM treinamento_dependencias d JOIN qualificacoes_tipos o ON o.id=d.qualificacao_origem_id JOIN qualificacoes_tipos x ON x.id=d.qualificacao_destino_id WHERE d.empresa_id=6 AND o.codigo='G2' AND x.codigo='G2-SEM' AND d.intervalo_meses=6 AND d.deleted_at IS NULL;`,
      )[0].n,
    ).toBe(1);
  });

  it('does not rewrite legacy history but enriches new explicit writes with the program id', () => {
    const dbPath = createDatabase();
    expect(
      execSql(
        dbPath,
        `INSERT INTO qualificacoes_historico(id,empresa_id,funcionario_id,qualificacao_id,tipo_treinamento,status,carga_horaria) VALUES (1,6,10,24,'RECORRENTE','CONCLUIDA',16);`,
      ).code,
    ).toBe(0);
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const oldRow = querySql<{ programId: number | null }>(
      dbPath,
      `SELECT programa_treinamento_id AS programId FROM qualificacoes_historico WHERE id=1;`,
    )[0];
    expect(oldRow.programId).toBeNull();

    expect(
      execSql(
        dbPath,
        `INSERT INTO qualificacoes_historico(empresa_id,funcionario_id,qualificacao_id,tipo_treinamento,status,carga_horaria) VALUES (6,11,24,'INICIAL','CONCLUIDA',16);`,
      ).code,
    ).toBe(0);
    const newRow = querySql<{ code: string }>(
      dbPath,
      `
      SELECT p.codigo AS code FROM qualificacoes_historico h
      JOIN treinamento_programas p ON p.id=h.programa_treinamento_id
      WHERE h.funcionario_id=11;
    `,
    );
    expect(newRow).toEqual([{ code: 'D3:INICIAL' }]);
  });

  it('guards cross-tenant next-program and current-model assignments', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const foreign = execSql(
      dbPath,
      `INSERT INTO treinamento_programas(empresa_id,qualificacao_tipo_id,codigo,nome,tipo_treinamento,total_ciclos) VALUES (7,733,'FOREIGN','Foreign','RECORRENTE',1);`,
    );
    expect(foreign.code, foreign.stderr).toBe(0);
    const foreignId = querySql<{ id: number }>(
      dbPath,
      `SELECT id FROM treinamento_programas WHERE empresa_id=7 AND codigo='FOREIGN';`,
    )[0].id;
    const crossNext = execSql(
      dbPath,
      `UPDATE treinamento_programas SET proximo_programa_id=${foreignId} WHERE empresa_id=6 AND codigo='G1:INICIAL';`,
    );
    expect(crossNext.code).not.toBe(0);
    expect(crossNext.stderr).toContain('next program tenant mismatch');
  });
});
