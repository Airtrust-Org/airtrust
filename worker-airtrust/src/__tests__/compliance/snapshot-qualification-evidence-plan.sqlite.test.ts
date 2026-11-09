import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildQualificationEvidenceSql } from '../../services/training-compliance-snapshot-builder';
import {
  trainingComplianceHistoricalModalitySql,
  trainingComplianceHistoryIdentitySql,
} from '../../services/training-compliance-history-identity';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};

// Reference: the identity join as it was before #2078 (per-row scan of the
// tenant types through an expression on both sides of the equality).
function legacyIdentity(tipoCol: string) {
  const joins = `
    LEFT JOIN qualificacoes_tipos qt_history_id
      ON qt_history_id.id = qh.${tipoCol}
     AND qt_history_id.empresa_id = f.empresa_id
     AND qt_history_id.deleted_at IS NULL
     AND COALESCE(qt_history_id.ativo, 1) = 1
    LEFT JOIN qualificacoes_tipos qt_history_code
      ON qt_history_code.empresa_id = f.empresa_id
     AND qt_history_code.deleted_at IS NULL
     AND COALESCE(qt_history_code.ativo, 1) = 1
     AND UPPER(TRIM(COALESCE(qt_history_code.codigo,''))) =
         UPPER(TRIM(COALESCE(qh.qualificacao_codigo,'')))`;
  return { cteSql: '', joins, resolved: `COALESCE(qt_history_id.id, qt_history_code.id, qh.${tipoCol})` };
}

type Identity = { cteSql: string; joins: string; resolved: string };

// Reference: the single-block query as it was before #2078.
function legacySql(identity: Identity, modality: string) {
  return `SELECT qh.id, qh.funcionario_id, ${identity.resolved} AS tipo_id,
           qh.data_conclusao AS data_realizacao, qh.data_vencimento AS data_vencimento,
           ${modality} AS modalidade, qh.perfil_competencia AS perfil_competencia
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      ${identity.joins}
     WHERE qh.empresa_id = ? AND qh.deleted_at IS NULL
       AND NOT (UPPER(COALESCE(qh.status, '')) IN ('CANCELADA','CANCELADO'))
       AND NOT (UPPER(COALESCE(qh.status, '')) IN ('PLANEJADA','PLANEJADO'))
     ORDER BY qh.funcionario_id, ${identity.resolved},
              datetime(COALESCE(qh.data_conclusao, qh.updated_at, qh.data_vencimento)) DESC, qh.id DESC`;
}

function newSql(next: { cteSql: string; joins: string; resolvedTypeSql: string }, modality: string) {
  return buildQualificationEvidenceSql({
    typeIdentityCte: next.cteSql,
    typeIdentityJoins: next.joins,
    resolvedTipoSelect: next.resolvedTypeSql,
    modalitySelect: modality,
    profileSql: { select: 'qh.perfil_competencia', joins: '' },
    dataCol: 'data_conclusao',
    vencSelect: 'qh.data_vencimento',
    updatedExpr: 'qh.updated_at',
    empresaExpr: 'qh.empresa_id = ?',
    deletedExpr: 'AND qh.deleted_at IS NULL',
    statusExpr: "UPPER(COALESCE(qh.status, ''))",
  });
}

