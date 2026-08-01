import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RETIRED_EDAPP_EXECUTORS = [
  'scripts/reprocessar-eventos-edapp.ts',
  'scripts/operacionais/reprocessar-eventos-edapp.ts',
] as const;

describe('executores operacionais EdApp aposentados', () => {
  it.each(RETIRED_EDAPP_EXECUTORS)('não permite reintroduzir %s', (relativePath) => {
    expect(existsSync(resolve(process.cwd(), relativePath))).toBe(false);
  });
});
