import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LMS cycle reset tenant scope', () => {
  it('requires tenant scope, transaction, archived SCORM and non-destructive xAPI attribution', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/services/lms-matricula-cycle.ts'),
      'utf8',
    );

    expect(source).toContain('empresaId: number;');
    expect(source).toContain('AND empresa_id = ?');
    expect(source).toContain('m.id = lms_progresso_scorm.matricula_id');
    expect(source).toContain('m.empresa_id = ?');
    expect(source).toContain('UPDATE lms_xapi_statements SET archived_cycle_id');
    expect(source).not.toContain('DELETE FROM lms_xapi_statements');
    expect(source).toContain('INSERT INTO lms_ciclo_evidencias');
    expect(source).toContain('await db.batch([');
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
