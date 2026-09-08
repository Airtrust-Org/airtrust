import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LMS cycle reset tenant scope', () => {
  it('requires the tenant for enrollment, runtime and xAPI reset statements', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/lms-matricula-cycle.ts'),
      'utf8',
    );

    expect(source).toContain('empresaId: number;');
    expect(source).toContain('AND empresa_id = ?');
    expect(source).toContain('m.id = lms_progresso_scorm.matricula_id');
    expect(source).toContain('m.empresa_id = ?');
    expect(source).toContain('m.id = lms_xapi_statements.matricula_id');
    expect(source).toContain('empresaId: params.empresaId');
  });

  it('propagates the discovered renewal tenant into terminal-cycle reuse', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/cron/resilient/ead-renewal.ts'),
      'utf8',
    );

    expect(source).toContain(
      'ensureExistingRenewalMatricula(db, existing, payload.empresa_id)',
    );
    expect(source).toContain('empresaId,');
  });
});
