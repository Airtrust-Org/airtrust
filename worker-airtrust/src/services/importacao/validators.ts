/**
 * VALIDATORS - Validação com FK Checks
 *
 * Validadores que verificam integridade referencial antes de inserir dados.
 * CRÍTICO: Histórico só pode ser inserido se funcionário e tipo existirem.
 */

import type { D1Database } from '@cloudflare/workers-types';
import { normalizeCPF, isValidCPF } from '../../utils/cpf';
import { parseFlexibleDate, isValidISODate } from '../../utils/dates';
import {
  FUNCIONARIOS_REQUIRED,
  QUALIFICACOES_TIPOS_REQUIRED,
  QUALIFICACOES_HISTORICO_REQUIRED,
  QUALIFICACOES_HISTORICO_FK_FIELDS,
  validateRequiredFields,
  normalizeCode,
  isValidEmail,
  isValidNota,
} from './columnMappings';

export interface ValidationError {
  line: number;
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ================================================================
// FUNCIONÁRIOS
// ================================================================

export async function validateFuncionarioRow(
  row: Record<string, unknown>,
  lineNumber: number,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // 1. Campos obrigatórios
  const { valid, missing } = validateRequiredFields(row, FUNCIONARIOS_REQUIRED);
  if (!valid) {
    for (const field of missing) {
      errors.push({
        line: lineNumber,
        field,
        message: `Campo obrigatório não preenchido`,
      });
    }
  }

  // 2. Nome: min 3 caracteres
  if (row.Nome && String(row.Nome).trim().length < 3) {
    errors.push({
      line: lineNumber,
      field: 'Nome',
      message: 'Nome deve ter no mínimo 3 caracteres',
      value: row.Nome,
    });
  }

  // 3. CPF: validar FORMAT + dígitos verificadores
  // Duplicatas são tratadas pelo import() conforme o modo (INSERT/UPDATE/UPSERT)
  if (row.CPF) {
    const cpf = normalizeCPF(row.CPF);
    if (!cpf || cpf.length !== 11) {
      errors.push({
        line: lineNumber,
        field: 'CPF',
        message: 'CPF inválido - deve ter 11 dígitos',
        value: row.CPF,
      });
    } else if (!isValidCPF(cpf)) {
      errors.push({
        line: lineNumber,
        field: 'CPF',
        message: 'CPF inválido - dígitos verificadores incorretos',
        value: row.CPF,
      });
    } else {
      // ✅ Normalizar o CPF na própria row para uso posterior
      row.CPF = cpf;
    }
  }

  // 4. Matrícula: não pode estar vazia
  // Duplicatas são tratadas pelo import() conforme o modo
  if (!row.Matricula || String(row.Matricula).trim().length === 0) {
    // Erro já foi capturado em campos obrigatórios
  }

  // 5. Email: formato válido (apenas se fornecido)
  if (row.Email && String(row.Email).trim() !== '') {
    if (!isValidEmail(row.Email)) {
      errors.push({
        line: lineNumber,
        field: 'Email',
        message: 'Email inválido',
        value: row.Email,
      });
    }
  }

  // 6. Nascimento: aceitar formatos DD/MM/YYYY, YYYY-MM-DD, ou números (Excel)
  // Parse e validação robusta
  if (row.Nascimento && String(row.Nascimento).trim() !== '') {
    const parsed = parseFlexibleDate(row.Nascimento);
    if (!parsed) {
      errors.push({
        line: lineNumber,
        field: 'Nascimento',
        message: 'Data inválida. Use DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD ou número Excel',
        value: row.Nascimento,
      });
    } else {
      // ✅ Converter para ISO na própria row
      row.Nascimento = parsed;
    }
  }

  // 7. Admissao: aceitar formatos DD/MM/YYYY, YYYY-MM-DD, ou números (Excel)
  // Parse e validação robusta
  if (row.Admissao && String(row.Admissao).trim() !== '') {
    const parsed = parseFlexibleDate(row.Admissao);
    if (!parsed) {
      errors.push({
        line: lineNumber,
        field: 'Admissao',
        message: 'Data inválida. Use DD/MM/YYYY, DD/MM/YY, YYYY-MM-DD ou número Excel',
        value: row.Admissao,
      });
    } else {
      // ✅ Converter para ISO na própria row
      row.Admissao = parsed;
    }
  }

  return errors;
}

// ================================================================
// QUALIFICAÇÕES TIPOS
// ================================================================

export async function validateQualificacaoTipoRow(
  row: Record<string, unknown>,
  lineNumber: number,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  console.log(`[validators] validateQualificacaoTipoRow linha ${lineNumber}:`, row);

  // 1. Campos obrigatórios - verifica se estão presentes E não vazios
  const { valid, missing } = validateRequiredFields(row, QUALIFICACOES_TIPOS_REQUIRED);
  if (!valid) {
    for (const field of missing) {
      errors.push({
        line: lineNumber,
        field,
        message: `Campo obrigatório não preenchido`,
        value: row[field],
      });
    }
    // Se faltam campos obrigatórios, retorna aqui (não faz sentido validar outros)
    return errors;
  }

  // 2. Código: apenas validar formato (não checar duplicatas!)
  // Duplicatas são tratadas pelo endpoint conforme o modo selecionado
  const codigoRaw = row.codigo;
  if (codigoRaw) {
    const codigo = normalizeCode(codigoRaw);
    if (!codigo) {
      errors.push({
        line: lineNumber,
        field: 'codigo',
        message: 'Código inválido - deve ser texto',
        value: row.codigo,
      });
    }
    // NÃO checar duplicatas aqui! O endpoint trata conforme o modo
  }

  // 3. Nome: min 3 caracteres
  if (row.nome) {
    const nomeStr = String(row.nome).trim();
    if (nomeStr.length < 3) {
      errors.push({
        line: lineNumber,
        field: 'nome',
        message: 'Nome deve ter no mínimo 3 caracteres',
        value: row.nome,
      });
    }
  }

  // 4. Validade (em meses) - opcional
  if (row.validade !== null && row.validade !== undefined && String(row.validade).trim() !== '') {
    const validadeStr = String(row.validade).trim();
    const validade = parseInt(validadeStr, 10);
    if (isNaN(validade) || validade <= 0) {
      errors.push({
        line: lineNumber,
        field: 'validade',
        message: 'Validade deve ser um número inteiro maior que 0 (em meses)',
        value: row.validade,
      });
    }
  }

  // 5. Carga horária - opcional
  if (
    row.carga_horaria !== null &&
    row.carga_horaria !== undefined &&
    String(row.carga_horaria).trim() !== ''
  ) {
    const chStr = String(row.carga_horaria).trim();
    const ch = parseFloat(chStr);
    if (isNaN(ch) || ch <= 0) {
      errors.push({
        line: lineNumber,
        field: 'carga_horaria',
        message: 'Carga horária deve ser um número decimal maior que 0',
        value: row.carga_horaria,
      });
    }
  }

  if (errors.length > 0) {
    console.log(`[validators] Erros encontrados na linha ${lineNumber}:`, errors);
  }

  return errors;
}

// ================================================================
// QUALIFICAÇÕES HISTÓRICO (COM FK CHECKS)
// ================================================================

export async function validateQualificacaoHistoricoRow(
  row: Record<string, unknown>,
  lineNumber: number,
  db: D1Database,
  validCPFs?: Set<string>,
  validCodigos?: Set<string>,
  skipFKCheck?: boolean,
  empresaId?: number,
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // 1. Campos obrigatórios
  const { valid, missing } = validateRequiredFields(row, QUALIFICACOES_HISTORICO_REQUIRED);
  if (!valid) {
    for (const field of missing) {
      errors.push({
        line: lineNumber,
        field,
        message: `Campo obrigatório não preenchido`,
      });
    }
    // Se faltam campos obrigatórios, parar aqui (não faz sentido validar FKs)
    return errors;
  }

  // Se skipFKCheck=true, não validar existência de CPF/Código (serão criados automaticamente)
  if (skipFKCheck) {
    return errors;
  }

  // 2. FK: Funcionário existe?
  if (row.funcionario_cpf) {
    const cpf = normalizeCPF(row.funcionario_cpf);
    if (!cpf) {
      errors.push({
        line: lineNumber,
        field: 'funcionario_cpf',
        message: 'CPF inválido',
        value: row.funcionario_cpf,
      });
    } else {
      // OTIMIZAÇÃO: Se temos o Set, usar lookup O(1)
      if (validCPFs) {
        if (!validCPFs.has(cpf)) {
          errors.push({
            line: lineNumber,
            field: 'funcionario_cpf',
            message: `${QUALIFICACOES_HISTORICO_FK_FIELDS.funcionario_cpf.errorMessage} (CPF: ${cpf})`,
            value: row.funcionario_cpf,
          });
        }
      } else {
        // Fallback: query individual
        const funcionarioQuery = empresaId != null
          ? 'SELECT cpf FROM funcionarios WHERE cpf = ? AND empresa_id = ? AND deleted_at IS NULL'
          : 'SELECT cpf FROM funcionarios WHERE cpf = ? AND deleted_at IS NULL';
        const funcionarioBinds = empresaId != null ? [cpf, empresaId] : [cpf];

        const funcionario = await db
          .prepare(funcionarioQuery)
          .bind(...funcionarioBinds)
          .first();

        if (!funcionario) {
          errors.push({
            line: lineNumber,
            field: 'funcionario_cpf',
            message: `${QUALIFICACOES_HISTORICO_FK_FIELDS.funcionario_cpf.errorMessage} (CPF: ${cpf})`,
            value: row.funcionario_cpf,
          });
        }
      }
    }
  }

  // 3. FK: Qualificação existe?
  if (row.qualificacao_codigo) {
    const codigo = normalizeCode(row.qualificacao_codigo);
    if (!codigo) {
      errors.push({
        line: lineNumber,
        field: 'qualificacao_codigo',
        message: 'Código inválido',
        value: row.qualificacao_codigo,
      });
    } else {
      const codigoUpper = codigo.toUpperCase();
      // OTIMIZAÇÃO: Se temos o Set, usar lookup O(1)
      if (validCodigos) {
        if (!validCodigos.has(codigoUpper)) {
          errors.push({
            line: lineNumber,
            field: 'qualificacao_codigo',
            message: `${QUALIFICACOES_HISTORICO_FK_FIELDS.qualificacao_codigo.errorMessage} (Código: ${codigo})`,
            value: row.qualificacao_codigo,
          });
        }
      } else {
        // Fallback: query individual
        const qualQuery = empresaId != null
          ? 'SELECT codigo FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ? AND deleted_at IS NULL'
          : 'SELECT codigo FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND deleted_at IS NULL';
        const qualBinds = empresaId != null ? [codigo, empresaId] : [codigo];

        const qualificacao = await db
          .prepare(qualQuery)
          .bind(...qualBinds)
          .first();

        if (!qualificacao) {
          errors.push({
            line: lineNumber,
            field: 'qualificacao_codigo',
            message: `${QUALIFICACOES_HISTORICO_FK_FIELDS.qualificacao_codigo.errorMessage} (Código: ${codigo})`,
            value: row.qualificacao_codigo,
          });
        }
      }
    }
  }

  // 4. Data conclusão: obrigatória e válida
  if (row.data_conclusao && !isValidISODate(row.data_conclusao)) {
    errors.push({
      line: lineNumber,
      field: 'data_conclusao',
      message: 'Data inválida. Use formato YYYY-MM-DD',
      value: row.data_conclusao,
    });
  }

  // 5. Data vencimento: se fornecida, deve ser válida
  if (row.data_vencimento && !isValidISODate(row.data_vencimento)) {
    errors.push({
      line: lineNumber,
      field: 'data_vencimento',
      message: 'Data inválida. Use formato YYYY-MM-DD',
      value: row.data_vencimento,
    });
  }

  // 6. Nota: validar range 1.0 a 5.0
  if (row.nota && !isValidNota(row.nota)) {
    errors.push({
      line: lineNumber,
      field: 'nota',
      message: 'Nota deve estar entre 1.0 e 5.0',
      value: row.nota,
    });
  }

  // 7. Carga horária: se fornecida, deve ser > 0
  if (row.carga_horaria !== null && row.carga_horaria !== undefined && row.carga_horaria !== '') {
    const ch = parseFloat(String(row.carga_horaria));
    if (isNaN(ch) || ch <= 0) {
      errors.push({
        line: lineNumber,
        field: 'carga_horaria',
        message: 'Carga horária deve ser um número maior que 0',
        value: row.carga_horaria,
      });
    }
  }

  // 8. Modalidade: valores permitidos
  if (row.modalidade) {
    const modalidade = String(row.modalidade).toUpperCase();
    if (!['PRESENCIAL', 'EAD', 'HIBRIDO'].includes(modalidade)) {
      errors.push({
        line: lineNumber,
        field: 'modalidade',
        message: 'Modalidade deve ser: PRESENCIAL, EAD ou HIBRIDO',
        value: row.modalidade,
      });
    }
  }

  return errors;
}

// ================================================================
// HELPER: Validar batch completo
// ================================================================

export async function validateBatch<T extends Record<string, unknown>>(
  rows: T[],
  validator: (row: T, line: number, db: D1Database) => Promise<ValidationError[]>,
  db: D1Database,
): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowErrors = await validator(rows[i], i + 2, db); // +2 porque linha 1 é header
    allErrors.push(...rowErrors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
