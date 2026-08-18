import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function source(pathFromTest: string): string {
  // .pathname (not the URL object itself) — matches the established pattern in
  // nomenclatura-pdf-signature.test.ts; passing the URL directly trips a
  // lib.dom vs @types/node URL type mismatch in this repo's tsconfig.
  return readFileSync(decodeURIComponent(new URL(pathFromTest, import.meta.url).pathname), 'utf8');
}

const STATUS_EXPR = "UPPER(COALESCE(qh.status, ''))";
const NEXT_STATUS_EXPR = "UPPER(COALESCE(qh_next.status, ''))";
const CURRENT_OPERATIONAL = `(qh.deleted_at IS NULL
  AND ${STATUS_EXPR} NOT IN ('CANCELADA', 'CANCELADO')
  AND ${STATUS_EXPR} NOT IN ('PLANEJADA', 'PLANEJADO')
  AND qh.data_conclusao IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_historico qh_next
    WHERE qh_next.empresa_id = qh.empresa_id
      AND qh_next.renovacao_de = qh.id
      AND qh_next.deleted_at IS NULL
      AND qh_next.data_conclusao IS NOT NULL
      AND ${NEXT_STATUS_EXPR} NOT IN ('CANCELADA', 'CANCELADO')
      AND ${NEXT_STATUS_EXPR} NOT IN ('PLANEJADA', 'PLANEJADO')
  ))`;
const EXPIRATION = `COALESCE(
  qh.data_vencimento,
  CASE
    WHEN qh.data_conclusao IS NOT NULL
     AND COALESCE(qh.validade_meses, qt.validade) IS NOT NULL
     AND COALESCE(qh.validade_meses, qt.validade) > 0
      THEN date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade) || ' months')
    ELSE NULL
  END
)`;

