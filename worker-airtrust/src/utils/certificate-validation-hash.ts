export interface CertificateValidationHashInput {
  funcionarioCpf: string;
  qualificacaoCodigo: string;
  dataConclusao: string;
  numeroCertificado: string;
}

export function normalizeCertificateHashInput(input: CertificateValidationHashInput): string {
  const cpf = String(input.funcionarioCpf || '').replace(/\D/g, '');
  const qualificacaoCodigo = String(input.qualificacaoCodigo || '').trim();
  const dataConclusao = String(input.dataConclusao || '').trim().split('T')[0];
  const numeroCertificado = String(input.numeroCertificado || '').trim();

  if (!cpf || !qualificacaoCodigo || !dataConclusao || !numeroCertificado) {
    throw new Error('CERTIFICATE_VALIDATION_HASH_INPUT_INCOMPLETE');
  }

  return `${cpf}${qualificacaoCodigo}${dataConclusao}${numeroCertificado}`;
}

/**
 * Canonical public certificate validation token.
 *
 * Compatibility contract: historical certificates use the first 16 uppercase
 * hex characters of SHA-256(CPF digits + qualification code + completion date
 * YYYY-MM-DD + certificate number). Do not change this format without a versioned
 * migration because QR codes already issued embed it.
 */
export async function generateCertificateValidationHash(
  input: CertificateValidationHashInput,
): Promise<string> {
  const canonical = normalizeCertificateHashInput(input);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
    .toUpperCase();
}

export function isCertificateValidationHash(value: unknown): value is string {
  return /^[A-F0-9]{16}$/.test(String(value || '').toUpperCase());
}
