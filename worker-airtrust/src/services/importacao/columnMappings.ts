/**
 * COLUMN MAPPINGS
 *
 * Mapeamento das colunas das planilhas oficiais para campos do banco.
 * Define também campos obrigatórios e validações.
 *
 * IMPORTANTE: Os nomes das colunas seguem EXATAMENTE as planilhas oficiais (sem acentos).
 */

// ================================================================
// FUNCIONÁRIOS
// ================================================================

export const FUNCIONARIOS_COLUMNS = {
  Nome: 'nome',
  Guerra: 'guerra',
  Funcao: 'funcao',
  Aeronave: 'aeronave',
  CPF: 'cpf',
  Data_Nascimento: 'nascimento',
  Licenca: 'licenca',
  CANAC: 'codigo_anac',
  Sispat: 'sispat',
  Prestserv: 'prestserv',
  Email: 'email',
  Telefone: 'telefone',
  Admissao: 'admissao',
  Matricula: 'matricula',
} as const;

export const FUNCIONARIOS_REQUIRED = ['Nome', 'CPF', 'Matricula'] as const;

export const FUNCIONARIOS_UNIQUE = ['CPF', 'Matricula'] as const;

export type FuncionarioColumnKey = keyof typeof FUNCIONARIOS_COLUMNS;
export type FuncionarioFieldKey = (typeof FUNCIONARIOS_COLUMNS)[FuncionarioColumnKey];

// ================================================================
// QUALIFICAÇÕES TIPOS
// ================================================================

export const QUALIFICACOES_TIPOS_COLUMNS = {
  tipo: 'tipo',
  codigo: 'codigo',
  nome: 'nome',
  descricao: 'descricao',
  categoria: 'categoria',
  carga_horaria: 'carga_horaria',
  validade: 'validade',
  observacoes: 'observacoes',
} as const;

export const QUALIFICACOES_TIPOS_REQUIRED = ['codigo', 'nome'] as const;

export const QUALIFICACOES_TIPOS_UNIQUE = ['codigo'] as const;

export type QualificacaoTipoColumnKey = keyof typeof QUALIFICACOES_TIPOS_COLUMNS;
export type QualificacaoTipoFieldKey =
  (typeof QUALIFICACOES_TIPOS_COLUMNS)[QualificacaoTipoColumnKey];

// ================================================================
// QUALIFICAÇÕES HISTÓRICO (SIMPLIFICADO - APENAS 3 CAMPOS)
// Todos os outros dados são calculados automaticamente via JOINs
// ================================================================

export const QUALIFICACOES_HISTORICO_COLUMNS = {
  funcionario_cpf: 'funcionario_cpf',
  qualificacao_codigo: 'qualificacao_codigo',
  data_conclusao: 'data_conclusao',
} as const;

export const QUALIFICACOES_HISTORICO_REQUIRED = [
  'funcionario_cpf',
  'qualificacao_codigo',
  'data_conclusao',
] as const;

export const QUALIFICACOES_HISTORICO_FK_FIELDS = {
  funcionario_cpf: {
    table: 'funcionarios',
    column: 'cpf',
    errorMessage: 'CPF do funcionário não encontrado. Importe Funcionários primeiro.',
  },
  qualificacao_codigo: {
    table: 'qualificacoes_tipos',
    column: 'codigo',
    errorMessage: 'Código da qualificação não encontrado. Importe Tipos primeiro.',
  },
} as const;

export type QualificacaoHistoricoColumnKey = keyof typeof QUALIFICACOES_HISTORICO_COLUMNS;
export type QualificacaoHistoricoFieldKey =
  (typeof QUALIFICACOES_HISTORICO_COLUMNS)[QualificacaoHistoricoColumnKey];

// ================================================================
// HELPERS
// ================================================================

/**
 * Mapeia row da planilha para objeto do banco
 */
export function mapRowToFields<T extends Record<string, string>>(
  row: Record<string, unknown>,
  mapping: T,
): Partial<Record<T[keyof T], unknown>> {
  const result: Record<string, unknown> = {};

  for (const [columnName, fieldName] of Object.entries(mapping)) {
    if (columnName in row) {
      result[fieldName] = row[columnName];
    }
  }

  return result as Partial<Record<T[keyof T], unknown>>;
}

/**
 * Valida se todos os campos obrigatórios estão presentes
 */
