import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(
  ROOT,
  'worker-airtrust/migrations/0493_simulator_annual_curriculum_cycles.sql',
);
const changePath = join(
  ROOT,
  'worker-airtrust/schema-v2/changes/0493_simulator_annual_curriculum_cycles.sql',
);
const planPath = join(
  ROOT,
  'worker-airtrust/schema-v2/plans/simulator-annual-curriculum-cycles-0493.md',
);
const manifestPath = join(
  ROOT,
  'worker-airtrust/schema-v2/simulator-annual-curriculum-cycles-0493.json',
);
const migration = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-simulator-cycles-0493-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  expect(
    execSql(
      dbPath,
      `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      nome TEXT, deleted_at TEXT, ativo INTEGER DEFAULT 1
    );
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
      deleted_at TEXT, ativo INTEGER DEFAULT 1
    );
    CREATE TABLE modelos_sessao_versionamento (
      empresa_id INTEGER NOT NULL, modelo_id INTEGER NOT NULL,
      codigo_canonico TEXT NOT NULL, is_current INTEGER NOT NULL
    );
    INSERT INTO empresas(id) VALUES (6),(7);
    INSERT INTO qualificacoes_tipos(id,empresa_id,codigo,nome) VALUES
      (33,6,'G1','AW139 anual'),(106,6,'G1-SEM','AW139 semestral'),
      (40,6,'G2','S76 anual'),(733,7,'G1','Outro tenant');
  `,
    ).code,
  ).toBe(0);

  const codes: string[] = [];
  for (const cycle of [1, 2, 3]) {
    codes.push(
      `A139-P-01/04-C${cycle}`,
      `A139-P-02/04-C${cycle}-OFFSHORE`,
      `A139-P-03/04-C${cycle}-IFR-LOFT`,
      `A139-P-04/04-C${cycle}-CHECK`,
      `A139-S-01/02-C${cycle}`,
      `A139-S-02/02-C${cycle}`,
      `S76-P-01/04-C${cycle}`,
      `S76-P-02/04-C${cycle}`,
    );
  }
  codes.push('SK76-P-CHECK');
  codes.forEach((code, index) => {
    const id = index + 100;
    expect(
      execSql(
        dbPath,
        `
      INSERT INTO modelos_sessao(id,empresa_id,codigo,ativo) VALUES (${id},6,${sqlQuote(code)},1);
      INSERT INTO modelos_sessao_versionamento(empresa_id,modelo_id,codigo_canonico,is_current)
      VALUES (6,${id},${sqlQuote(code)},1);
    `,
      ).code,
    ).toBe(0);
  });
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0493 annual simulator curriculum cycles', () => {
  it('keeps the migration and reviewed Schema V2 change byte-identical with pinned hashes', () => {
    const migrationSql = readFileSync(migrationPath, 'utf8');
    const changeSql = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
    expect(changeSql).toBe(migrationSql);
    expect(manifest).toMatchObject({
      changeId: 'simulator-annual-curriculum-cycles-0493',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0493_simulator_annual_curriculum_cycles.sql',
      planPath: 'worker-airtrust/schema-v2/plans/simulator-annual-curriculum-cycles-0493.md',
    });
    expect(manifest.fileHash).toBe(sha256(changeSql));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('seeds 2026=C2 and all three ordered curricula without creating new qualifications', () => {
    const dbPath = createDatabase();
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);

    const config = querySql<{ code: string; total: number; baseYear: number; baseCycle: number }>(
      dbPath,
      `
      SELECT qt.codigo AS code, c.total_ciclos AS total, c.ano_base AS baseYear,
             c.ciclo_ano_base AS baseCycle
        FROM simuladores_curriculos_voo_config c
        JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id
       ORDER BY qt.codigo;
    `,
    );
    expect(config).toEqual([
      { code: 'G1', total: 3, baseYear: 2026, baseCycle: 2 },
      { code: 'G1-SEM', total: 3, baseYear: 2026, baseCycle: 2 },
      { code: 'G2', total: 3, baseYear: 2026, baseCycle: 2 },
    ]);

    const counts = querySql<{ code: string; cycle: number; total: number }>(
      dbPath,
      `
      SELECT qt.codigo AS code, i.ciclo AS cycle, COUNT(*) AS total
        FROM simuladores_curriculos_voo_itens i
        JOIN qualificacoes_tipos qt ON qt.id=i.qualificacao_tipo_id AND qt.empresa_id=i.empresa_id
       WHERE i.deleted_at IS NULL
       GROUP BY qt.codigo,i.ciclo ORDER BY qt.codigo,i.ciclo;
    `,
    );
    expect(counts).toEqual([
      { code: 'G1', cycle: 1, total: 4 },
      { code: 'G1', cycle: 2, total: 4 },
      { code: 'G1', cycle: 3, total: 4 },
      { code: 'G1-SEM', cycle: 1, total: 2 },
      { code: 'G1-SEM', cycle: 2, total: 2 },
      { code: 'G1-SEM', cycle: 3, total: 2 },
      { code: 'G2', cycle: 1, total: 3 },
      { code: 'G2', cycle: 2, total: 3 },
      { code: 'G2', cycle: 3, total: 3 },
    ]);
    expect(
      querySql<{ n: number }>(dbPath, 'SELECT COUNT(*) AS n FROM qualificacoes_tipos;')[0].n,
    ).toBe(4);
  });

  it('is seed-idempotent and rejects an item from another tenant', () => {
    const dbPath = createDatabase();
    expect(execSql(dbPath, migration).code).toBe(0);
    expect(execSql(dbPath, migration).code).toBe(0);
    expect(
      querySql<{ n: number }>(
        dbPath,
        'SELECT COUNT(*) AS n FROM simuladores_curriculos_voo_itens WHERE deleted_at IS NULL;',
      )[0].n,
    ).toBe(27);

    const crossTenant = execSql(
      dbPath,
      `
      INSERT INTO simuladores_curriculos_voo_itens
        (empresa_id,qualificacao_tipo_id,ciclo,modelo_sessao_id,codigo_canonico,ordem)
      VALUES (6,733,2,100,'X',9);
    `,
    );
    expect(crossTenant.code).not.toBe(0);
    expect(crossTenant.stderr).toContain('sim_curr_voo_itens: ciclo/configuracao invalido');
  });
});
