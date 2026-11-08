import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Audit P12-02: recurring cron may not purge regulated evidence. */
describe('scheduled cron regulatory retention contract', () => {
  it('does not execute legacy default hard-purge policy', () => {
    const source = readFileSync(
      new URL('../../cron/scheduled-handler.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toContain("SOFT_DELETE_PURGE_DAYS || '90'");
    expect(source).not.toContain('DELETE FROM ${tableName} WHERE deleted_at');
    expect(source).not.toContain('const purgeDays = parseInt(');
  });
});