export function validateRequiredFields(
  row: Record<string, unknown>,
  requiredColumns: readonly string[],
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const column of requiredColumns) {
    const value = row[column];
    if (value === null || value === undefined || value === '') {
      missing.push(column);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Normaliza valor para uppercase (usado em códigos)
 */
export function normalizeCode(value: unknown): string | null {
  if (!value) return null;
  return String(value).trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * Normaliza CPF: remove máscara
 */
export function normalizeCPF(value: unknown): string | null {
  if (!value) return null;
  return String(value).replace(/\D/g, '');
}

/**
 * Valida formato de data ISO
 */
export function isValidISODate(value: unknown): boolean {
  if (!value) return true; // null/undefined são válidos (opcional)
  const str = String(value);
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(str)) return false;

  const date = new Date(str);
  return !isNaN(date.getTime());
}

/**
 * Valida email
 */
export function isValidEmail(value: unknown): boolean {
  if (!value) return true; // opcional
  const str = String(value);
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(str);
}

/**
 * Valida nota (1.0 a 5.0)
 */
export function isValidNota(value: unknown): boolean {
  if (!value) return true; // opcional
  const num = parseFloat(String(value));
  return !isNaN(num) && num >= 1.0 && num <= 5.0;
}

/**
 * Remapeia linha parseada para headers esperados
 * ✅ COMPLETAMENTE case-insensitive
 * ✅ Aceita espaços, underscores, hífens, acentos
 * ✅ Usa Levenshtein para fuzzy matching como fallback
 * ✅ Registra warnings de headers desconhecidos
 */
export function remapRowHeaders(
  row: Record<string, unknown>,
  entidade: 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico',
): Record<string, unknown> {
  /**
   * PASSO 1: Normalizar chave completamente
   * - lowercase
   * - remover acentos (ã→a, ç→c, etc)
   * - substituir espaços/hífens/underscores por _
   * - remover caracteres especiais
   */
  const normalizeKey = (key: string): string => {
    // Remover acentos usando NFD + replace
    const normalized = key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos
      .toLowerCase()
      .trim()
      .replace(/[\s\-_]+/g, '_'); // Espacos/hífens/underscores -> _
    return normalized;
  };

  /**
   * PASSO 2: Fuzzy matching (Levenshtein) para headers que não acham
   */
  const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }
    return matrix[b.length][a.length];
  };

  if (entidade === 'funcionarios') {
    // Aliases definitivos - TODAS as variações conhecidas
    const expectedHeaders: Record<string, string[]> = {
      Nome: ['nome', 'name', 'employee_name', 'full_name', 'fullname'],
      Guerra: ['guerra', 'callsign', 'call_sign', 'nickname', 'apelido'],
      Funcao: ['funcao', 'funcão', 'function', 'job', 'position', 'cargo'],
      Aeronave: ['aeronave', 'aircraft', 'aviao', 'avião'],
      CPF: ['cpf', 'cpf_cnpj', 'social_id'],
      Nascimento: [
        'nascimento',
        'data_nascimento',
        'data_nasc',
        'date_of_birth',
        'dob',
        'birthdate',
        'birth_date',
      ],
      Licenca: ['licenca', 'licença', 'license', 'licence', 'pilot_license'],
      CANAC: ['codigo_anac', 'c_anac', 'anac_code'],
      Sispat: ['sispat', 'sistema_patrimonial', 'patrimony', 'sispat_number'],
      Prestserv: ['prestserv', 'prest_serv', 'prestacao_servicos', 'service_provider'],
      Email: ['email', 'e-mail', 'e_mail', 'mail', 'electronic_mail'],
      Telefone: ['telefone', 'phone', 'tel', 'telefone_numero', 'phone_number'],
      Admissao: [
        'admissao',
        'admissão',
        'hire_date',
        'data_admissao',
        'data_hire',
        'admission_date',
        'start_date',
      ],
      Matricula: [
        'matricula',
        'matrícula',
        'employee_id',
        'emp_id',
        'staff_number',
        'employee_number',
        'registry',
      ],
    };

    // Normalize aliases para busca
    const normalizedAliases: Map<string, string> = new Map();
    for (const [expected, aliases] of Object.entries(expectedHeaders)) {
      for (const alias of aliases) {
        normalizedAliases.set(normalizeKey(alias), expected);
      }
    }

    // Processar linha
    const remapped: Record<string, unknown> = {};
    const unmappedHeaders: string[] = [];

    for (const [originalKey, value] of Object.entries(row)) {
      const normalized = normalizeKey(originalKey);

      // PASSO 3: Busca exata (rápido)
      const exactMatch = normalizedAliases.get(normalized);
      if (exactMatch) {
        remapped[exactMatch] = value;
        continue;
      }

      // PASSO 4: Fuzzy matching (lento, fallback)
      let bestMatch: string | null = null;
      let bestDistance = 3; // Threshold máximo de diferença

      for (const [normAlias, expected] of normalizedAliases) {
        const distance = levenshteinDistance(normalized, normAlias);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = expected;
        }
      }

      if (bestMatch) {
        remapped[bestMatch] = value;
        console.warn(
          `[remapRowHeaders] Fuzzy match: "${originalKey}" → "${bestMatch}" (dist: ${bestDistance})`,
        );
      } else {
        // Manter chave original se não encontrar nada
        remapped[originalKey] = value;
        unmappedHeaders.push(originalKey);
      }
    }

    if (unmappedHeaders.length > 0) {
      console.warn(`[remapRowHeaders] Headers desconhecidos:`, unmappedHeaders);
    }

    return remapped;
  } else if (entidade === 'qualificacoes_tipos') {
    // Aliases para Tipos
    const expectedHeaders: Record<string, string[]> = {
      tipo: ['tipo', 'type', 'tipo_qualificacao'],
      codigo: [
        'codigo',
        'código',
        'code',
        'codigo_qualificacao',
        'qualification_code',
        'code_type',
      ],
      nome: ['nome', 'name', 'nome_tipo', 'type_name'],
      descricao: ['descricao', 'descrição', 'description', 'desc'],
      categoria: ['categoria', 'category', 'tipo_categoria'],
      carga_horaria: [
        'carga_horaria',
        'carga_horário',
        'carga horaria',
        'carga-horaria',
        'hours',
        'load',
        'hours_required',
      ],
      validade: [
        'validade',
        'validade_meses',
        'meses',
        'months',
        'validity',
        'validez',
        'validity_months',
      ],
      observacoes: ['observacoes', 'observações', 'notes', 'remarks', 'obs', 'observacao'],
    };

    const normalizedAliases: Map<string, string> = new Map();
    for (const [expected, aliases] of Object.entries(expectedHeaders)) {
      for (const alias of aliases) {
        normalizedAliases.set(normalizeKey(alias), expected);
      }
    }

    const remapped: Record<string, unknown> = {};
    const unmappedHeaders: string[] = [];

    for (const [originalKey, value] of Object.entries(row)) {
      const normalized = normalizeKey(originalKey);

      // Busca exata
      const exactMatch = normalizedAliases.get(normalized);
      if (exactMatch) {
        remapped[exactMatch] = value;
        continue;
      }

      // Fuzzy matching
      let bestMatch: string | null = null;
      let bestDistance = 2;

      for (const [normAlias, expected] of normalizedAliases) {
        const distance = levenshteinDistance(normalized, normAlias);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = expected;
        }
      }

      if (bestMatch) {
        remapped[bestMatch] = value;
        console.warn(
          `[remapRowHeaders] Tipos fuzzy: "${originalKey}" → "${bestMatch}" (dist: ${bestDistance})`,
        );
      } else {
        remapped[originalKey] = value;
        unmappedHeaders.push(originalKey);
      }
    }

    if (unmappedHeaders.length > 0) {
      console.warn(`[remapRowHeaders Tipos] Headers desconhecidos:`, unmappedHeaders);
    }

    return remapped;
  } else if (entidade === 'qualificacoes_historico') {
    // Aliases para Histórico
    const expectedHeaders: Record<string, string[]> = {
      funcionario_cpf: [
        'funcionario_cpf',
        'funcionario_cpf',
        'cpf',
        'cpf_funcionario',
        'employee_cpf',
        'cpf_employee',
      ],
      qualificacao_codigo: [
        'qualificacao_codigo',
        'qualificacao_codigo',
        'codigo',
        'codigo_qualificacao',
        'qualification_code',
        'code',
      ],
      data_conclusao: [
        'data_conclusao',
        'data_conclusão',
        'data conclusao',
        'completion_date',
        'date_completed',
      ],
      data_vencimento: [
        'data_vencimento',
        'data_vencimento',
        'data vencimento',
        'expiry_date',
        'validade',
        'validity_date',
      ],
      carga_horaria: ['carga_horaria', 'carga_horário', 'carga horaria', 'hours', 'load'],
      nota: ['nota', 'grade', 'score', 'mark'],
      codigo: ['codigo', 'código', 'code'],
      certificado_arquivo_id: ['certificado_arquivo_id', 'arquivo', 'certificate_id', 'cert_id'],
      instrutor: ['instrutor', 'instructor', 'trainer'],
      local: ['local', 'location', 'local_treinamento', 'training_location'],
      modalidade: ['modalidade', 'modality', 'tipo_treinamento', 'training_type'],
      observacoes: ['observacoes', 'observações', 'notes', 'remarks', 'obs'],
    };

    const normalizedAliases: Map<string, string> = new Map();
    for (const [expected, aliases] of Object.entries(expectedHeaders)) {
      for (const alias of aliases) {
        normalizedAliases.set(normalizeKey(alias), expected);
      }
    }

    const remapped: Record<string, unknown> = {};
    const unmappedHeaders: string[] = [];

    for (const [originalKey, value] of Object.entries(row)) {
      const normalized = normalizeKey(originalKey);

      // Busca exata
      const exactMatch = normalizedAliases.get(normalized);
      if (exactMatch) {
        remapped[exactMatch] = value;
        continue;
      }

      // Fuzzy matching
      let bestMatch: string | null = null;
      let bestDistance = 2;

      for (const [normAlias, expected] of normalizedAliases) {
        const distance = levenshteinDistance(normalized, normAlias);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = expected;
        }
      }

      if (bestMatch) {
        remapped[bestMatch] = value;
        console.warn(
          `[remapRowHeaders] Historico fuzzy: "${originalKey}" → "${bestMatch}" (dist: ${bestDistance})`,
        );
      } else {
        remapped[originalKey] = value;
        unmappedHeaders.push(originalKey);
      }
    }

    if (unmappedHeaders.length > 0) {
      console.warn(`[remapRowHeaders Histórico] Headers desconhecidos:`, unmappedHeaders);
    }

    return remapped;
  }

  return row;
}
