import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sqlPath = 'worker-airtrust/migrations/0542_lms_scorm_formative_assessment_policy.sql';
const changePath = 'worker-airtrust/schema-v2/changes/0542_lms_scorm_formative_assessment_policy.sql';
const planPath = 'worker-airtrust/schema-v2/plans/lms-scorm-formative-assessment-0542.md';
const manifestPath = 'worker-airtrust/schema-v2/lms-scorm-formative-assessment-0542.json';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

describe('Schema V2 0542 explicit formative SCORM assessment policy', () => {
  it('pins the migration, reviewed plan and immutable hashes', () => {
    const sql = read(sqlPath);
    const plan = read(planPath);
    const manifest = JSON.parse(read(manifestPath));
    expect(read(changePath)).toBe(sql);
    expect(manifest).toMatchObject({
      changeId: 'lms-scorm-formative-assessment-0542',
      baselineId: 'production-d1-baseline-v2-20260714',
      filePath: changePath,
      fileHash: hash(sql),
      planPath,
      planHash: hash(plan),
    });
  });

  it('migrates only tenant-6 CRM directors to formative without altering the rest', () => {
    const python = `
import sqlite3,sys
sql=open(sys.argv[1],encoding='utf-8').read()
db=sqlite3.connect(':memory:')
db.executescript("""CREATE TABLE lms_cursos (
id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
titulo TEXT NOT NULL,tipo_conteudo TEXT NOT NULL,
deleted_at TEXT,scorm_mastery_score INTEGER,updated_at TEXT);
CREATE TABLE lms_matriculas (
id INTEGER PRIMARY KEY,empresa_id INTEGER,curso_id INTEGER,status TEXT);
INSERT INTO lms_cursos (id,empresa_id,titulo,tipo_conteudo,scorm_mastery_score) VALUES
(1,6,'CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','scorm',70),
(2,6,'NR-11','scorm',70),
(3,7,'CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','scorm',70);
INSERT INTO lms_matriculas VALUES (863,6,1,'EM_ANDAMENTO');
""")
db.executescript(sql)
rows=db.execute("SELECT id,empresa_id,scorm_assessment_policy,scorm_mastery_score FROM lms_cursos ORDER BY id").fetchall()
assert rows == [(1,6,'FORMATIVE',None),(2,6,'SCORED',70),(3,7,'SCORED',70)], rows
assert db.execute("SELECT status FROM lms_matriculas WHERE id=863").fetchone()[0]=='EM_ANDAMENTO'
try:
 db.execute("INSERT INTO lms_cursos (id,empresa_id,titulo,tipo_conteudo,scorm_assessment_policy) VALUES (4,6,'Invalid','scorm','UNKNOWN')")
except sqlite3.IntegrityError:
 pass
else:
 raise AssertionError('SCORM policy must be CHECK-constrained')
`;
    const result = spawnSync('python3', ['-c', python, join(ROOT, sqlPath)], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  });

  it('connects staging and production governed checks without legacy bypass', () => {
    const prod = read('.github/workflows/apply-schema-change-v2.yml');
    const staging = read('.github/workflows/staging-d1-schema-change.yml');
    const runner = read('scripts/staging/apply-approved-migration-with-recovery-point.sh');
    expect(prod).toContain("inputs.change_id == 'lms-scorm-formative-assessment-0542'");
    expect(prod).toContain('validate-0542-production-preflight.sh');
    expect(prod).toContain('validate-0542-production-postconditions.sh');
    expect(staging).toContain('0542_lms_scorm_formative_assessment_policy.sql');
    expect(runner).toContain('validate-0542-preflight.sh');
    expect(runner).toContain('validate-0542-postconditions.sh');
    expect(read('scripts/schema-v2/validate-0542-production-preflight.sh')).toContain('incident-matricula-course-863');
  });
});
