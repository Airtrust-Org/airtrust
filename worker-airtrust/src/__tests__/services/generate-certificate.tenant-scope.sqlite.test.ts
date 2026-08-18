/**
 * Real-SQL regression test for the tenant-scoping fix in
 * generateCertificateForHistorico's core SELECT (generate-certificate.ts).
 *
 * Uses the same real (node:sqlite) D1 test double as
 * qualification-history-atomic.sqlite.test.ts, unlike
 * generate-certificate.test.ts's in-memory mock (which returns a
 * pre-canned row and never executes real SQL/WHERE predicates — it cannot
 * exercise this fix).
 *
 * The two `generateCertificateForHistorico` fail-closed tests below are
 * belt-and-suspenders coverage for qh.empresa_id / the funcionarios join —
 * note the PRE-EXISTING `f.empresa_id = ?` WHERE predicate already caught
 * both of those specific scenarios (verified: they pass unmodified against
 * the pre-fix query too). They still document the intended fail-closed
 * contract and now assert it via the ON-clause predicate directly rather
 * than transitively through WHERE.
 *
 * The actual gap this change closes — `qualificacoes_tipos` (qt) had no
 * empresa_id predicate at all, so a corrupted/cross-tenant qh.qualificacao_id
 * could pull another tenant's qualification name/code/category into the
 * certificate via the LEFT JOIN — is isolated in the last test below, which
 * runs the query directly (mirroring the real JOIN clause) since exercising
 * it through the full function would require mocking templates/documentos/
 * pasta_virtual/R2 as well, well beyond this fix's scope.
 */
import { describe, expect, it } from 'vitest';
import type { Env } from '../../types';
import {
  CertificateGenerationError,
  generateCertificateForHistorico,
} from '../../services/generate-certificate';
import { insertHistory, SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

function patchSchema(db: SqliteD1Database): void {
  // The shared fixture's tables predate columns this query selects; patch
  // them in for this test only rather than widening the shared helper's
  // schema for unrelated suites.
  db.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN codigo_anac TEXT;
    ALTER TABLE funcionarios ADD COLUMN matricula TEXT;
    ALTER TABLE funcionarios ADD COLUMN funcao TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN descricao TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN conteudo_programatico TEXT;
    ALTER TABLE qualificacoes_tipos ADD COLUMN vencimento_fim_mes INTEGER;
    ALTER TABLE qualificacoes_categorias ADD COLUMN nome TEXT;
    ALTER TABLE qualificacoes_categorias ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;
  `);
  db.database.exec(`UPDATE qualificacoes_tipos SET nome = 'Nome Tipo ' || id`);
}

function makeEnv(db: SqliteD1Database): Env {
  return { DB: db.asD1() } as unknown as Env;
}

describe('generateCertificateForHistorico — tenant scoping (real SQL)', () => {
  it('fails closed (CERTIFICATE_HISTORY_NOT_FOUND) when the historico row belongs to a different tenant', async () => {
    const db = new SqliteD1Database();
    patchSchema(db);
    try {
      const historicoId = insertHistory(db.database, {
        funcionarioId: 1000, // tenant 1 employee
        qualificationId: 100, // tenant 1 qualification type
        empresaId: 1,
      });

      await expect(
        generateCertificateForHistorico(makeEnv(db), historicoId, 2 /* acting as tenant 2 */),
      ).rejects.toMatchObject({
        constructor: CertificateGenerationError,
        code: 'CERTIFICATE_HISTORY_NOT_FOUND',
      });
    } finally {
      db.close();
    }
  });

  it('fails closed when qh.empresa_id matches but the linked funcionario belongs to a different tenant (corrupted relation)', async () => {
    const db = new SqliteD1Database();
    patchSchema(db);
    try {
      // Corrupted/adversarial relation: historico row claims tenant 1, but its
      // funcionario_id (2000) is seeded as a tenant-2 employee.
      const historicoId = insertHistory(db.database, {
        funcionarioId: 2000,
        qualificationId: 100,
        empresaId: 1,
      });

      await expect(
        generateCertificateForHistorico(makeEnv(db), historicoId, 1),
      ).rejects.toMatchObject({
        constructor: CertificateGenerationError,
        code: 'CERTIFICATE_HISTORY_NOT_FOUND',
      });
    } finally {
      db.close();
    }
  });

  it('still resolves for the legitimate same-tenant case (no false-positive rejection)', async () => {
    const db = new SqliteD1Database();
    patchSchema(db);
    try {
      const historicoId = insertHistory(db.database, {
        funcionarioId: 1000,
        qualificationId: 100,
        empresaId: 1,
      });

      // Reaches past the fail-closed SELECT into template resolution, which
      // is unconfigured in this minimal fixture — CERTIFICATE_HISTORY_NOT_FOUND
      // would indicate the tenant check wrongly rejected a legitimate row;
      // any other outcome (including a different error further downstream)
      // proves the row was found.
      await expect(
        generateCertificateForHistorico(makeEnv(db), historicoId, 1),
      ).rejects.not.toMatchObject({ code: 'CERTIFICATE_HISTORY_NOT_FOUND' });
    } finally {
      db.close();
    }
  });

  it('does not leak another tenant qualification-type name/code when qh.qualificacao_id points cross-tenant (the actual bug fixed here)', () => {
    const db = new SqliteD1Database();
    patchSchema(db);
    try {
      // qh is legitimately tenant 1 (funcionario 1000, empresa_id 1), but its
      // qualificacao_id (200) is seeded as belonging to tenant 2. Before this
      // fix, the qt LEFT JOIN had no empresa_id predicate, so qt.nome/codigo
      // for tenant 2's row would have been joined in and shown on tenant 1's
      // certificate. Querying with the fixed JOIN clause directly (same
      // predicate now present in generate-certificate.ts) proves the qt
      // columns come back NULL instead of leaking tenant 2's data.
      const historicoId = insertHistory(db.database, {
        funcionarioId: 1000,
        qualificationId: 200, // tenant 2's MNT-12 row, not tenant 1's
        empresaId: 1,
      });

      const empresaId = 1;
      const row = db.database
        .prepare(
          `SELECT qh.id, qt.nome AS qualificacao_nome, qt.codigo AS qualificacao_codigo
             FROM qualificacoes_historico qh
             LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL AND f.empresa_id = ?
             LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL AND qt.empresa_id = ?
            WHERE qh.id = ? AND qh.deleted_at IS NULL AND qh.empresa_id = ? AND f.id IS NOT NULL`,
        )
        .get(empresaId, empresaId, historicoId, empresaId) as
        | { id: number; qualificacao_nome: string | null; qualificacao_codigo: string | null }
        | undefined;

      expect(row).toBeDefined();
      expect(row?.id).toBe(historicoId);
      expect(row?.qualificacao_nome).toBeNull();
      expect(row?.qualificacao_codigo).toBeNull();
    } finally {
      db.close();
    }
  });
});
