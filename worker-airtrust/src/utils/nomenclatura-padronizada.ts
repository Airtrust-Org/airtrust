/**
 * Utilidades de nomenclatura padronizada da Pasta Virtual.
 *
 * A categoria funcional é codificada no prefixo do arquivo para que documentos
 * novos possam ser agrupados sem migration de dados e sem alterar registros
 * históricos já existentes.
 */

export type TipoDocumento =
  | 'CERTIFICADO_QUALIFICACAO'
  | 'AVALIACAO_CQ'
  | 'FTV'
  | 'EXAME_MEDICO'
  | 'DOCUMENTO_PESSOAL'
  | 'LICENCA'
  | 'SIMULADOR'
  | 'DESIGNACAO_OPERACIONAL'
  | 'EXPERIENCIA_HORAS'
  | 'INSTRUTOR_EXAMINADOR'
  | 'VINCULO_FUNCIONAL'
  | 'CURRICULO_PROFISSIONAL'
  | 'TREINAMENTO'
  | 'OUTRO';

/**
 * Normaliza categorias históricas/da UI para o contrato canônico usado na
 * nomenclatura. Valores desconhecidos permanecem em OUTRO (fail closed para
 * classificação documental; nunca inventamos uma categoria a partir do texto).
 */
export function normalizarTipoDocumento(value: unknown): TipoDocumento {
  const normalized = String(value || 'OUTRO')
    .trim()
    .toUpperCase();
  switch (normalized) {
    case 'CERTIFICADO_QUALIFICACAO':
    case 'CERTIFICADO_PROFISSIONAL':
      return 'CERTIFICADO_QUALIFICACAO';
    case 'AVALIACAO_CQ':
      return 'AVALIACAO_CQ';
    case 'FTV':
      return 'FTV';
    case 'EXAME_MEDICO':
      return 'EXAME_MEDICO';
    case 'DOCUMENTO_PESSOAL':
      return 'DOCUMENTO_PESSOAL';
    case 'LICENCA_ANAC':
    case 'LICENCA':
      return 'LICENCA';
    case 'SIMULADOR':
      return 'SIMULADOR';
    case 'DESIGNACAO_OPERACIONAL':
      return 'DESIGNACAO_OPERACIONAL';
    case 'EXPERIENCIA_HORAS':
      return 'EXPERIENCIA_HORAS';
    case 'INSTRUTOR_EXAMINADOR':
      return 'INSTRUTOR_EXAMINADOR';
    case 'VINCULO_FUNCIONAL':
    case 'CONTRATO':
      return 'VINCULO_FUNCIONAL';
    case 'CURRICULO_PROFISSIONAL':
      return 'CURRICULO_PROFISSIONAL';
    case 'TREINAMENTO':
      return 'TREINAMENTO';
    case 'OUTROS':
    case 'OUTRO':
    default:
      return 'OUTRO';
  }
}

export interface NomeArquivoParams {
  tipo: TipoDocumento;
  cpf?: string;
  nomeFuncionario?: string;
  codigo?: string;
  data: Date;
  subTipo?: string;
  uuid?: string;
}

function formatDateYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function sanitizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toUpperCase()
    .substring(0, 30);
}

