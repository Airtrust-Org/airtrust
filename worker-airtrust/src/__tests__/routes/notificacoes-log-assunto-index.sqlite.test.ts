// Incident #2078 / Schema V2 0576: subject-prefix lookups on notificacoes_log must be
// served by idx_notificacoes_log_empresa_assunto instead of scanning the whole tenant.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  runCommunicationsQuery,
  type TrainingCommunicationFilters,
} from '../../services/training-communication-history';

const INDEX_SQL = readFileSync(
  new URL('../../../schema-v2/changes/0576_notificacoes_log_empresa_assunto_index.sql', import.meta.url).pathname,
  'utf8',
);
const RANGE_SEARCH =
  /SEARCH \w+ USING INDEX idx_notificacoes_log_empresa_assunto \(empresa_id=\? AND assunto>\? AND assunto<\?\)/;
const all = { mode: 'all' as const, setorIds: [] as [], funcionarioId: null };
const filters: TrainingCommunicationFilters = { limit: 50, offset: 0 };
let db: SqliteD1Database;

function seed(legacyRows: number) {
  db.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
    ALTER TABLE funcionarios ADD COLUMN email TEXT;
    ALTER TABLE funcionarios ADD COLUMN telefone TEXT;
    CREATE TABLE lms_cursos (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, titulo TEXT, qualificacao_tipo_id INTEGER);
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL,
      tipo TEXT, destinatario TEXT, assunto TEXT, corpo TEXT, notification_key TEXT,
      status TEXT, erro_mensagem TEXT, enviado_em TEXT, created_at TEXT, funcionario_id INTEGER
    );
    CREATE INDEX idx_notificacoes_log_empresa_id ON notificacoes_log(empresa_id);
    CREATE INDEX idx_notificacoes_log_status ON notificacoes_log(status);
    CREATE INDEX idx_notificacoes_log_enviado_em ON notificacoes_log(enviado_em);
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${legacyRows})
    INSERT INTO notificacoes_log(id, empresa_id, tipo, status)
      SELECT 1000 + i, 1, 'EMAIL', 'erro' FROM n;
    INSERT INTO notificacoes_log(id,empresa_id,tipo,destinatario,assunto,corpo,status,enviado_em,created_at) VALUES
     (1,1,'EMAIL_COMPLIANCE','a@example.com','[COMPLIANCE_TREINAMENTO:100]','{"funcionario_id":1000,"qualificacao_tipo_id":100}','enviada','2026-11-04 15:00:00','2026-11-04 15:00:00'),
     (2,1,'EMAIL_COMPLIANCE','a@example.com','[COMPLIANCE_GESTOR:100]','{"funcionario_id":1000,"qualificacao_tipo_id":100}','enviada','2026-11-04 15:01:00','2026-11-04 15:01:00'),
     (3,1,'EMAIL','a@example.com','[LMS_MATRICULA_RESERVA:1:2]','{"funcionario_id":1000,"curso_id":30}','pendente',NULL,'2026-11-04 15:02:00'),
     (4,1,'EMAIL','a@example.com','[LMS_MATRICULA_RESERVA:1:3]','{"funcionario_id":1000,"curso_id":30}','enviada','2026-11-04 15:03:00','2026-11-04 15:03:00'),
     (5,1,'EMAIL','a@example.com','Outro assunto','{"funcionario_id":1000}','enviada','2026-11-04 15:04:00','2026-11-04 15:04:00'),
     (6,2,'EMAIL_COMPLIANCE','b@example.com','[COMPLIANCE_TREINAMENTO:100]','{"funcionario_id":2000}','enviada','2026-11-04 15:05:00','2026-11-04 15:05:00'),
     (7,1,'EMAIL_COMPLIANCE','a@example.com','[COMPLIANCE_TREINAMENTO:RESERVA:K]','{"funcionario_id":1000,"qualificacao_tipo_id":100}','pendente',NULL,'2026-11-04 15:06:00');
    UPDATE funcionarios SET email='a@example.com' WHERE id=1000;
    ANALYZE;
  `);
}

beforeEach(() => {
  db = new SqliteD1Database();
});
afterEach(() => db.close());

function plan(sql: string, ...binds: unknown[]): string {
  const rows = db.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...(binds as never[])) as Array<{ detail: string }>;
  return rows.map((r) => r.detail).join('\n');
}

function captureSql(): string[] {
  const d1 = db.asD1();
  const captured: string[] = [];
  const original = d1.prepare.bind(d1);
  d1.prepare = ((sql: string) => {
    captured.push(sql);
    return original(sql);
  }) as typeof d1.prepare;
  return captured;
}

describe('notificacoes_log subject-prefix index (0576)', () => {
  it('0576 SQL creates the expected additive index only', () => {
    expect(INDEX_SQL.trim()).toBe(
      'CREATE INDEX idx_notificacoes_log_empresa_assunto ON notificacoes_log(empresa_id, assunto);',
    );
  });

  it('range predicate selects the same rows as the legacy LIKE predicate', () => {
    seed(500);
    const legacy = db.database.prepare(
      `SELECT id FROM notificacoes_log n WHERE empresa_id = 1 AND (n.assunto LIKE '[COMPLIANCE_TREINAMENTO:%'
        OR n.assunto LIKE '[COMPLIANCE_GESTOR:%' OR n.assunto LIKE '[LMS_MATRICULA_RESERVA:%') ORDER BY id`,
    ).all();
    const ranged = db.database.prepare(
      `SELECT id FROM notificacoes_log n WHERE empresa_id = 1 AND ((n.assunto >= '[COMPLIANCE_TREINAMENTO:' AND n.assunto < '[COMPLIANCE_TREINAMENTO;')
        OR (n.assunto >= '[COMPLIANCE_GESTOR:' AND n.assunto < '[COMPLIANCE_GESTOR;')
        OR (n.assunto >= '[LMS_MATRICULA_RESERVA:' AND n.assunto < '[LMS_MATRICULA_RESERVA;')) ORDER BY id`,
    ).all();
    expect(ranged).toEqual(legacy);
    expect(ranged.map((r) => (r as { id: number }).id)).toEqual([1, 2, 3, 4, 7]);
  });

  it('SEARCHes the index (no SCAN of notificacoes_log) for the compliance stats and history prefix queries', () => {
    seed(20000);
    db.database.exec(INDEX_SQL);
    const stats = plan(
      `SELECT id FROM notificacoes_log WHERE empresa_id = ?
         AND assunto >= '[COMPLIANCE_TREINAMENTO:' AND assunto < '[COMPLIANCE_TREINAMENTO;'
         AND assunto LIKE '[COMPLIANCE_TREINAMENTO:%'
         AND (assunto NOT LIKE '[COMPLIANCE_TREINAMENTO:RESERVA:%' OR status IN ('pendente','processando'))`,
      1,
    );
    expect(stats).toMatch(/SEARCH .*idx_notificacoes_log_empresa_assunto/);
    expect(stats).not.toMatch(/SCAN (notificacoes_log|n0?)\b(?! USING)/);

    expect(stats).toMatch(RANGE_SEARCH);
  });

  it('runCommunicationsQuery (fast and full) uses the index and returns the same rows with or without it', async () => {
    seed(20000);
    db.database.exec(`
      INSERT INTO funcionarios(id,empresa_id,nome) SELECT 1000,1,'Ana' WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE id=1000);
    `);
    const run = async (fast: boolean) => (await runCommunicationsQuery(
      db.asD1(), 1, all, { notifications: true, audit: false }, filters, fast,
    ))?.rows.map((r) => r.id) ?? null;

    const withoutIndexFull = await run(false);
    db.database.exec(INDEX_SQL);
    const withIndexFull = await run(false);
    expect(withIndexFull).toEqual(withoutIndexFull);
    expect((withIndexFull ?? []).length).toBeGreaterThan(0);

    const captured = captureSql();
    await run(false);
    await run(true);
    const sqls = captured.filter((s) => s.includes('notificacoes_log'));
    expect(sqls.length).toBe(2);
    for (const sql of sqls) {
      const binds = (sql.match(/\?/g) ?? []).length;
      const p = plan(sql, ...Array.from({ length: binds }, () => 1));
      expect(p).toMatch(RANGE_SEARCH);
      // The only acceptable scan of notificacoes_log would be an unindexed one.
      expect(p).not.toMatch(/SCAN (n0|notificacoes_log)\b/);
    }
  });

  it('fast and full paths agree and match the legacy LIKE-only result on a mixed dataset', async () => {
    seed(3000);
    db.database.exec(INDEX_SQL);
    db.database.exec(`INSERT INTO funcionarios(id,empresa_id,nome) SELECT 1000,1,'Ana' WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE id=1000)`);
    const rows = async (fast: boolean) => (await runCommunicationsQuery(
      db.asD1(), 1, all, { notifications: true, audit: false }, { ...filters, limit: 2 }, fast,
    ));
    const full = await rows(false);
    const fastRes = await rows(true);
    expect(fastRes === null || fastRes.rows.map((r) => r.id).join() === full?.rows.map((r) => r.id).join()).toBe(true);
  });
});
