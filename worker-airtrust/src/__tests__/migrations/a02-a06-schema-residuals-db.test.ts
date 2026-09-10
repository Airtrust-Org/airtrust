import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function runSqlite(sql: string): string {
  const result = spawnSync('sqlite3', [':memory:'], {
    input: sql,
    encoding: 'utf-8',
    timeout: 5000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`sqlite3 exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
}

const baseSchema = `
  CREATE TABLE funcionarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cpf TEXT,
    matricula TEXT,
    email TEXT,
    empresa_id INTEGER NOT NULL,
    deleted_at TEXT
  );
`;

describe('A-02 residual migration - DB validation', () => {
  const mig0489 = readFileSync(
    resolve(process.cwd(), 'migrations/0489_a02_natural_keys_tenant_scoped.sql'),
    'utf8',
  );

  it('allows cross-tenant reuse and soft-deleted/null/blank values', () => {
    const out = runSqlite(`
      ${baseSchema}
      ${mig0489}

      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('A', '123', 'MAT-1', 'Pilot@Example.com', 1);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('B', '123', 'MAT-1', ' pilot@example.com ', 2);

      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id, deleted_at)
        VALUES ('Deleted', 'DEL', 'OLD', 'old@example.com', 3, '2026-01-01');
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('Replacement', 'DEL', 'OLD', 'OLD@example.com', 3);

      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('Null A', NULL, NULL, NULL, 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('Null B', NULL, NULL, NULL, 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('Blank A', ' ', ' ', ' ', 4);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('Blank B', ' ', ' ', ' ', 4);

      SELECT COUNT(*) FROM funcionarios;
    `);
    expect(out.trim()).toBe('8');
  });

  it('blocks duplicate CPF inside the same tenant', () => {
    expect(() =>
      runSqlite(`
        ${baseSchema}
        ${mig0489}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('A', '123', 'M1', 'a@example.com', 1);
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('B', '123', 'M2', 'b@example.com', 1);
      `),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('keeps matricula case-sensitive while ignoring surrounding whitespace', () => {
    const out = runSqlite(`
      ${baseSchema}
      ${mig0489}
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('A', '111', 'ABC-1', 'a@example.com', 1);
      INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
        VALUES ('B', '222', 'abc-1', 'b@example.com', 1);
      SELECT COUNT(*) FROM funcionarios;
    `);
    expect(out.trim()).toBe('2');

    expect(() =>
      runSqlite(`
        ${baseSchema}
        ${mig0489}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('A', '111', 'ABC-1', 'a@example.com', 1);
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('B', '222', ' ABC-1 ', 'b@example.com', 1);
      `),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('blocks email duplicates using the canonical LOWER(TRIM(email)) identity', () => {
    expect(() =>
      runSqlite(`
        ${baseSchema}
        ${mig0489}
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('A', '111', 'M1', 'Pilot@Example.com', 1);
        INSERT INTO funcionarios (nome, cpf, matricula, email, empresa_id)
          VALUES ('B', '222', 'M2', ' pilot@example.com ', 1);
      `),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('detects unknown global UNIQUE autoindexes on employee natural keys', () => {
    const driftQuery = `
      SELECT COUNT(*) AS count
      FROM pragma_index_list('funcionarios') AS il
      WHERE il."unique" = 1
        AND il.name NOT IN (
          'ux_funcionarios_cpf',
          'ux_funcionarios_matricula',
          'ux_funcionarios_email'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM pragma_index_info(il.name) AS ii
          WHERE ii.name = 'empresa_id'
        )
        AND (
          EXISTS (
            SELECT 1
            FROM pragma_index_info(il.name) AS ii
            WHERE ii.name IN ('cpf', 'matricula', 'email')
          )
          OR EXISTS (
            SELECT 1
            FROM sqlite_master AS sm
            WHERE sm.type = 'index'
              AND sm.name = il.name
              AND sm.sql IS NOT NULL
              AND (
                LOWER(sm.sql) LIKE '%cpf%'
                OR LOWER(sm.sql) LIKE '%matricula%'
                OR LOWER(sm.sql) LIKE '%email%'
              )
          )
        );
    `;

    const autoindex = runSqlite(`
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        cpf TEXT UNIQUE,
        matricula TEXT,
        email TEXT
      );
      ${driftQuery}
    `);
    expect(autoindex.trim()).toBe('1');

    const knownLegacy = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf ON funcionarios(cpf);
      ${driftQuery}
    `);
    expect(knownLegacy.trim()).toBe('0');

    const tenantScoped = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf_empresa_active
        ON funcionarios(empresa_id, cpf);
      ${driftQuery}
    `);
    expect(tenantScoped.trim()).toBe('0');
  });

  it('fails closed when a known legacy index name was repurposed', () => {
    const contractQuery = `
      SELECT COUNT(*) AS count
      FROM sqlite_master AS sm
      WHERE sm.type = 'index'
        AND sm.name = 'ux_funcionarios_cpf'
        AND LOWER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(COALESCE(sm.sql, ''), ' ', ''),
                char(9),
                ''
              ),
              char(10),
              ''
            ),
            char(13),
            ''
          )
        ) <> 'createuniqueindexux_funcionarios_cpfonfuncionarios(cpf)wheredeleted_atisnull';
    `;

    const expectedLegacy = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf
        ON funcionarios(cpf)
        WHERE deleted_at IS NULL;
      ${contractQuery}
    `);
    expect(expectedLegacy.trim()).toBe('0');

    const repurposedColumn = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf
        ON funcionarios(email)
        WHERE deleted_at IS NULL;
      ${contractQuery}
    `);
    expect(repurposedColumn.trim()).toBe('1');

    const repurposedCollation = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf
        ON funcionarios(cpf COLLATE NOCASE)
        WHERE deleted_at IS NULL;
      ${contractQuery}
    `);
    expect(repurposedCollation.trim()).toBe('1');

    const repurposedLifecycle = runSqlite(`
      ${baseSchema}
      CREATE UNIQUE INDEX ux_funcionarios_cpf
        ON funcionarios(cpf);
      ${contractQuery}
    `);
    expect(repurposedLifecycle.trim()).toBe('1');
  });

});
