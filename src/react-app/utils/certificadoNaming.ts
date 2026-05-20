/**
 * Utility para geração de nomes de certificados padronizados
 *
 * Padrão: CERT-{NOME_FUNCIONARIO}-{CODIGO}-{YYYYMMDD}.pdf
 *
 * Exemplos:
 * - CERT-JOAO_SILVA-CRM-20250115.pdf
 * - CERT-MARIA_SANTOS-ICAO-20250301.pdf
 */

/**
 * Gera nome padronizado de certificado
 *
 * @param nomeFuncionario - Nome do funcionário (será sanitizado)
 * @param codigo - Código da qualificação (ex: "CRM", "ICAO")
 * @param dataRealizacao - Data de realização ISO (ex: "2025-01-15")
 * @returns Nome do certificado formatado
 *
 * @example
 * gerarNomeCertificado("JOAO_SILVA", "CRM", "2025-01-15")
 * // Retorna: "CERT-JOAO_SILVA-CRM-20250115.pdf"
 */
export function gerarNomeCertificado(
  matricula: string,
  codigo: string,
  dataRealizacao: string,
): string {
  // Garantir que matrícula tem 5 dígitos com zeros à esquerda
  const matriculaPadded = String(matricula).padStart(5, '0');

  // Remover traços e caracteres especiais da data (YYYY-MM-DD → YYYYMMDD)
  const dataFormatada = dataRealizacao.replace(/[-/\s]/g, '');

  // Garantir que código está em uppercase e sem espaços
  const codigoLimpo = codigo.toUpperCase().trim().replace(/\s+/g, '-');

  return `CERT-${matriculaPadded}-${codigoLimpo}-${dataFormatada}.pdf`;
}

/**
 * Valida se um nome de certificado segue o padrão esperado
 *
 * @param nomeCertificado - Nome do arquivo a validar
 * @returns true se válido, false caso contrário
 *
 * @example
 * validarNomeCertificado("CERT-00123-CRM-20250115.pdf") // true
 * validarNomeCertificado("certificado.pdf") // false
 */
export function validarNomeCertificado(nomeCertificado: string): boolean {
  const pattern = /^CERT-\d{5}-[A-Z0-9-]+-\d{8}\.pdf$/;
  return pattern.test(nomeCertificado);
}

/**
 * Extrai informações de um nome de certificado padronizado
 *
 * @param nomeCertificado - Nome do certificado
 * @returns Objeto com matricula, codigo e data, ou null se inválido
 *
 * @example
 * extrairInfoCertificado("CERT-00123-CRM-20250115.pdf")
 * // { matricula: "00123", codigo: "CRM", data: "2025-01-15" }
 */
export function extrairInfoCertificado(nomeCertificado: string): {
  matricula: string;
  codigo: string;
  data: string;
} | null {
  if (!validarNomeCertificado(nomeCertificado)) {
    return null;
  }

  const match = nomeCertificado.match(/^CERT-(\d{5})-([A-Z0-9-]+)-(\d{8})\.pdf$/);

  if (!match) {
    return null;
  }

  const [, matricula, codigo, dataNum] = match;

  // Converter YYYYMMDD para YYYY-MM-DD
  const ano = dataNum.slice(0, 4);
  const mes = dataNum.slice(4, 6);
  const dia = dataNum.slice(6, 8);
  const data = `${ano}-${mes}-${dia}`;

  return {
    matricula,
    codigo,
    data,
  };
}

/**
 * Gera nome de certificado a partir de um objeto de qualificação
 *
 * @param qualificacao - Objeto com dados da qualificação
 * @returns Nome do certificado formatado
 */
export function gerarNomeCertificadoFromQualificacao(qualificacao: {
  funcionario_matricula?: string;
  matricula?: string;
  qualificacao_codigo?: string;
  codigo?: string;
  data_realizacao?: string;
  data_conclusao?: string;
}): string {
  const matricula = qualificacao.funcionario_matricula || qualificacao.matricula || '00000';
  const codigo = qualificacao.qualificacao_codigo || qualificacao.codigo || 'QUAL';
  const data =
    qualificacao.data_realizacao ||
    qualificacao.data_conclusao ||
    new Date().toISOString().split('T')[0];

  return gerarNomeCertificado(matricula, codigo, data);
}

export default gerarNomeCertificado;
