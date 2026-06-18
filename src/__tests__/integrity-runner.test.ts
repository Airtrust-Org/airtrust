import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { parseInvariantFile, runIntegrity } from '../../scripts/integrity/run-integrity.mjs';

function sqlite(dbPath: string, sql: string) {
  execFileSync('sqlite3', [dbPath, sql], { stdio: 'ignore' });
}

function withTempDb(setupSql: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-integrity-'));
  const dbPath = path.join(tempDir, 'fixture.sqlite');
  sqlite(dbPath, setupSql);
  return { tempDir, dbPath };
}

function writeInvariantFile(tempDir: string, contents: string) {
  const sqlPath = path.join(tempDir, 'invariants.sql');
  fs.writeFileSync(sqlPath, contents);
  return sqlPath;
}

describe('integrity runner', () => {
  it('parseia metadata e statements do invariants.sql', () => {
    const parsed = parseInvariantFile(`
-- id: I1
-- severity: P0
-- title: Exemplo
SELECT 1 AS total;
`);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'I1',
      severity: 'P0',
      title: 'Exemplo',
      sql: 'SELECT 1 AS total;',
    });
  });

  it('falha para P0 e baseline abaixo do minimo', () => {
    const { dbPath } = withTempDb(`
      CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT, ativo INTEGER, deleted_at TEXT);
      CREATE TABLE modelos_sessao_manobras (modelo_id INTEGER, manobra_id INTEGER, ordem INTEGER, deleted_at TEXT);
      CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, template_id INTEGER, status TEXT, deleted_at TEXT);
      CREATE TABLE fichas_sessao_manobras (ficha_id INTEGER, ordem INTEGER, resultado INTEGER, deleted_at TEXT);
      CREATE TABLE manobras (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
      CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER, status TEXT, data_conclusao TEXT, deleted_at TEXT);
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
      CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, origem TEXT, deleted_at TEXT);
      CREATE TABLE escalas_mensais (id TEXT PRIMARY KEY, deleted_at TEXT);
      CREATE TABLE escala_alocacoes (id TEXT PRIMARY KEY, escala_id TEXT, funcionario_id TEXT, data_inicio TEXT, data_fim TEXT, deleted_at TEXT);
      INSERT INTO modelos_sessao (id, codigo, ativo, deleted_at) VALUES (1, 'A139', 1, NULL);
      INSERT INTO fichas_sessao (id, empresa_id, template_id, status, deleted_at) VALUES (10, 6, 1, 'ASSINADO', NULL);
    `);

    const baselinePath = path.join(path.dirname(dbPath), 'baseline.json');
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({
        checks: {
          I1b: {
            minimum: {
              total_relacoes: 2,
            },
          },
        },
      }),
    );

    const result = runIntegrity({
      dbPath,
      sqlPath: path.resolve('scripts/integrity/invariants.sql'),
      baselinePath,
    });

    expect(result.checks.find((check) => check.id === 'I1')?.status).toBe('FAILED');
    expect(result.checks.find((check) => check.id === 'I1b')?.status).toBe('FAILED');
    expect(result.checks.find((check) => check.id === 'I2')?.status).toBe('FAILED');
  });

  it('marca check opcional como SKIPPED_SCHEMA_UNCONFIRMED', () => {
    const { dbPath } = withTempDb(`
      CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT, ativo INTEGER, deleted_at TEXT);
      CREATE TABLE modelos_sessao_manobras (modelo_id INTEGER, manobra_id INTEGER, ordem INTEGER, deleted_at TEXT);
      CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, template_id INTEGER, status TEXT, deleted_at TEXT);
      CREATE TABLE fichas_sessao_manobras (ficha_id INTEGER, ordem INTEGER, deleted_at TEXT);
      CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER, status TEXT, data_conclusao TEXT, deleted_at TEXT);
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
      CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, origem TEXT, deleted_at TEXT);
      CREATE TABLE escalas_mensais (id TEXT PRIMARY KEY, deleted_at TEXT);
      CREATE TABLE escala_alocacoes (id TEXT PRIMARY KEY, escala_id TEXT, funcionario_id TEXT, data_inicio TEXT, data_fim TEXT, deleted_at TEXT);
    `);

    const result = runIntegrity({
      dbPath,
      sqlPath: path.resolve('scripts/integrity/invariants.sql'),
      baselinePath: path.resolve('scripts/integrity/baseline.example.json'),
    });

    expect(result.checks.find((check) => check.id === 'I2b')?.status).toBe(
      'SKIPPED_SCHEMA_UNCONFIRMED',
    );
  });

  it('rejeita DML e DDL em invariantes', () => {
    const { tempDir, dbPath } = withTempDb(`CREATE TABLE sample (id INTEGER PRIMARY KEY);`);
    const dmlPath = writeInvariantFile(
      tempDir,
      `
-- id: DML
-- severity: P0
-- title: DML proibido
INSERT INTO sample(id) VALUES (1);
`,
    );

    expect(() =>
      runIntegrity({
        dbPath,
        sqlPath: dmlPath,
      }),
    ).toThrow(/Only SELECT statements are allowed/);

    const ddlPath = writeInvariantFile(
      tempDir,
      `
-- id: DDL
-- severity: P0
-- title: DDL proibido
CREATE TABLE forbidden(id INTEGER);
`,
    );

    expect(() =>
      runIntegrity({
        dbPath,
        sqlPath: ddlPath,
      }),
    ).toThrow(/Only SELECT statements are allowed/);
  });

  it('rejeita statements mistos com SELECT seguido de DML', () => {
    const { tempDir, dbPath } = withTempDb(`CREATE TABLE sample (id INTEGER PRIMARY KEY);`);
    const sqlPath = writeInvariantFile(
      tempDir,
      `
-- id: MIXED
-- severity: P0
-- title: Misto
SELECT 1 AS ok;
-- id: MIXED_DML
-- severity: P0
-- title: Misto DML
DELETE FROM sample;
`,
    );

    expect(() =>
      runIntegrity({
        dbPath,
        sqlPath,
      }),
    ).toThrow(/Only SELECT statements are allowed/);
  });

  it('falha se check obrigatorio referencia tabela inexistente', () => {
    const { tempDir, dbPath } = withTempDb(`CREATE TABLE sample (id INTEGER PRIMARY KEY);`);
    const sqlPath = writeInvariantFile(
      tempDir,
      `
-- id: REQUIRED
-- severity: P0
-- title: Tabela obrigatoria
-- required_tables: missing_table
SELECT 1 AS ok;
`,
    );

    expect(() =>
      runIntegrity({
        dbPath,
        sqlPath,
      }),
    ).toThrow(/references missing schema/);
  });

  it('ignora palavra proibida em comentario', () => {
    const { tempDir, dbPath } = withTempDb(`CREATE TABLE sample (id INTEGER PRIMARY KEY);`);
    const sqlPath = writeInvariantFile(
      tempDir,
      `
-- id: COMMENT
-- severity: P1
-- title: Comentario seguro
SELECT 1 AS ok /* DROP TABLE sample */;
`,
    );

    const result = runIntegrity({
      dbPath,
      sqlPath,
    });

    expect(result.checks[0]?.status).toBe('FAILED');
  });

  it('mantem JSON estavel e nao falha processo quando so ha P1', () => {
    const { dbPath } = withTempDb(`
      CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY, codigo TEXT, ativo INTEGER, deleted_at TEXT);
      CREATE TABLE modelos_sessao_manobras (modelo_id INTEGER, manobra_id INTEGER, ordem INTEGER, deleted_at TEXT);
      CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY, empresa_id INTEGER, template_id INTEGER, status TEXT, deleted_at TEXT);
      CREATE TABLE fichas_sessao_manobras (ficha_id INTEGER, ordem INTEGER, resultado TEXT, deleted_at TEXT);
      CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER, status TEXT, data_conclusao TEXT, deleted_at TEXT);
      CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
      CREATE TABLE frms_jornada (id TEXT PRIMARY KEY, tripulante_id INTEGER, data TEXT, origem TEXT, deleted_at TEXT);
      CREATE TABLE escalas_mensais (id TEXT PRIMARY KEY, deleted_at TEXT);
      CREATE TABLE escala_alocacoes (id TEXT PRIMARY KEY, escala_id TEXT, funcionario_id TEXT, data_inicio TEXT, data_fim TEXT, deleted_at TEXT);
      INSERT INTO qualificacoes_historico (id, funcionario_id, empresa_id, status, data_conclusao, deleted_at) VALUES (1, 7, 1, 'CONCLUIDA', '2026-06-01', NULL);
      INSERT INTO funcionarios (id, empresa_id, deleted_at) VALUES (7, 2, NULL);
    `);
    const output = execFileSync(
      'node',
      [
        path.resolve('scripts/integrity/run-integrity.mjs'),
        '--db',
        dbPath,
        '--fail-on-severity',
        'P0',
      ],
      { encoding: 'utf8' },
    );

    const parsed = JSON.parse(output);
    expect(parsed.failOnSeverity).toBe('P0');
    expect(parsed.summary.total).toBeGreaterThan(0);
    expect(parsed.violations.some((check: { id: string }) => check.id === 'I5')).toBe(true);
  });
});
