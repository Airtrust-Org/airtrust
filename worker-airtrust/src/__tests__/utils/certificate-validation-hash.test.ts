import { describe, expect, it } from 'vitest';
import {
  generateCertificateValidationHash,
  isCertificateValidationHash,
  normalizeCertificateHashInput,
} from '../../utils/certificate-validation-hash';

describe('certificate validation hash', () => {
  it('normalizes CPF formatting and ISO timestamp without changing the legacy token contract', async () => {
    const formatted = await generateCertificateValidationHash({
      funcionarioCpf: '123.456.789-01',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25T15:30:00Z',
      numeroCertificado: 'CERT-001',
    });
    const normalized = await generateCertificateValidationHash({
      funcionarioCpf: '12345678901',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25',
      numeroCertificado: 'CERT-001',
    });

    expect(formatted).toBe(normalized);
    expect(formatted).toMatch(/^[A-F0-9]{16}$/);
  });

  it('builds the exact canonical legacy input sequence', () => {
    expect(
      normalizeCertificateHashInput({
        funcionarioCpf: '123.456.789-01',
        qualificacaoCodigo: 'QUAL-1',
        dataConclusao: '2026-08-25',
        numeroCertificado: 'ABC',
      }),
    ).toBe('12345678901QUAL-12026-08-25ABC');
  });

  it('fails closed when a required source field is missing', async () => {
    await expect(
      generateCertificateValidationHash({
        funcionarioCpf: '',
        qualificacaoCodigo: 'QUAL-1',
        dataConclusao: '2026-08-25',
        numeroCertificado: 'ABC',
      }),
    ).rejects.toThrow('CERTIFICATE_VALIDATION_HASH_INPUT_INCOMPLETE');
  });

  it('validates only the exact 16-hex public token format', () => {
    expect(isCertificateValidationHash('0123456789ABCDEF')).toBe(true);
    expect(isCertificateValidationHash('0123456789abcdef')).toBe(true);
    expect(isCertificateValidationHash('short')).toBe(false);
    expect(isCertificateValidationHash('0123456789ABCDEG')).toBe(false);
  });
});
