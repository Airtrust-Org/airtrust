import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'src/routes/auth.ts',
  // admin.ts is read-only after destructive maintenance routes were removed.
  'src/routes/assets.ts',
  'src/routes/empresas.ts',
];

describe('audit payload architecture guard', () => {
  it('uses audit sanitization helpers in scoped runtime routes', () => {
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(
        source.includes('buildAuditMetadata(') || source.includes('buildLegacyAuditPayload('),
      ).toBe(true);
    }
  });
});
