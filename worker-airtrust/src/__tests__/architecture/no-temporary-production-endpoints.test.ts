import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('temporary production endpoints architecture guard', () => {
  it('não permite endpoints temporários de fix no index do worker', () => {
    const source = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('FIX TEMPORÁRIO');
    expect(source).not.toContain('/api/fix/');
    expect(source).not.toContain('populate-qualificacao-ids');
  });
});
