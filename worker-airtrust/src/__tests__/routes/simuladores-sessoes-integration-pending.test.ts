import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression tests for P1-SIM-001 / P1-SIM-002 (2026-08-17 hardening bundle):
// - CREATE must not mask a failed planned-qualification sync as a full 201 success.
// - UPDATE must not let a failed escala sync (or qualification sync) surface as a
//   generic 500 once the primary session row has already been persisted.
//
// These are source-contract assertions (not full HTTP integration tests) because
// the CREATE/UPDATE handlers pull in a large amount of D1/tenant/session wiring;
// the contract itself — status codes, response shape, and that failures no longer
// fall through to the generic catch/200 path — is what these guard.

function read(relative: string) {
  return readFileSync(resolve(process.cwd(), relative), 'utf8');
}

describe('Simulator session INTEGRATION_PENDING contract', () => {
  describe('CREATE (simuladores-sessoes.ts) — SIM-REL-001', () => {
    const source = read('src/routes/simuladores-sessoes.ts');

    it('does not silently swallow a failed criarQualificacoesPlanejadas call into a 201', () => {
      // The old behavior only logged the error and fell through to `return c.json(..., 201)`.
      // Assert the failure flag is now checked before the success response is built.
      const flagDeclIndex = source.indexOf('let plannedQualificationIntegrationError');
      const pendingReturnIndex = source.indexOf("code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'");
      const successReturnIndex = source.lastIndexOf('success: true,\n        data: {\n          sessao_id,');

      expect(flagDeclIndex).toBeGreaterThan(-1);
      expect(pendingReturnIndex).toBeGreaterThan(-1);
      // The pending 409 branch must be evaluated before the final 201 success return.
      expect(pendingReturnIndex).toBeLessThan(successReturnIndex);
    });

    it('returns 409 SIMULATOR_QUALIFICATION_INTEGRATION_PENDING with primary_saved/qualification_synced flags', () => {
      expect(source).toContain("code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'");
      expect(source).toContain('primary_saved: true');
      expect(source).toContain('qualification_synced: false');
      // The pending branch must respond 409, not throw into the outer catch (no rollback).
      const pendingBlock = source.slice(
        source.indexOf("code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'") - 200,
        source.indexOf("code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'") + 700,
      );
      expect(pendingBlock).toContain('409');
    });

    it('keeps createdSessaoId cleared (no compensating rollback) on the pending path', () => {
      // createdSessaoId = null must happen before the pending-check, otherwise a
      // qualification failure would incorrectly trigger cleanupFailedSharedCreate.
      const clearIndex = source.indexOf('createdSessaoId = null;');
      const pendingCheckIndex = source.indexOf('if (plannedQualificationIntegrationError)');
      expect(clearIndex).toBeGreaterThan(-1);
      expect(pendingCheckIndex).toBeGreaterThan(-1);
      expect(clearIndex).toBeLessThan(pendingCheckIndex);
    });
  });

  describe('UPDATE (simuladores-sessoes-update.ts) — SIM-REL-002 / SIM-REL-003', () => {
    const source = read('src/routes/simuladores-sessoes-update.ts');

    it('wraps both syncSessaoEscalaEventos call sites in try/catch (no unguarded await)', () => {
      const occurrences = source.split('await syncSessaoEscalaEventos(c.env.DB, {').length - 1;
      expect(occurrences).toBe(2);
      expect(source).toContain('scaleIntegrationError = ');
    });

    it('distinguishes scale-only, qualification-only, and combined pending codes', () => {
      expect(source).toContain("'SIMULATOR_SCALE_INTEGRATION_PENDING'");
      expect(source).toContain("'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING'");
      expect(source).toContain("'SIMULATOR_INTEGRATION_PENDING'");
    });

    it('responds 409 with primary_saved true and per-integration synced flags', () => {
      expect(source).toContain('primary_saved: true');
      expect(source).toContain('qualification_synced: !qualificationIntegrationFailed');
      expect(source).toContain('scale_synced: !scaleIntegrationError');
    });

    it('evaluates the pending check before the plain success return', () => {
      const pendingCheckIndex = source.indexOf('const qualificationIntegrationFailed =');
      const successReturnIndex = source.indexOf(
        "return c.json({ success: true, data: u, _diag_planejadas: diag });",
      );
      expect(pendingCheckIndex).toBeGreaterThan(-1);
      expect(successReturnIndex).toBeGreaterThan(-1);
      expect(pendingCheckIndex).toBeLessThan(successReturnIndex);
    });
  });
});
