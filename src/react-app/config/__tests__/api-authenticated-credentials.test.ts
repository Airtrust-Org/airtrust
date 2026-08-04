import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiSource = readFileSync(join(process.cwd(), 'src/react-app/config/api.ts'), 'utf8');

describe('authenticated API credential policy', () => {
  it('applies the include-cookie default while preserving explicit overrides', () => {
    expect(apiSource).toContain("credentials: 'include' as RequestCredentials");
    expect(apiSource).toContain('credentials: options.credentials ?? fetchConfig.credentials');
  });
});
