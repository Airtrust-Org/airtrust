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

  it('CSV exported rows never represent unverified KSS or KSS 9 as green/APTO', () => {
    const exported = source.slice(source.indexOf("router.get('/fadiga-checkin/export'"));
    const match = exported.match(/const rows = await c\\.env\\.DB\\.prepare\\(\\s*`([\\s\\S]*?)`/);
    if (!match) throw new Error('Cannot locate production export SQL');
    const sql = match[1].replace('${exportSectorScope.clause}', '1 = 1');
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE funcionarios (id INTEGER, empresa_id INTEGER, nome TEXT, deleted_at TEXT);
        CREATE TABLE frms_fadiga_checkin (
          empresa_id INTEGER, funcionario_id INTEGER, data_checkin TEXT,
          kss_score INTEGER, kss_provenance TEXT, horas_sono REAL,
          qualidade_sono INTEGER, score_fadiga REAL, nivel_fadiga TEXT,
          status_operacional TEXT, computed_risk_level TEXT, fit_for_duty INTEGER,
          requires_frat_review INTEGER, frat_sugerido_nivel TEXT,
          associado_frat_avaliacao_id TEXT, observacoes TEXT, deleted_at TEXT
        );
        INSERT INTO funcionarios VALUES (10,7,'High KSS',NULL);
        INSERT INTO funcionarios VALUES (11,7,'Legacy',NULL);
        INSERT INTO funcionarios VALUES (12,7,'Valid',NULL);
        INSERT INTO funcionarios VALUES (10,8,'Another Company',NULL);
        INSERT INTO frms_fadiga_checkin VALUES
          (7,10,'2026-11-03',9,'CREW_REPORTED',8,4,8,'VERDE','APTO','normal',1,0,NULL,NULL,NULL,NULL),
          (7,11,'2026-11-03',5,NULL,8,4,8,'VERDE','APTO','normal',1,0,NULL,NULL,NULL,NULL),
          (7,12,'2026-11-03',3,'CREW_REPORTED',8,4,8,'VERDE','APTO','normal',1,0,NULL,NULL,NULL,NULL);
      `);
      const rows = db.prepare(sql).all(7,'2026-11-03','2026-11-03');
      expect(rows).toHaveLength(3);
      const byName = (name: string) => rows.find((row: { funcionario_nome?: string }) => row.funcionario_nome === name);
      expect(byName('Legacy')).toMatchObject({
        kss_score: null, score_fadiga: null, nivel_fadiga: null, status_operacional: null,
      });
      expect(byName('High KSS')).toMatchObject({ kss_score: 9, nivel_fadiga: null, status_operacional: null });
      expect(byName('Valid')).toMatchObject({ kss_score: 3, nivel_fadiga: 'VERDE', status_operacional: 'APTO' });
    } finally {
      db.close();
    }
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
