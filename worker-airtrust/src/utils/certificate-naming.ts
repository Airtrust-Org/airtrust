/**
 * GERAÇÃO PADRONIZADA E CENTRALIZADA DE NOMES DE CERTIFICADO
 *
 * Fonte única de verdade para nomes de arquivo de certificado.
 * Padrão: CERT-{MATRICULA}-{CODIGO}-{DATA}-{UUID}.pdf
 *
 * Exemplo: CERT-00123-CRM-20260108-a1b2c3d4.pdf
 */

/**
 * Gera nome de arquivo padronizado para certificado
 * @param funcionarioMatricula Matrícula do funcionário (será padded com 5 dígitos)
 * @param qualificacaoCodigo Código da qualificação (ex: CRM, PP)
 * @param dataReferencia Data da conclusão/qualificação
 * @param uuidCurto UUID curto (8 caracteres) - opcionalmente pode vir vazio, será gerado
 */
export function buildCertificateFilename(
  funcionarioMatricula: string,
  qualificacaoCodigo: string,
  dataReferencia: Date,
  uuidCurto?: string,
): string {
  // Garantir que matrícula tem 5 dígitos
  const matriculaPadded = String(funcionarioMatricula || '00000')
    .replace(/\D/g, '')
    .padStart(5, '0');

  // Formato de data: YYYYMMDD
  const year = dataReferencia.getFullYear();
  const month = String(dataReferencia.getMonth() + 1).padStart(2, '0');
  const day = String(dataReferencia.getDate()).padStart(2, '0');
  const dataFormatada = `${year}${month}${day}`;

  // Código da qualificação em uppercase
  const codigoLimpo = (qualificacaoCodigo || 'XXX')
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10);

  // UUID curto (se não fornecido, gerar)
  const uuid = uuidCurto || crypto.randomUUID().substring(0, 8);

  return `CERT-${matriculaPadded}-${codigoLimpo}-${dataFormatada}-${uuid}.pdf`;
}

/**
 * Valida se um nome de certificado segue o padrão esperado
 * @param nomeCertificado Nome do arquivo a validar
 */
export function validateCertificateFilename(nomeCertificado: string): boolean {
  // Padrão: CERT-00000-CODE-YYYYMMDD-12345678.pdf
  const pattern = /^CERT-\d{5}-[A-Z0-9]+-\d{8}-[a-z0-9]{8}\.pdf$/i;
  return pattern.test(nomeCertificado);
}

/**
 * Extrai informações de um nome de certificado
 * @param nomeCertificado Nome do arquivo
 */
export function parseCertificateFilename(nomeCertificado: string): {
  matricula: string;
  codigo: string;
  data: string; // YYYYMMDD
  uuid: string;
} | null {
  const pattern = /^CERT-(\d{5})-([A-Z0-9]+)-(\d{8})-([a-z0-9]{8})\.pdf$/i;
  const match = nomeCertificado.match(pattern);

  if (!match) return null;

  return {
    matricula: match[1],
    codigo: match[2],
    data: match[3],
    uuid: match[4],
  };
}

/**
 * Converte data YYYYMMDD para formato legível
 */
export function formatarDataCertificado(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return 'Data inválida';
  const year = yyyymmdd.substring(0, 4);
  const month = yyyymmdd.substring(4, 6);
  const day = yyyymmdd.substring(6, 8);
  return `${day}/${month}/${year}`;
}
