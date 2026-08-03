/**
 * UTILIDADES DE NOMENCLATURA PADRONIZADA
 *
 * Padrões de nomenclatura para documentos da Pasta Virtual:
 *
 * Certificados de Qualificação:
 * - Formato: CERT-{NOME_FUNCIONARIO}-{CODIGO}-{DATA}.pdf
 * - Exemplo: CERT-JOAO_SILVA-PP-20251129.pdf
 *
 * Documentos Gerais:
 * - Formato: DOC-{TIPO}-{NOME_FUNCIONARIO}-{DATA}-{UUID}.pdf
 * - Exemplo: DOC-ASO-JOAO_SILVA-20251129-abc123.pdf
 *
 * Exames Médicos:
 * - Formato: EXAME-{TIPO}-{NOME_FUNCIONARIO}-{DATA}.pdf
 * - Exemplo: EXAME-ASO-JOAO_SILVA-20251129.pdf
 */

export type TipoDocumento =
  | 'CERTIFICADO_QUALIFICACAO'
  | 'EXAME_MEDICO'
  | 'DOCUMENTO_PESSOAL'
  | 'LICENCA'
  | 'TREINAMENTO'
  | 'OUTRO';

export interface NomeArquivoParams {
  tipo: TipoDocumento;
  cpf?: string; // CPF sem formatação (legado, opcional)
  nomeFuncionario?: string; // Nome do funcionário (novo padrão)
  codigo?: string; // Para certificados (ex: PP, PC, IFR)
  data: Date;
  subTipo?: string; // Para documentos (ex: ASO, CMA, RG, CPF)
  uuid?: string; // Para garantir unicidade
}

/**
 * Formata data no padrão YYYYMMDD
 */
function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Sanitiza nome do funcionário para uso em nomes de arquivo
 */
function sanitizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '_') // Substitui espaços por underscore
    .toUpperCase()
    .substring(0, 30); // Limite de 30 caracteres
}

/**
 * Gera nome de arquivo padronizado
 */
export function gerarNomeArquivoPadronizado(params: NomeArquivoParams): string {
  const { tipo, cpf, nomeFuncionario, codigo, data, subTipo, uuid } = params;
  const dataStr = formatDateYMD(data);
  const uuidShort = uuid ? uuid.substring(0, 8) : 'nouid';
  // Usar nome do funcionário se disponível, senão fallback para CPF
  const identificador = nomeFuncionario ? sanitizarNome(nomeFuncionario) : cpf || 'SEM_ID';

  switch (tipo) {
    case 'CERTIFICADO_QUALIFICACAO': {
      const codigoCert = codigo || subTipo || 'SEM_CODIGO';
      return `CERT-${identificador}-${codigoCert}-${dataStr}-${uuidShort}.pdf`;
    }

    case 'EXAME_MEDICO': {
      const tipoExame = subTipo || 'ASO';
      return `EXAME-${tipoExame}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    }

    case 'DOCUMENTO_PESSOAL': {
      const tipoDoc = subTipo || 'DOC';
      return `DOC-${tipoDoc}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    }

    case 'LICENCA': {
      const tipoLic = subTipo || 'LIC';
      return `LIC-${tipoLic}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    }

    case 'TREINAMENTO': {
      const nomeTrein = subTipo || 'TREIN';
      return `TREIN-${nomeTrein}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    }

    case 'OUTRO':
    default: {
      return `DOC-OUTROS-${cpf}-${dataStr}-${uuidShort}.pdf`;
    }
  }
}

/**
 * Gera chave R2 padronizada
 */
export function gerarChaveR2(funcionarioId: number, nomeArquivo: string): string {
  return `funcionarios/${funcionarioId}/${nomeArquivo}`;
}

/**
 * Valida metadados básicos declarados para um upload de PDF.
 */
export function validarPDF(file: File): { valido: boolean; erro?: string } {
  // Validar extensão
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.pdf')) {
    return { valido: false, erro: 'Apenas arquivos PDF são permitidos' };
  }

  // Validar MIME type
  if (file.type !== 'application/pdf' && file.type !== '') {
    return { valido: false, erro: 'Tipo de arquivo inválido. Apenas PDF é aceito.' };
  }

  // Validar tamanho (máximo 10MB)
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_SIZE) {
    return { valido: false, erro: 'Arquivo muito grande. Máximo 10MB.' };
  }

  // Validar tamanho mínimo (mínimo 1KB - evitar arquivos vazios)
  if (file.size < 1024) {
    return { valido: false, erro: 'Arquivo muito pequeno ou vazio.' };
  }

  return { valido: true };
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // %PDF-
const PDF_HEADER_SCAN_LIMIT = 1024;

/**
 * Confirma a assinatura binária `%PDF-` no início lógico do arquivo. A busca
 * limitada aos primeiros 1.024 bytes tolera o pequeno prefixo aceito por
 * leitores legados sem confiar na extensão ou no MIME enviados pelo cliente.
 */
export function validarAssinaturaPDF(conteudo: ArrayBuffer | Uint8Array): {
  valido: boolean;
  erro?: string;
} {
  const bytes = conteudo instanceof Uint8Array ? conteudo : new Uint8Array(conteudo);
  const scanLength = Math.min(bytes.byteLength, PDF_HEADER_SCAN_LIMIT);

  for (let offset = 0; offset <= scanLength - PDF_SIGNATURE.length; offset += 1) {
    let assinaturaEncontrada = true;

    for (let index = 0; index < PDF_SIGNATURE.length; index += 1) {
      if (bytes[offset + index] !== PDF_SIGNATURE[index]) {
        assinaturaEncontrada = false;
        break;
      }
    }

    if (assinaturaEncontrada) return { valido: true };
  }

  return {
    valido: false,
    erro: 'Conteúdo inválido. O arquivo enviado não possui assinatura de PDF.',
  };
}

/**
 * Extrai informações do nome do arquivo original (se seguir padrão)
 */
export function parseNomeArquivo(nomeArquivo: string): {
  tipo?: TipoDocumento;
  matricula?: string;
  codigo?: string;
  data?: string;
} | null {
  // Pattern: CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf
  const certPattern = /^CERT-([^-]+)-([^-]+)-(\d{8})\.pdf$/i;
  const certMatch = nomeArquivo.match(certPattern);
  if (certMatch) {
    return {
      tipo: 'CERTIFICADO_QUALIFICACAO',
      matricula: certMatch[1],
      codigo: certMatch[2],
      data: certMatch[3],
    };
  }

  // Pattern: EXAME-{TIPO}-{MATRICULA}-{DATA}.pdf
  const examePattern = /^EXAME-([^-]+)-([^-]+)-(\d{8})\.pdf$/i;
  const exameMatch = nomeArquivo.match(examePattern);
  if (exameMatch) {
    return {
      tipo: 'EXAME_MEDICO',
      matricula: exameMatch[2],
      data: exameMatch[3],
    };
  }

  // Pattern: DOC-{TIPO}-{MATRICULA}-{DATA}[-{UUID}].pdf
  const docPattern = /^DOC-([^-]+)-([^-]+)-(\d{8})(?:-[^.]+)?\.pdf$/i;
  const docMatch = nomeArquivo.match(docPattern);
  if (docMatch) {
    return {
      tipo: 'DOCUMENTO_PESSOAL',
      matricula: docMatch[2],
      data: docMatch[3],
    };
  }

  return null;
}