describe('qualification dashboard current-state contract', () => {
  it('executa a semântica atual contra SQLite: NULL é válida, planejada/cancelada não contam e sucessor só substitui quando concluído', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-qual-dashboard-'));
    tempDirs.push(dir);
    const db = join(dir, 'fixture.sqlite');
    const sql = `
      CREATE TABLE funcionarios (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        status TEXT,
        deleted_at TEXT
      );
      CREATE TABLE qualificacoes_tipos (
        id INTEGER PRIMARY KEY,
        validade INTEGER
      );
      CREATE TABLE qualificacoes_historico (
        id INTEGER PRIMARY KEY,
        empresa_id INTEGER NOT NULL,
        funcionario_id INTEGER NOT NULL,
        qualificacao_id INTEGER NOT NULL,
        status TEXT,
        data_conclusao TEXT,
        data_vencimento TEXT,
        validade_meses INTEGER,
        renovacao_de INTEGER,
        renovada INTEGER DEFAULT 0,
        deleted_at TEXT
      );
      INSERT INTO funcionarios VALUES (1, 6, 'ATIVO', NULL);
      INSERT INTO qualificacoes_tipos VALUES (1, NULL), (2, 12);

      -- current, no expiration: must count as valid
      INSERT INTO qualificacoes_historico VALUES (1,6,1,1,'CONCLUIDA','2026-01-01',NULL,NULL,NULL,0,NULL);
      -- current, far future
      INSERT INTO qualificacoes_historico VALUES (2,6,1,2,'CONCLUIDA','2026-01-01','2027-12-31',NULL,NULL,0,NULL);
      -- current, expiring soon (relative to fixed reference 2026-08-16)
      INSERT INTO qualificacoes_historico VALUES (3,6,1,2,'CONCLUIDA','2026-01-01','2026-08-26',NULL,NULL,0,NULL);
      -- current, expired
      INSERT INTO qualificacoes_historico VALUES (4,6,1,2,'CONCLUIDA','2026-01-01','2026-08-01',NULL,NULL,0,NULL);
      -- planned/cancelled must never enter current totals
      INSERT INTO qualificacoes_historico VALUES (5,6,1,2,'PLANEJADA',NULL,'2026-08-20',NULL,NULL,0,NULL);
      INSERT INTO qualificacoes_historico VALUES (6,6,1,2,'CANCELADA','2026-01-01','2027-12-31',NULL,NULL,0,NULL);
      -- completed successor replaces predecessor
      INSERT INTO qualificacoes_historico VALUES (7,6,1,2,'RENOVADA','2025-01-01','2026-08-10',NULL,NULL,1,NULL);
      INSERT INTO qualificacoes_historico VALUES (8,6,1,2,'CONCLUIDA','2026-08-10','2027-08-10',NULL,7,0,NULL);
      -- planned successor does NOT replace a completed predecessor yet
      INSERT INTO qualificacoes_historico VALUES (9,6,1,2,'CONCLUIDA','2026-01-01','2026-08-25',NULL,NULL,0,NULL);
      INSERT INTO qualificacoes_historico VALUES (10,6,1,2,'PLANEJADA',NULL,'2027-01-01',NULL,9,0,NULL);
      -- cancelled successor does NOT hide predecessor
      INSERT INTO qualificacoes_historico VALUES (11,6,1,2,'CONCLUIDA','2026-01-01','2026-07-31',NULL,NULL,0,NULL);
      INSERT INTO qualificacoes_historico VALUES (12,6,1,2,'CANCELADA','2026-08-01','2027-08-01',NULL,11,0,NULL);
    `;
    writeFileSync(join(dir, 'schema.sql'), sql);
    execFileSync('sqlite3', [db, `.read ${join(dir, 'schema.sql')}`], { encoding: 'utf8' });

    const query = `
      SELECT
        SUM(CASE WHEN ${CURRENT_OPERATIONAL} THEN 1 ELSE 0 END) AS total,
        SUM(CASE WHEN ${CURRENT_OPERATIONAL}
          AND (${EXPIRATION} IS NULL OR date(${EXPIRATION}) > date('2026-08-16', '+30 days'))
          THEN 1 ELSE 0 END) AS validas,
        SUM(CASE WHEN ${CURRENT_OPERATIONAL}
          AND ${EXPIRATION} IS NOT NULL
          AND date(${EXPIRATION}) BETWEEN date('2026-08-16') AND date('2026-08-16', '+30 days')
          THEN 1 ELSE 0 END) AS vencendo,
        SUM(CASE WHEN ${CURRENT_OPERATIONAL}
          AND ${EXPIRATION} IS NOT NULL
          AND date(${EXPIRATION}) < date('2026-08-16')
          THEN 1 ELSE 0 END) AS vencidas
      FROM qualificacoes_historico qh
      JOIN funcionarios f ON f.id = qh.funcionario_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
      WHERE f.empresa_id = 6 AND qh.empresa_id = f.empresa_id;
    `;
    const output = execFileSync('sqlite3', ['-csv', db, query], { encoding: 'utf8' }).trim();
    expect(output).toBe('7,3,2,2');
  });

  it('mantém as três superfícies de dashboard/estatísticas alinhadas ao contrato canônico', () => {
    const dashboard = source('../../routes/dashboard.ts');
    const service = source('../../services/dashboardService.ts');
    const stats = source('../../routes/qualificacoes/estatisticas.ts');

    expect(dashboard).toContain('currentOperationalPredicate');
    expect(dashboard).toContain('WHEN ${vencimentoExpr} IS NULL THEN 1');
    expect(dashboard).toContain('PLANNED_QUALIFICATION_STATUS_VALUES');
    expect(dashboard).toContain('CANCELLED_STATUS_VALUES');

    expect(service).toContain('buildCurrentOperationalQualificationPredicate');
    expect(service).toContain('WHEN ${vencimentoExpr} IS NULL THEN 1');
    expect(service).toContain('qh_next.renovacao_de = ${alias}.id');
    expect(service).toContain('PLANNED_QUALIFICATION_STATUS_VALUES');

    expect(stats).toContain('buildCurrentOperationalQualificationPredicate');
    expect(stats).toContain("getQualificacoesVencimentoExpr('qh', 'qt')");
    expect(stats).toContain("error: 'Erro interno do servidor'");
    expect(stats).not.toContain('error: errorMessage');
  });
});
