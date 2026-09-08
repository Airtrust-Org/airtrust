import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('LMS reports dynamic permission wiring', () => {
  it('uses the canonical relatorios module while preserving admin/manager baseline', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'worker-airtrust/src/routes/lms-relatorios.ts'),
      'utf8',
    );
    expect(source).toContain(
      "requirePermission('relatorios', 'visualizar', 'admin', 'manager')",
    );
    expect(source).not.toContain(
      "requirePermission('lms', 'visualizar', 'admin', 'manager')",
    );
  });
});
