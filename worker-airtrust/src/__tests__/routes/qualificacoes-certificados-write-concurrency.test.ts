import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../routes/qualificacoes-certificados-write.ts',
  ),
  'utf8',
);

describe('qualificações certificados write concurrency contract', () => {
  it('passes the observed certificate link into the compare-and-set generation', () => {
    expect(routeSource).toContain('expectedCertificadoArquivoId: existingDocId');
  });

  it('maps a lost certificate generation race to HTTP 409', () => {
    expect(routeSource).toContain('CERTIFICATE_CONCURRENT_GENERATION: 409');
  });
});
