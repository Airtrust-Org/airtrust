import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import {
  nativeLmsComplianceEvidencePredicate,
  isNativeLmsComplianceCourse,
  hasLiveNativeLmsActivationTable,
} from '../../services/training-compliance-native-lms-evidence';
import { reconcileTrainingComplianceRuleEnrollment } from '../../services/training-compliance-rule-enrollment';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (filename: string): DatabaseSync;
};

function fixture(markerTable = true, historyTable = true) {
  const db = new NodeDatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      qualificacao_tipo_id INTEGER, tipo_conteudo TEXT
    );
    CREATE TABLE lms_matriculas (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, curso_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL, status TEXT NOT NULL,
      qualificacao_historico_id INTEGER
    );
    INSERT INTO lms_cursos VALUES (10,1,100,'native'),(11,1,100,'scorm'),(12,1,100,'scorm'),(20,2,100,'native');
    INSERT INTO lms_matriculas VALUES
      (1,1,10,7,'CONCLUIDO',NULL),
      (2,1,10,7,'CONCLUIDO',101),
      (3,1,10,7,'CONCLUIDO',102),
      (4,1,10,7,'CONCLUIDO',103),
      (5,1,11,7,'CONCLUIDO',NULL),
      (6,1,12,7,'CONCLUIDO',NULL),
      (7,1,10,7,'EM_ANDAMENTO',NULL),
      (8,1,10,7,'CONCLUIDO',104),
      (9,1,10,7,'CONCLUIDO',105),
      (10,1,10,7,'CONCLUIDO',106),
      (20,2,20,8,'CONCLUIDO',101);
  `);
  if (markerTable) db.exec(`
    CREATE TABLE lms_native_catalog_activation (empresa_id INTEGER, curso_id INTEGER);
    INSERT INTO lms_native_catalog_activation VALUES (1,11);
  `);
  if (historyTable) db.exec(`
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      funcionario_id INTEGER NOT NULL, qualificacao_id INTEGER NOT NULL,
      status TEXT, deleted_at TEXT
    );
    INSERT INTO qualificacoes_historico VALUES
      (101,1,7,100,'CONCLUIDA',NULL),
      (102,1,7,100,'PLANEJADA',NULL),
      (103,2,7,100,'CONCLUIDA',NULL),
      (104,1,8,100,'CONCLUIDA',NULL),
      (105,1,7,999,'CONCLUIDA',NULL),
      (106,1,7,100,'CONCLUIDA','2026-10-17');
  `);
  const predicate = nativeLmsComplianceEvidencePredicate(markerTable, historyTable);
  const rows = db.prepare(`SELECT m.id FROM lms_matriculas m
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    WHERE m.empresa_id=1 AND ${predicate} ORDER BY m.id`).all() as {id: number}[];
  db.close();
  return rows.map(x=>x.id);
}

describe('Native completion evidence isolation in Training Compliance', () => {
  it('keeps the Compliance reader wired to the Native completion guard', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos.ts'), 'utf8');
    const reader = source.slice(source.indexOf('async function loadLmsEvidence('),
      source.indexOf('function latestEvidence(', source.indexOf('async function loadLmsEvidence(')));
    expect(reader).toContain("hasLiveNativeLmsActivationTable(db)");
    expect(reader).toContain('nativeLmsComplianceEvidencePredicate(');
    expect(reader).toContain('AND ${nativeCompletionScope}');
  });

  it('accepts only canonical linked qualification for physical and activated Native completions', () => {
    expect(fixture()).toEqual([2, 6, 7]);
  });

  it('cannot manufacture SCORM validity when marker schema exists but frontend feature flag is off', () => {
    expect(fixture(true, true)).not.toContain(5);
  });

  it('preserves ordinary SCORM historical rows without qualification links', () => {
    expect(fixture()).toContain(6);
  });

  it('rejects same-looking qualification from another tenant, employee, type, status or deleted history', () => {
    for (const id of [3,4,8,9,10]) expect(fixture()).not.toContain(id);
  });

  it('uses physical Native identity when activation table does not exist', () => {
    expect(fixture(false, true)).toEqual([2, 5, 6, 7]);
  });

  it('fails closed on Native completion if qualification history schema is absent', () => {
    expect(fixture(true, false)).toEqual([6,7]);
  });
});

describe('Native course admission for automatic Compliance enrollment', () => {
  function adapter(db: DatabaseSync) {
    const writes: string[] = [];
    const wrapper = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              async first() {
                return db.prepare(sql).get(...values as (string | number | null)[]);
              },
              async all() {
                return { results: db.prepare(sql).all(...values as (string | number | null)[]) };
              },
              async run() {
                writes.push(sql);
                throw new Error('NATIVE_COMPLIANCE_LEGACY_WRITE_DENIED');
              },
            };
          },
        };
      },
    } as unknown as D1Database;
    return { wrapper, writes };
  }

  it.each([
    ['native', false],
    ['scorm', true],
  ] as const)('refuses %s course before legacy auto-enrollment writes', async (type, activated) => {
    const db = new NodeDatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE lms_cursos(
        id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER,
        tipo_conteudo TEXT, ativo INTEGER, publicado INTEGER, deleted_at TEXT
      );
      CREATE TABLE lms_native_catalog_activation(empresa_id INTEGER, curso_id INTEGER);
    `);
    db.prepare('INSERT INTO lms_cursos VALUES(?,?,?,?,1,1,NULL)').run(39,6,100,type);
    if (activated) db.exec('INSERT INTO lms_native_catalog_activation VALUES(6,39)');
    const { wrapper, writes } = adapter(db);
    const result = await reconcileTrainingComplianceRuleEnrollment(
      wrapper,6,200,{} as never,{} as never,
      async () => ({
        rules: [{id:200,qualificacao_tipo_id:100,obrigatoriedade:'OBRIGATORIA',modalidade_requerida:'EAD'}],
        people: [{id:69,requisitos:[{regra_id:200,obrigatoriedade:'OBRIGATORIA',status_compliance:'NAO_REALIZADO'}]}],
      }),
    );
    expect(result.auto_enrollment_warning).toBe('LMS_COURSE_MAPPING_UNAVAILABLE');
    expect(result.auto_enrollment?.unavailable_course).toBe(1);
    expect(writes).toEqual([]);
    db.close();
  });

  it('rechecks marker schema live after migration instead of caching a false SCORM classification', async () => {
    const db = new NodeDatabaseSync(':memory:');
    const { wrapper } = adapter(db);
    expect(await hasLiveNativeLmsActivationTable(wrapper)).toBe(false);
    db.exec('CREATE TABLE lms_native_catalog_activation (empresa_id INTEGER, curso_id INTEGER)');
    db.exec('INSERT INTO lms_native_catalog_activation VALUES(6,39)');
    expect(await hasLiveNativeLmsActivationTable(wrapper)).toBe(true);
    expect(await isNativeLmsComplianceCourse(wrapper,6,39,'scorm')).toBe(true);
    db.close();
  });

  it('fails closed on activation lookup errors instead of writing through a SCORM fallback', async () => {
    const prepare = (sql: string) => ({
      bind: (...args: unknown[]) => ({
        all: async () => ({results: [{id:39,tipo_conteudo:'scorm'}]}),
        first: async () => sql.includes('sqlite_master') ? {found:1} : Promise.reject(new Error('D1 unavailable')),
        run: async () => { throw new Error('MUST_NOT_WRITE'); },
      }),
    });
    const db = {prepare} as unknown as D1Database;
    await expect(isNativeLmsComplianceCourse(db,6,39,'scorm'))
      .rejects.toThrow('D1 unavailable');
  });
});
