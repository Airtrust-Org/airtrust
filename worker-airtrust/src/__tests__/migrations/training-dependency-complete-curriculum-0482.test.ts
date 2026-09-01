import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_PATH = join(
  ROOT,
  'worker-airtrust/migrations/0482_training_dependency_complete_curriculum.sql',
);
const tempDirs: string[] = [];

function createDatabase() {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-dependency-0482-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');

  const setup = execSql(
    dbPath,
    `
      CREATE TABLE modelos_sessao (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        ordem_no_treinamento INTEGER,
        ativo INTEGER DEFAULT 1,
        deleted_at TEXT
      );

      CREATE TABLE treinamentos_planejados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        empresa_id INTEGER NOT NULL,
        qualificacao_tipo_id INTEGER NOT NULL,
        planejamento_origem TEXT,
        planejamento_status TEXT,
        planejamento_snapshot_json TEXT,
        updated_at TEXT,
        deleted_at TEXT
      );

      INSERT INTO modelos_sessao
        (id, empresa_id, qualificacao_tipo_id, ordem_no_treinamento, ativo)
      VALUES
        (117, 6, 106, 2, 1),
        (111, 6, 106, 1, 1),
        (119, 6, 106, 3, 1),
        (999, 7, 106, 1, 1),
        (120, 6, 106, 4, 0);

      INSERT INTO treinamentos_planejados (
        id, empresa_id, qualificacao_tipo_id, planejamento_origem,
        planejamento_status, planejamento_snapshot_json, updated_at
      ) VALUES (
        10, 6, 106, 'SIMULADOR_QUINZENA', 'PROPOSTO',
        json_object(
          'generated_by', 'TRAINING_DEPENDENCY',
          'participants', json_array(json_object('session_model_ids', json_array(111)))
        ),
        datetime('now')
      );

      INSERT INTO treinamentos_planejados (
        id, empresa_id, qualificacao_tipo_id, planejamento_origem,
        planejamento_status, planejamento_snapshot_json, updated_at
      ) VALUES (
        11, 6, 106, 'SIMULADOR_QUINZENA', 'REALIZADO',
        json_object(
          'generated_by', 'TRAINING_DEPENDENCY',
          'participants', json_array(json_object('session_model_ids', json_array(111)))
        ),
        datetime('now')
      );
    `,
  );
  expect(setup.code, setup.stderr).toBe(0);

  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  const applied = execSql(dbPath, migration);
  expect(applied.code, applied.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0482 training dependency complete curriculum', () => {
  it('enriches only open dependency seeds with every active current model in curricular order', () => {
    const dbPath = createDatabase();

    const rows = querySql<{
      id: number;
      strategy: string | null;
      total: number | null;
      models: string | null;
      participant_models: string | null;
    }>(
      dbPath,
      `SELECT id,
              json_extract(planejamento_snapshot_json, '$.materialization_strategy') AS strategy,
              json_extract(planejamento_snapshot_json, '$.curriculum_total_sessions') AS total,
              json_extract(planejamento_snapshot_json, '$.curriculum_model_ids') AS models,
              json_extract(planejamento_snapshot_json, '$.participants[0].session_model_ids') AS participant_models
         FROM treinamentos_planejados
        ORDER BY id;`,
    );

    expect(rows[0]).toMatchObject({
      id: 10,
      strategy: 'TRAINING_PLAN_REQUIRED',
      total: 3,
      models: '[111,117,119]',
      participant_models: '[111,117,119]',
    });
    expect(rows[1]).toMatchObject({
      id: 11,
      strategy: null,
      total: null,
      models: null,
      participant_models: '[111]',
    });
  });

  it('enriches future dependency seeds through the insert trigger without crossing tenants', () => {
    const dbPath = createDatabase();

    const inserted = execSql(
      dbPath,
      `INSERT INTO treinamentos_planejados (
         empresa_id, qualificacao_tipo_id, planejamento_origem,
         planejamento_status, planejamento_snapshot_json, updated_at
       ) VALUES (
         6, 106, 'SIMULADOR_QUINZENA', 'PROPOSTO',
         json_object(
           'generated_by', 'TRAINING_DEPENDENCY',
           'participants', json_array(json_object('session_model_ids', json_array(111)))
         ),
         datetime('now')
       );`,
    );
    expect(inserted.code, inserted.stderr).toBe(0);

    const row = querySql<{ models: string; total: number; strategy: string }>(
      dbPath,
      `SELECT
         json_extract(planejamento_snapshot_json, '$.participants[0].session_model_ids') AS models,
         json_extract(planejamento_snapshot_json, '$.curriculum_total_sessions') AS total,
         json_extract(planejamento_snapshot_json, '$.materialization_strategy') AS strategy
       FROM treinamentos_planejados
       WHERE id = (SELECT MAX(id) FROM treinamentos_planejados);`,
    )[0];

    expect(row).toEqual({
      models: '[111,117,119]',
      total: 3,
      strategy: 'TRAINING_PLAN_REQUIRED',
    });
  });
});
