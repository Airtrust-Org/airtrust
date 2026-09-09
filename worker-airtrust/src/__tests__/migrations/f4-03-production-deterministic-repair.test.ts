import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), '..');
const script = readFileSync(resolve(ROOT, 'scripts/validation/f4-03-production-deterministic-repair.mjs'), 'utf8');
const workflow = readFileSync(resolve(ROOT, '.github/workflows/f4-03-production-deterministic-repair.yml'), 'utf8');
const rollback = readFileSync(resolve(ROOT, 'scripts/rollback/f4-03-0435-six-row-repair.sql'), 'utf8');

describe('F4-03 deterministic production repair governance', () => {
  it('is manual-only, SHA-pinned, gate-checked and production-environment guarded', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/\bpush:\s*$/m);
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('EXPECTED_SHA_MISMATCH');
    expect(workflow).toContain('node scripts/ci/verify-release-gates.mjs');
    expect(workflow).toContain('AIRTRUST_PRODUCTION_DRYRUN_F4_03_REPAIR');
    expect(workflow).toContain('AIRTRUST_PRODUCTION_APPLY_F4_03_REPAIR_6_ROWS');
    expect(workflow).toContain('d1 time-travel info');
    expect(workflow).not.toMatch(/wrangler\s+(?:deploy|pages deploy)/);
  });

  it('targets exactly the six historically proven rows and no heuristic population', () => {
    for (const id of [4595, 4610, 4628, 4632, 4634, 4670]) {
      expect(script).toContain(`id: ${id}`);
    }
    expect(script).toContain("const EMPRESA_ID = 6");
    expect(script).toContain("origem_tipo = 'MANUAL'");
    expect(script).toContain('lms_matricula_id IS NULL');
    expect(script).not.toMatch(/observacoes\s+LIKE/i);
    expect(script).not.toMatch(/nome\s+LIKE/i);
    expect(script).toContain('APPLY_CHANGE_COUNT_MISMATCH');
    expect(script).toContain('POST_TARGET_EXPIRY_MISMATCH');
  });

  it('pins immutable certificate hashes and revalidates them before any apply', () => {
    expect(script).toContain('CERTIFICATE_HASH_MISMATCH');
    expect(script).toContain('CERTIFICATE_NOT_PREINCIDENT');
    expect(script).toContain('validateCertificateEvidence();');
    expect(workflow).toContain('f4-03-production-certificate-recovery.mjs');
    expect(workflow).toContain('F4_03_CERTIFICATE_EVIDENCE_PATH');
  });

  it('keeps rollback exact and non-allowlisted', () => {
    expect(rollback).toContain('scripts/run-production-db-script.sh');
    for (const id of [4595, 4610, 4628, 4632, 4634, 4670]) {
      expect(rollback).toContain(`id = ${id}`);
    }
    expect(rollback).not.toMatch(/observacoes\s+LIKE/i);
  });

  it('does not emit person identity or certificate content', () => {
    const outputSection = script.slice(script.indexOf('const summary ='));
    for (const forbidden of ['funcionario_nome', 'funcionario_cpf', 'email:', 'cpf:', 'r2_key', 'certificate_text']) {
      expect(outputSection).not.toContain(forbidden);
    }
  });
});
