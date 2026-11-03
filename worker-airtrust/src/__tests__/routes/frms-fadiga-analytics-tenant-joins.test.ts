import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const source = readFileSync('src/routes/frms-fadiga-checkin-legacy.ts', 'utf8');

function correlatedQuery(): string {
  const match = source.match(/const correlacaoScoreEffectiveness = await c\.env\.DB\.prepare\(\s*`([\s\S]*?)`/);
  if (!match) throw new Error('Cannot locate production correlation SQL');
  return match[1].replace('${analyticsSectorScope.clause}', '1 = 1');
}

describe('FRMS fatigue analytics: tenant isolation', () => {
  it('all six analytics/export employee JOINs explicitly require tenant identity', () => {
    const analytics = source.slice(source.indexOf("router.get('/fadiga-checkin/analytics'"));
    const joins = analytics.match(/JOIN funcionarios f ON f\.id = ch\.funcionario_id[^\n]*/g) || [];
    expect(joins).toHaveLength(6);
    for (const join of joins) {
      expect(join).toContain('f.empresa_id = ch.empresa_id');
    }
    expect(correlatedQuery()).toContain('fj.empresa_id = ch.empresa_id');
  });

  it('actual SQLite correlation cannot join another company employee or duty', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE frms_fadiga_checkin (
          empresa_id INTEGER, funcionario_id INTEGER, data_checkin TEXT,
          score_fadiga REAL, deleted_at TEXT
        );
        CREATE TABLE funcionarios (id INTEGER, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
        CREATE TABLE frms_jornada (
          id TEXT, empresa_id INTEGER, tripulante_id INTEGER, data TEXT, deleted_at TEXT
        );
        CREATE TABLE frms_fatorizacao_jornada (
          jornada_id TEXT, effectiveness_pct REAL, deleted_at TEXT
        );
        INSERT INTO frms_fadiga_checkin VALUES (7, 10, '2026-11-03', 25, NULL);
        INSERT INTO funcionarios VALUES (10, 7, 'Crew A', NULL);
        INSERT INTO funcionarios VALUES (10, 8, 'Other Company', NULL);
        INSERT INTO frms_jornada VALUES ('duty-7', 7, 10, '2026-11-03', NULL);
        INSERT INTO frms_jornada VALUES ('duty-8', 8, 10, '2026-11-03', NULL);
        INSERT INTO frms_fatorizacao_jornada VALUES ('duty-7', 82, NULL);
        INSERT INTO frms_fatorizacao_jornada VALUES ('duty-8', 55, NULL);
      `);
      const rows = db.prepare(correlatedQuery()).all(7, '2026-11-03', '2026-11-03');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ tripulante_nome: 'Crew A', effectiveness_pct: 82 });
    } finally {
      db.close();
    }
  });
});
