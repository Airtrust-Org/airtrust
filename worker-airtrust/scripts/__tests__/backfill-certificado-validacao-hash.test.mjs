import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCertificateValidationHashSync } from '../backfill-certificado-validacao-hash.mjs';

test('matches the canonical 16-hex uppercase token', () => {
  const hash = generateCertificateValidationHashSync({
    funcionarioCpf: '123.456.789-01',
    qualificacaoCodigo: 'EAD-CRM',
    dataConclusao: '2026-08-25T15:30:00Z',
    numeroCertificado: 'CERT-001',
  });
  assert.match(hash, /^[A-F0-9]{16}$/);
  assert.equal(
    generateCertificateValidationHashSync({
      funcionarioCpf: '12345678901',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25',
      numeroCertificado: 'CERT-001',
    }),
    hash,
  );
});