function seed(db: DatabaseSyncType, historyRows = 40) {
  db.exec(`
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, deleted_at TEXT);
    CREATE TABLE qualificacoes_tipos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, tipo TEXT, categoria TEXT,
      ativo INTEGER, deleted_at TEXT);
    CREATE INDEX idx_qt_empresa ON qualificacoes_tipos(empresa_id);
    CREATE TABLE qualificacoes_historico (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER,
      qualificacao_codigo TEXT, formato_codigo TEXT, data_conclusao TEXT, data_vencimento TEXT,
      updated_at TEXT, status TEXT, deleted_at TEXT, perfil_competencia TEXT);
    CREATE INDEX idx_qh_empresa_deleted ON qualificacoes_historico(empresa_id, deleted_at);
    INSERT INTO funcionarios VALUES (1,6,NULL),(2,6,NULL),(3,7,NULL),(4,6,NULL);
    -- tenant 6 types
    INSERT INTO qualificacoes_tipos VALUES
      (10,6,'CRM','TREINAMENTO','TREINAMENTO EAD',1,NULL),
      (11,6,' crm ','PRESENCIAL','X',1,NULL),            -- same normalized code (duplicate match)
      (12,6,'FOD',NULL,'PRATICO',1,NULL),
      (13,6,'NR26','EAD','Y',0,NULL),                    -- inactive
      (14,6,'DEL','EAD','Y',1,'2026-01-01'),             -- deleted
      (15,6,'',NULL,NULL,1,NULL),                        -- empty code matches NULL history code
      (16,6,NULL,NULL,NULL,NULL,NULL);                   -- NULL code, NULL ativo
    -- tenant 7 types reuse the same codes with other ids
    INSERT INTO qualificacoes_tipos VALUES
      (20,7,'CRM','EAD','Z',1,NULL),
      (21,7,'FOD','PRESENCIAL','Z',1,NULL);
    -- global-looking type with NULL tenant, same code
    INSERT INTO qualificacoes_tipos VALUES (30,NULL,'CRM','EAD','Z',1,NULL);
  `);
  const ins = db.prepare(`INSERT INTO qualificacoes_historico
    (id,empresa_id,funcionario_id,qualificacao_id,qualificacao_codigo,formato_codigo,data_conclusao,data_vencimento,updated_at,status,deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const codes = ['CRM', 'crm', 'FOD', 'NR26', 'DEL', '', null, 'UNKNOWN', ' fod '];
  const ids: Array<number | null> = [10, 12, 999, null, 11, 20, 15, 16, 13, 14];
  for (let i = 1; i <= historyRows; i++) {
    ins.run(
      i, i % 9 === 0 ? 7 : 6, [1, 2, 3, 4][i % 4], ids[i % ids.length]!, codes[i % codes.length]!,
      i % 5 === 0 ? 'PRESENCIAL' : i % 7 === 0 ? 'NAO_CLASSIFICADO' : null,
      `2026-0${1 + (i % 9)}-1${i % 9}`, `2027-0${1 + (i % 9)}-1${i % 9}`, `2026-10-0${1 + (i % 9)}`,
      i % 13 === 0 ? 'CANCELADA' : i % 17 === 0 ? 'planejado' : 'CONCLUIDO', i % 11 === 0 ? '2026-02-02' : null,
    );
  }
}

describe('snapshot qualification evidence: canonical code join (#2078)', () => {
  const modality = trainingComplianceHistoricalModalitySql(true, true, true, true);

  for (const tipoCol of ['qualificacao_id']) {
    it('returns exactly the same rows and order as the legacy per-row scan join', () => {
      const db = new DatabaseSync(':memory:');
      try {
        seed(db);
        const next = trainingComplianceHistoryIdentitySql(tipoCol, true, true, ['tipo', 'categoria']);
        const legacy = legacyIdentity(tipoCol);
        for (const empresa of [6, 7, 99]) {
          const oldRows = db.prepare(legacySql(legacy, modality)).all(empresa);
          const newRows = db
            .prepare(newSql(next, modality))
            .all(empresa);
          expect(newRows).toEqual(oldRows);
          if (empresa === 6) expect(oldRows.length).toBeGreaterThan(20);
        }
        // Precedence is exercised: id match, code match, legacy-id fallback, duplicate code fan-out.
        const rows = db
          .prepare(newSql(next, modality))
          .all(6) as Array<{ id: number; tipo_id: number }>;
        const tipos = new Set(rows.map((r) => r.tipo_id));
        expect(tipos.has(10)).toBe(true);
        expect(tipos.has(11)).toBe(true);
        expect(tipos.has(999)).toBe(true);
        expect(rows.length).toBeGreaterThan(new Set(rows.map((r) => r.id)).size - 1);
      } finally {
        db.close();
      }
    });
  }

  it('keeps equivalence without the ativo column or the code column', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER);
        CREATE TABLE qualificacoes_tipos (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, tipo TEXT, categoria TEXT, deleted_at TEXT);
        CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER, qualificacao_codigo TEXT);
        INSERT INTO funcionarios VALUES (1,6);
        INSERT INTO qualificacoes_tipos VALUES (1,6,'A','EAD','c',NULL),(2,6,'B','EAD','c',NULL);
        INSERT INTO qualificacoes_historico VALUES (1,6,1,NULL,'b'),(2,6,1,1,'zzz'),(3,6,1,77,NULL);
      `);
      const noActive = trainingComplianceHistoryIdentitySql('qualificacao_id', true, false, ['tipo', 'categoria']);
      const rows = db
        .prepare(`${noActive.cteSql ? `WITH ${noActive.cteSql}` : ''} SELECT qh.id, ${noActive.resolvedTypeSql} AS t FROM qualificacoes_historico qh JOIN funcionarios f ON f.id=qh.funcionario_id ${noActive.joins} ORDER BY qh.id`)
        .all();
      expect(rows).toEqual([{ id: 1, t: 2 }, { id: 2, t: 1 }, { id: 3, t: 77 }]);
      const noCode = trainingComplianceHistoryIdentitySql('qualificacao_id', false, true);
      expect(noCode.cteSql).toBe('');
      expect(noCode.resolvedTypeSql).not.toContain('qt_history_code');
    } finally {
      db.close();
    }
  });

  it('plans the code join through a materialized index, not a per-row scan of the types table', () => {
    const db = new DatabaseSync(':memory:');
    try {
      seed(db);
      const next = trainingComplianceHistoryIdentitySql('qualificacao_id', true, true, ['tipo', 'categoria']);
      const sql = newSql(next, modality);
      const plan = (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(6) as Array<{ detail: string }>).map((r) => r.detail);
      const legacyPlan = (db.prepare(`EXPLAIN QUERY PLAN ${legacySql(legacyIdentity('qualificacao_id'), modality)}`).all(6) as Array<{ detail: string }>).map((r) => r.detail);
      // The old plan searched qualificacoes_tipos once per history row.
      expect(legacyPlan.some((d) => /SEARCH qt_history_code USING INDEX idx_qt_empresa/.test(d))).toBe(true);
      // New plan: materialized CTE scanned once (no correlated per-row scan) and probed by key.
      expect(plan.some((d) => /MATERIALIZE qt_history_code_idx/.test(d))).toBe(true);
      expect(plan.some((d) => /SEARCH qt_history_code USING AUTOMATIC COVERING INDEX/.test(d))).toBe(true);
      expect(plan.some((d) => /^SCAN qt_history_code\b/.test(d))).toBe(false);
      expect(plan.some((d) => /SEARCH qt_history_code USING INDEX idx_qt_empresa/.test(d))).toBe(false);
    } finally {
      db.close();
    }
  });
});
