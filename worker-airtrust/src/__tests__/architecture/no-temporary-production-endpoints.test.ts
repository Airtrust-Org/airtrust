import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('temporary production endpoints architecture guard', () => {
  it('não permite endpoints temporários de fix no index do worker', () => {
    const source = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('FIX TEMPORÁRIO');
    expect(source).not.toContain('/api/fix/');
    expect(source).not.toContain('populate-qualificacao-ids');
    expect(source).not.toContain('/api/debug');
    expect(source).not.toContain("from './routes/debug'");
    expect(source).not.toContain("from './routes/debug-purge'");
  });

  it('não preserva arquivos mortos de debug/admin migration no runtime', () => {
    const removedFiles = [
      '../../routes/debug.ts',
      '../../routes/debug-purge.ts',
      '../../routes/admin-apply-migration.ts',
      '../../routes/admin-migrate.ts',
      '../../routes/admin-migration.ts',
    ] as const;

    for (const file of removedFiles) {
      expect(existsSync(new URL(file, import.meta.url))).toBe(false);
    }
  });
});
