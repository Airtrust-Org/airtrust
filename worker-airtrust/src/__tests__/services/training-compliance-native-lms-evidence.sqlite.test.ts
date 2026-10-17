import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { nativeLmsComplianceEvidencePredicate } from '../../services/training-compliance-native-lms-evidence';

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
