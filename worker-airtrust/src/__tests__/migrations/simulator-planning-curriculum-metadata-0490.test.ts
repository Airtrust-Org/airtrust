import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const MIGRATION_PATH = join(
  ROOT,
  'worker-airtrust/migrations/0490_simulator_planning_curriculum_metadata.sql',
);
const migration = readFileSync(MIGRATION_PATH, 'utf8');
const tempDirs: string[] = [];

const AW_CODES = [
  'A139-P-01/04-C1', 'A139-P-01/04-C2', 'A139-P-01/04-C3',
  'A139-P-02/04-C1-OFFSHORE', 'A139-P-02/04-C2-OFFSHORE', 'A139-P-02/04-C3-OFFSHORE',
  'A139-P-03/04-C1-IFR-LOFT', 'A139-P-03/04-C2-IFR-LOFT', 'A139-P-03/04-C3-IFR-LOFT',
  'A139-P-04/04-C1-CHECK', 'A139-P-04/04-C2-CHECK', 'A139-P-04/04-C3-CHECK',
  'A139-S-01/02-C1', 'A139-S-01/02-C2', 'A139-S-01/02-C3',
  'A139-S-02/02-C1', 'A139-S-02/02-C2', 'A139-S-02/02-C3',
] as const;

function s76Codes(denominator: '03' | '04') {
  return [
    `S76-P-01/${denominator}-C1`, `S76-P-01/${denominator}-C2`, `S76-P-01/${denominator}-C3`,
    `S76-P-02/${denominator}-C1`, `S76-P-02/${denominator}-C2`, `S76-P-02/${denominator}-C3`,
    'SK76-P-CHECK',
  ];
}

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function createDatabase(denominator: '03' | '04' = '04') {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-simulator-curriculum-0490-'));
  tempDirs.push(dir);
  const dbPath = join(dir, 'test.sqlite');
  const setup = execSql(dbPath, `
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, deleted_at TEXT
    );
    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER,
      duracao_estimada INTEGER, ordem_no_treinamento INTEGER, gera_qualificacao INTEGER DEFAULT 0,
      ativo INTEGER DEFAULT 1, deleted_at TEXT, updated_at TEXT
    );
    CREATE TABLE modelos_sessao_versionamento (
      modelo_id INTEGER NOT NULL, empresa_id INTEGER NOT NULL, codigo_canonico TEXT NOT NULL, is_current INTEGER NOT NULL
    );
    CREATE TABLE treinamentos_planejados (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, qualificacao_tipo_id INTEGER NOT NULL,
      planejamento_origem TEXT, planejamento_status TEXT, planejamento_snapshot_json TEXT,
      deleted_at TEXT, updated_at TEXT
    );
    INSERT INTO qualificacoes_tipos VALUES
      (33,6,'G1',NULL),(106,6,'G1-SEM',NULL),(40,6,'G2',NULL),
      (900,7,'G1',NULL);
  `);
  expect(setup.code, setup.stderr).toBe(0);

  let id = 100;
  const rows = [...AW_CODES, ...s76Codes(denominator)];
  for (const code of rows) {
    id += 1;
    let qualificationId: number | null = null;
    let generates = 0;
    if (code.startsWith('A139-P-04/04-')) { qualificationId = 33; generates = 1; }
    if (code.startsWith('A139-S-02/02-')) { qualificationId = 106; generates = 1; }
    if (code === 'SK76-P-CHECK') { qualificationId = 40; generates = 1; }
    const inserted = execSql(dbPath, `
      INSERT INTO modelos_sessao
        (id,empresa_id,qualificacao_tipo_id,duracao_estimada,ordem_no_treinamento,gera_qualificacao,ativo)
      VALUES (${id},6,${qualificationId ?? 'NULL'},NULL,NULL,${generates},1);
      INSERT INTO modelos_sessao_versionamento(modelo_id,empresa_id,codigo_canonico,is_current)
      VALUES (${id},6,${sqlQuote(code)},1);
    `);
    expect(inserted.code, inserted.stderr).toBe(0);
  }

  const seed = execSql(dbPath, `
    INSERT INTO treinamentos_planejados
      (id,empresa_id,qualificacao_tipo_id,planejamento_origem,planejamento_status,planejamento_snapshot_json,updated_at)
    VALUES (
      1,6,106,'SIMULADOR_QUINZENA','PROPOSTO',
      json_object(
        'generated_by','TRAINING_DEPENDENCY',
        'curriculum_model_ids',json_array(999999),
        'participants',json_array(json_object('session_model_ids',json_array(999999)))
      ),datetime('now')
    );
  `);
  expect(seed.code, seed.stderr).toBe(0);
  return dbPath;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe('0490 simulator planning curriculum metadata', () => {
  it('restores 120-minute durations and configures only the approved C2 curriculum', () => {
    const dbPath = createDatabase('04');
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);

    expect(querySql<{ n: number }>(dbPath, 'SELECT COUNT(*) AS n FROM modelos_sessao WHERE empresa_id=6 AND duracao_estimada=120;')[0].n).toBe(25);

    const ordered = querySql<{ qualification: string; code: string; sequence: number }>(dbPath, `
      SELECT qt.codigo AS qualification, v.codigo_canonico AS code, ms.ordem_no_treinamento AS sequence
        FROM modelos_sessao ms
        JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
        JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.empresa_id=ms.empresa_id AND v.is_current=1
       WHERE ms.empresa_id=6 AND ms.ordem_no_treinamento IS NOT NULL
       ORDER BY CASE qt.codigo WHEN 'G1' THEN 1 WHEN 'G1-SEM' THEN 2 ELSE 3 END, ms.ordem_no_treinamento;
    `);
    expect(ordered).toEqual([
      { qualification: 'G1', code: 'A139-P-01/04-C2', sequence: 1 },
      { qualification: 'G1', code: 'A139-P-02/04-C2-OFFSHORE', sequence: 2 },
      { qualification: 'G1', code: 'A139-P-03/04-C2-IFR-LOFT', sequence: 3 },
      { qualification: 'G1', code: 'A139-P-04/04-C2-CHECK', sequence: 4 },
      { qualification: 'G1-SEM', code: 'A139-S-01/02-C2', sequence: 1 },
      { qualification: 'G1-SEM', code: 'A139-S-02/02-C2', sequence: 2 },
      { qualification: 'G2', code: 'S76-P-01/04-C2', sequence: 1 },
      { qualification: 'G2', code: 'S76-P-02/04-C2', sequence: 2 },
      { qualification: 'G2', code: 'SK76-P-CHECK', sequence: 3 },
    ]);

    const generationOnly = querySql<{ code: string; qualification: string; sequence: number | null }>(dbPath, `
      SELECT v.codigo_canonico AS code, qt.codigo AS qualification, ms.ordem_no_treinamento AS sequence
        FROM modelos_sessao ms
        JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
        JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.empresa_id=ms.empresa_id
       WHERE v.codigo_canonico IN (
         'A139-P-04/04-C1-CHECK','A139-P-04/04-C3-CHECK','A139-S-02/02-C1','A139-S-02/02-C3'
       ) ORDER BY v.codigo_canonico;
    `);
    expect(generationOnly.every((row) => row.sequence === null)).toBe(true);
    expect(generationOnly.map((row) => row.qualification).sort()).toEqual(['G1','G1','G1-SEM','G1-SEM'].sort());
  });

  it('repairs dependency snapshots and keeps future snapshots limited to ordered curriculum members', () => {
    const dbPath = createDatabase('04');
    expect(execSql(dbPath, migration).code).toBe(0);

    const existing = querySql<{ models: string; total: number; participant: string }>(dbPath, `
      SELECT json_extract(planejamento_snapshot_json,'$.curriculum_model_ids') AS models,
             json_extract(planejamento_snapshot_json,'$.curriculum_total_sessions') AS total,
             json_extract(planejamento_snapshot_json,'$.participants[0].session_model_ids') AS participant
        FROM treinamentos_planejados WHERE id=1;
    `)[0];
    expect(existing.total).toBe(2);
    expect(existing.models).toBe(existing.participant);

    const inserted = execSql(dbPath, `
      INSERT INTO treinamentos_planejados
        (id,empresa_id,qualificacao_tipo_id,planejamento_origem,planejamento_status,planejamento_snapshot_json,updated_at)
      VALUES (2,6,33,'SIMULADOR_QUINZENA','PROPOSTO',
        json_object('generated_by','TRAINING_DEPENDENCY','participants',json_array(json_object('session_model_ids',json_array()))),
        datetime('now'));
    `);
    expect(inserted.code, inserted.stderr).toBe(0);
    const future = querySql<{ total: number; models: string }>(dbPath, `
      SELECT json_extract(planejamento_snapshot_json,'$.curriculum_total_sessions') AS total,
             json_extract(planejamento_snapshot_json,'$.curriculum_model_ids') AS models
        FROM treinamentos_planejados WHERE id=2;
    `)[0];
    expect(future.total).toBe(4);
    expect(JSON.parse(future.models)).toHaveLength(4);
  });

  it('supports the governed S-76 /03 naming state after 0459', () => {
    const dbPath = createDatabase('03');
    const applied = execSql(dbPath, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const g2 = querySql<{ code: string; sequence: number }>(dbPath, `
      SELECT v.codigo_canonico AS code, ms.ordem_no_treinamento AS sequence
        FROM modelos_sessao ms
        JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.empresa_id=ms.empresa_id
        JOIN qualificacoes_tipos qt ON qt.id=ms.qualificacao_tipo_id AND qt.empresa_id=ms.empresa_id
       WHERE qt.codigo='G2' AND ms.ordem_no_treinamento IS NOT NULL ORDER BY ms.ordem_no_treinamento;
    `);
    expect(g2).toEqual([
      { code: 'S76-P-01/03-C2', sequence: 1 },
      { code: 'S76-P-02/03-C2', sequence: 2 },
      { code: 'SK76-P-CHECK', sequence: 3 },
    ]);
  });

  it('fails closed on mixed S-76 /04 and /03 identity state', () => {
    const dbPath = createDatabase('04');
    expect(execSql(dbPath, `UPDATE modelos_sessao_versionamento SET codigo_canonico='S76-P-01/03-C1' WHERE codigo_canonico='S76-P-01/04-C1';`).code).toBe(0);
    const applied = execSql(dbPath, migration);
    expect(applied.code).not.toBe(0);
    expect(applied.stderr).toContain('0490 preflight: estado S-76 /04-/03 misto ou incompleto');
  });

  it('fails closed instead of overwriting a conflicting recurrent duration', () => {
    const dbPath = createDatabase('04');
    expect(execSql(dbPath, `UPDATE modelos_sessao SET duracao_estimada=90 WHERE id=(SELECT modelo_id FROM modelos_sessao_versionamento WHERE codigo_canonico='A139-P-01/04-C2');`).code).toBe(0);
    const applied = execSql(dbPath, migration);
    expect(applied.code).not.toBe(0);
    expect(applied.stderr).toContain('0490 preflight: duracao recorrente existente diverge de 120 minutos');
  });
});
