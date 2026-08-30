import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../FrmsConfiguracoes.tsx', import.meta.url), 'utf8');

describe('FrmsConfiguracoes visible errors', () => {
  it('routes visible failures through the safe FRMS error policy', () => {
    expect(source).toContain("safeFrmsVisibleErrorMessage('config-save', e)");
    expect(source).toContain("safeFrmsVisibleErrorMessage('config-reprocess', e)");
    expect(source).toContain("safeFrmsVisibleErrorMessage('notification-save', e)");
    expect(source).not.toContain("e instanceof Error ? e.message");
  });
});
