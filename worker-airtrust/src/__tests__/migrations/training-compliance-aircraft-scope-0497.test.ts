import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(ROOT, 'worker-airtrust/migrations/0497_training_compliance_aircraft_scope.sql');
const changePath = join(ROOT, 'worker-airtrust/schema-v2/changes/0497_training_compliance_aircraft_scope.sql');
const planPath = join(ROOT, 'worker-airtrust/schema-v2/plans/training-compliance-aircraft-scope-0497.md');
const manifestPath = join(ROOT, 'worker-airtrust/schema-v2/training-compliance-aircraft-scope-0497.json');
const migration = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-aircraft-0497-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(
    execSql(
      db,
      `
      CREATE TABLE treinamento_requisitos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        escopo TEXT NOT NULL,
        setor_id INTEGER,
        funcao_id INTEGER,
        funcionario_id INTEGER,
        obrigatoriedade TEXT NOT NULL DEFAULT 'OBRIGATORIA',
        ativo INTEGER NOT NULL DEFAULT 1,
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX idx_treinamento_requisitos_unique_active
        ON treinamento_requisitos(
          empresa_id,qualificacao_tipo_id,escopo,
          COALESCE(setor_id,0),COALESCE(funcao_id,0),COALESCE(funcionario_id,0)
        ) WHERE ativo=1 AND deleted_at IS NULL;
      INSERT INTO treinamento_requisitos
        (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,obrigatoriedade)
      VALUES (1,100,'SETOR_FUNCAO',10,2,'OBRIGATORIA');
      `,
    ).code,
  ).toBe(0);
  return db;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0497 training compliance aircraft scope', () => {
  it('keeps reviewed Schema V2 artifacts byte-identical with pinned hashes', () => {
    const change = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;

    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-compliance-aircraft-scope-0497',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0497_training_compliance_aircraft_scope.sql',
      planPath: 'worker-airtrust/schema-v2/plans/training-compliance-aircraft-scope-0497.md',
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('preserves generic rules and allows distinct AW139 and SK76 rules for the same organization scope', () => {
    const db = createDatabase();
    const applied = execSql(db, migration);
    expect(applied.code, applied.stderr).toBe(0);

    expect(
      querySql<{ name: string }>(db, `PRAGMA table_info('treinamento_requisitos');`).map(
        (row) => row.name,
      ),
    ).toContain('aeronave_modelo');

    expect(
      execSql(
        db,
        `
        INSERT INTO treinamento_requisitos
          (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,aeronave_modelo,obrigatoriedade)
        VALUES
          (1,100,'SETOR_FUNCAO',10,2,'AW139','OBRIGATORIA'),
          (1,100,'SETOR_FUNCAO',10,2,'SK76','OBRIGATORIA');
        `,
      ).code,
    ).toBe(0);

    const rows = querySql<{ aeronave_modelo: string | null }>(
      db,
      `SELECT aeronave_modelo FROM treinamento_requisitos
        WHERE empresa_id=1 AND qualificacao_tipo_id=100
        ORDER BY COALESCE(aeronave_modelo,'');`,
    );
    expect(rows.map((row) => row.aeronave_modelo)).toEqual([null, 'AW139', 'SK76']);
  });

  it('normalizes aircraft identity in the unique active-rule index', () => {
    const db = createDatabase();
    expect(execSql(db, migration).code).toBe(0);
    expect(
      execSql(
        db,
        `INSERT INTO treinamento_requisitos
          (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,aeronave_modelo,obrigatoriedade)
         VALUES (1,200,'SETOR_FUNCAO',10,2,'AW139','OBRIGATORIA');`,
      ).code,
    ).toBe(0);

    const duplicate = execSql(
      db,
      `INSERT INTO treinamento_requisitos
        (empresa_id,qualificacao_tipo_id,escopo,setor_id,funcao_id,aeronave_modelo,obrigatoriedade)
       VALUES (1,200,'SETOR_FUNCAO',10,2,' aw139 ','RECOMENDADA');`,
    );
    expect(duplicate.code).not.toBe(0);
    expect(duplicate.stderr).toContain('UNIQUE constraint failed');
  });
});
