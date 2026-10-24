import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('SGSO HFA integration UI contract', () => {
  it('exposes configuration and manual RELPREV sync surfaces', () => {
    const app = read('src/react-app/App.tsx');
    const sgso = read('src/react-app/pages/Sgso.tsx');
    const detail = read('src/react-app/pages/SgsoRelato.tsx');
    const config = read('src/react-app/pages/sgso/SgsoHfaIntegrationPage.tsx');

    expect(app).toContain('path="/sgso/hfa"');
    expect(sgso).toContain("href: '/sgso/hfa'");
    expect(detail).toContain("/sgso/hfa/relprev/${id}/sync");
    expect(detail).toContain('O envio não inicia análise nem consome crédito.');
    expect(config).toContain("apiCall('/sgso/hfa/config'");
    expect(config).toContain('token é criptografado');
  });
});
