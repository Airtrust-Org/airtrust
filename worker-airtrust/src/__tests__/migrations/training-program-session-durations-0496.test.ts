import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { execSql, querySql } from '../helpers/sqlite-batch-runner';

const ROOT = join(__dirname, '../../../..');
const migrationPath = join(ROOT, 'worker-airtrust/migrations/0496_training_program_session_durations.sql');
const changePath = join(ROOT, 'worker-airtrust/schema-v2/changes/0496_training_program_session_durations.sql');
const planPath = join(ROOT, 'worker-airtrust/schema-v2/plans/training-program-session-durations-0496.md');
const manifestPath = join(ROOT, 'worker-airtrust/schema-v2/training-program-session-durations-0496.json');
const migration = readFileSync(migrationPath, 'utf8');
const tempDirs: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function createDatabase(conflictMinutes?: number) {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-training-duration-0496-'));
  tempDirs.push(dir);
  const db = join(dir, 'test.sqlite');
  expect(execSql(db, `
    CREATE TABLE treinamento_programas(id INTEGER PRIMARY KEY,empresa_id INTEGER,codigo TEXT,deleted_at TEXT);
    CREATE TABLE treinamento_programa_modelos(id INTEGER PRIMARY KEY,empresa_id INTEGER,programa_id INTEGER,ciclo INTEGER,codigo_canonico TEXT,deleted_at TEXT);
    CREATE TABLE modelos_sessao(id INTEGER PRIMARY KEY,empresa_id INTEGER,duracao_estimada INTEGER,ativo INTEGER,deleted_at TEXT,updated_at TEXT);
    CREATE TABLE modelos_sessao_versionamento(empresa_id INTEGER,modelo_id INTEGER,codigo_canonico TEXT,is_current INTEGER);
    INSERT INTO treinamento_programas VALUES(1,6,'G1:INICIAL',NULL),(2,6,'G2:INICIAL',NULL),(3,6,'G2-SEM:SEMESTRAL',NULL);
  `).code).toBe(0);
  let id = 100;
  const entries: Array<[number,string]> = [];
  for (let n=1;n<=12;n++) entries.push([1,`A139-I-${String(n).padStart(2,'0')}/12`]);
  for (let n=1;n<=12;n++) entries.push([2,`SK76-I-${String(n).padStart(2,'0')}/12`]);
  entries.push([3,'SK76-S-01/02'],[3,'SK76-S-02/02']);
  for (const [programId, code] of entries) {
    id += 1;
    const minutes = code === 'A139-I-12/12' ? 120 : (conflictMinutes && code === 'A139-I-01/12' ? conflictMinutes : 'NULL');
    expect(execSql(db, `
      INSERT INTO modelos_sessao VALUES(${id},6,${minutes},1,NULL,NULL);
      INSERT INTO modelos_sessao_versionamento VALUES(6,${id},'${code}',1);
      INSERT INTO treinamento_programa_modelos(empresa_id,programa_id,ciclo,codigo_canonico,deleted_at) VALUES(6,${programId},1,'${code}',NULL);
    `).code).toBe(0);
  }
  return db;
}

afterEach(() => { while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true }); });

describe('0496 training program session durations', () => {
  it('keeps reviewed Schema V2 artifacts byte-identical with pinned hashes', () => {
    const change = readFileSync(changePath, 'utf8');
    const plan = readFileSync(planPath, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string,string>;
    expect(change).toBe(migration);
    expect(manifest).toMatchObject({
      changeId: 'training-program-session-durations-0496',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: 'worker-airtrust/schema-v2/changes/0496_training_program_session_durations.sql',
      planPath: 'worker-airtrust/schema-v2/plans/training-program-session-durations-0496.md',
    });
    expect(manifest.fileHash).toBe(sha256(change));
    expect(manifest.planHash).toBe(sha256(plan));
  });

  it('fills all missing target durations to 120 minutes and reaches 24h/24h/4h', () => {
    const db = createDatabase();
    const applied = execSql(db, migration);
    expect(applied.code, applied.stderr).toBe(0);
    const rows = querySql<{code:string;sessions:number;minutes:number;invalid:number}>(db, `
      SELECT p.codigo code,COUNT(*) sessions,SUM(ms.duracao_estimada) minutes,
        SUM(CASE WHEN ms.duracao_estimada<>120 THEN 1 ELSE 0 END) invalid
      FROM treinamento_programa_modelos pm JOIN treinamento_programas p ON p.id=pm.programa_id
      JOIN modelos_sessao_versionamento msv ON msv.codigo_canonico=pm.codigo_canonico AND msv.empresa_id=pm.empresa_id AND msv.is_current=1
      JOIN modelos_sessao ms ON ms.id=msv.modelo_id AND ms.empresa_id=msv.empresa_id
      WHERE pm.empresa_id=6 GROUP BY p.codigo ORDER BY p.codigo;`);
    expect(rows).toEqual([
      { code:'G1:INICIAL', sessions:12, minutes:1440, invalid:0 },
      { code:'G2-SEM:SEMESTRAL', sessions:2, minutes:240, invalid:0 },
      { code:'G2:INICIAL', sessions:12, minutes:1440, invalid:0 },
    ]);
  });

  it('fails closed instead of overwriting a conflicting positive duration', () => {
    const db = createDatabase(90);
    const applied = execSql(db, migration);
    expect(applied.code).not.toBe(0);
    expect(applied.stderr).toContain('0496 preflight: conflicting positive target duration');
    const row = querySql<{minutes:number}>(db, `SELECT duracao_estimada minutes FROM modelos_sessao ms JOIN modelos_sessao_versionamento msv ON msv.modelo_id=ms.id WHERE msv.codigo_canonico='A139-I-01/12' AND msv.is_current=1;`)[0];
    expect(row.minutes).toBe(90);
  });
});
