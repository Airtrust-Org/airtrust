import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const authContextSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/context/AuthContext.tsx'),
  'utf8',
);

describe('auth tenant cache guard', () => {
  it('limpa React Query ao sair e troca o token antes de resetar o tenant', () => {
    expect(authContextSource).toContain(
      "import { queryClient } from '@/react-app/lib/query-client';",
    );
    expect(authContextSource).toMatch(
      /const logout = useCallback\(\(\) => \{\s*queryClient\.clear\(\);/,
    );

    const selectEmpresa = authContextSource.slice(authContextSource.indexOf('const selectEmpresa'));
    const tokenWrite = selectEmpresa.indexOf('setTokens(novoToken');
    const stateWrite = selectEmpresa.indexOf('setToken(novoToken)');
    const tenantReset = selectEmpresa.indexOf('resetTenantDataLayer({');

    expect(tokenWrite).toBeGreaterThanOrEqual(0);
    expect(stateWrite).toBeGreaterThan(tokenWrite);
    expect(tenantReset).toBeGreaterThan(stateWrite);
  });
});
