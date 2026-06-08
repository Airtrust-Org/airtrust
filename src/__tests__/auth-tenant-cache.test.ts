import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const authContextSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/context/AuthContext.tsx'),
  'utf8',
);

describe('auth tenant cache guard', () => {
  it('limpa React Query ao trocar empresa ou sair', () => {
    expect(authContextSource).toContain("import { queryClient } from '@/react-app/lib/query-client';");
    expect(authContextSource).toMatch(/const logout = useCallback\(\(\) => \{\s*queryClient\.clear\(\);/);
    expect(authContextSource).toMatch(/const novoToken = String\(json\.data\.accessToken\);\s*queryClient\.clear\(\);/);
  });
});