function sanitizarSubtipo(value: string | undefined, fallback: string): string {
  const clean = String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.\s-]/g, '')
    .replace(/[-.\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();
  return clean || fallback;
}

export function gerarNomeArquivoPadronizado(params: NomeArquivoParams): string {
  const { tipo, cpf, nomeFuncionario, codigo, data, subTipo, uuid } = params;
  const dataStr = formatDateYMD(data);
  const uuidShort = uuid ? uuid.substring(0, 8) : 'nouid';
  const identificador = nomeFuncionario ? sanitizarNome(nomeFuncionario) : cpf || 'SEM_ID';
  const subtipo = sanitizarSubtipo(subTipo || codigo, 'DOC');

  switch (tipo) {
    case 'CERTIFICADO_QUALIFICACAO':
      return `CERT-${identificador}-${sanitizarSubtipo(codigo || subTipo, 'SEM_CODIGO')}-${dataStr}-${uuidShort}.pdf`;
    case 'AVALIACAO_CQ':
      return `AVAL-${subtipo}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'FTV':
      return `FTV-${subtipo}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'EXAME_MEDICO':
      return `EXAME-${sanitizarSubtipo(subTipo, 'ASO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'DOCUMENTO_PESSOAL':
      return `DOC-${subtipo}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'LICENCA':
      return `LIC-${sanitizarSubtipo(subTipo, 'LIC')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'SIMULADOR':
      return `SIM-${sanitizarSubtipo(subTipo, 'FICHA_SESSAO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'DESIGNACAO_OPERACIONAL':
      return `DESIG-${sanitizarSubtipo(subTipo, 'FUNCAO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'EXPERIENCIA_HORAS':
      return `EXP-${sanitizarSubtipo(subTipo, 'EXPERIENCIA')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'INSTRUTOR_EXAMINADOR':
      return `INST-${sanitizarSubtipo(subTipo, 'CREDENCIAMENTO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'VINCULO_FUNCIONAL':
      return `VINC-${sanitizarSubtipo(subTipo, 'REGISTRO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'CURRICULO_PROFISSIONAL':
      return `CURR-${sanitizarSubtipo(subTipo, 'CURRICULO')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'TREINAMENTO':
      return `TREIN-${sanitizarSubtipo(subTipo, 'TREIN')}-${identificador}-${dataStr}-${uuidShort}.pdf`;
    case 'OUTRO':
    default:
      return `DOC-OUTROS-${identificador}-${dataStr}-${uuidShort}.pdf`;
  }
}

export function gerarChaveR2(funcionarioId: number, nomeArquivo: string): string {
  return `funcionarios/${funcionarioId}/${nomeArquivo}`;
}

export function validarPDF(file: File): { valido: boolean; erro?: string } {
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith('.pdf')) {
    return { valido: false, erro: 'Apenas arquivos PDF são permitidos' };
  }
  if (file.type !== 'application/pdf' && file.type !== '') {
    return { valido: false, erro: 'Tipo de arquivo inválido. Apenas PDF é aceito.' };
  }
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { valido: false, erro: 'Arquivo muito grande. Máximo 10MB.' };
  }
  if (file.size < 1024) {
    return { valido: false, erro: 'Arquivo muito pequeno ou vazio.' };
  }
  return { valido: true };
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PDF_HEADER_SCAN_LIMIT = 1024;

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

export function parseNomeArquivo(nomeArquivo: string): {
  tipo?: TipoDocumento;
  matricula?: string;
  codigo?: string;
  data?: string;
} | null {
  const semExtensao = nomeArquivo.replace(/\.pdf$/i, '');
  const parts = semExtensao.split('-');
  const prefix = parts[0]?.toUpperCase();
  const data = parts.find((part) => /^\d{8}$/.test(part));

  if (prefix === 'CERT' && parts.length >= 4) {
    return { tipo: 'CERTIFICADO_QUALIFICACAO', matricula: parts[1], codigo: parts[2], data };
  }

  const typeByPrefix: Record<string, TipoDocumento> = {
    AVAL: 'AVALIACAO_CQ',
    FTV: 'FTV',
    EXAME: 'EXAME_MEDICO',
    DOC: 'DOCUMENTO_PESSOAL',
    LIC: 'LICENCA',
    SIM: 'SIMULADOR',
    DESIG: 'DESIGNACAO_OPERACIONAL',
    EXP: 'EXPERIENCIA_HORAS',
    INST: 'INSTRUTOR_EXAMINADOR',
    VINC: 'VINCULO_FUNCIONAL',
    CURR: 'CURRICULO_PROFISSIONAL',
    TREIN: 'TREINAMENTO',
  };
  const tipo = typeByPrefix[prefix || ''];
  if (!tipo) return null;
  if (prefix === 'DOC' && parts[1]?.toUpperCase() === 'OUTROS') return { tipo: 'OUTRO', data };
  return { tipo, codigo: parts[1], data };
}
