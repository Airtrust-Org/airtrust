/**
 * FUNCIONARIO IMPORTACAO - Refatorado (Schema Normalizado)
 *
 * Schema refletindo EXATAMENTE a planilha oficial:
 * - 14 colunas sem acentos
 * - Campos obrigatórios: Nome, CPF, Matricula
 * - Validação de integridade e unicidade
 */

import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { parseFlexibleDate } from '../../utils/dates';
import { normalizeCPF } from '../../utils/cpf';
import { FUNCIONARIOS_COLUMNS } from './columnMappings';
import { validateFuncionarioRow, type ValidationError } from './validators';

// ===== SCHEMA NORMALIZADO (14 campos da planilha) =====

export const FuncionarioImportSchema = z.object({
  Nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  Guerra: z.string().optional().nullable(),
  Funcao: z.string().optional().nullable(),
  Aeronave: z.string().optional().nullable(),
  CPF: z.string().min(11, 'CPF obrigatório'),
  Nascimento: z.string().optional().nullable(), // DD/MM/YYYY
  Licenca: z.string().optional().nullable(),
  CANAC: z.string().optional().nullable(),
  Sispat: z.string().optional().nullable(),
  Prestserv: z.string().optional().nullable(),
  Email: z.string().optional().nullable(),
  Telefone: z.string().optional().nullable(),
  Admissao: z.string().optional().nullable(), // DD/MM/YYYY
  Matricula: z.string().min(1, 'Matrícula obrigatória'),
});

export type FuncionarioImportData = z.infer<typeof FuncionarioImportSchema>;

// ===== RESULT TYPES =====

export interface ImportResult {
  success: boolean;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: ValidationError[];
}

// ===== SERVICE =====

export class FuncionarioImportacao {
  constructor(
    private db: D1Database,
    private empresaId: number,
  ) {}

  /**
   * Valida batch completo sem inserir
   */
  async validate(rows: Record<string, unknown>[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowErrors = await validateFuncionarioRow(rows[i], i + 2);
      errors.push(...rowErrors);
    }

    return errors;
  }

  /**
   * Importa funcionários com validação completa
   *
   * MODOS:
   * - INSERT: Insere apenas se não existe no tenant
   * - UPDATE: Atualiza campos fornecidos do tenant (não sobrescreve com vazio)
   * - UPSERT: INSERT se não existe, UPDATE se existe no tenant (padrão)
   * - REPLACE_ALL: Soft-delete apenas os funcionários do tenant e reinsere
   */
  async import(
    rows: Record<string, unknown>[],
    mode: 'INSERT' | 'UPDATE' | 'UPSERT' | 'REPLACE_ALL' = 'UPSERT',
  ): Promise<ImportResult> {
    console.log(`[DEBUG] import() iniciado - ${rows.length} linhas, modo: ${mode}`);

    const result: ImportResult = {
      success: false,
      totalRows: rows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // 1. Se modo REPLACE_ALL, deletar apenas os registros do tenant atual
    if (mode === 'REPLACE_ALL') {
      console.log('[DEBUG] Modo REPLACE_ALL: desativando funcionários do tenant...');
      try {
        await this.db
          .prepare(
            "UPDATE funcionarios SET deleted_at = datetime('now'), updated_at = CURRENT_TIMESTAMP WHERE empresa_id = ? AND deleted_at IS NULL",
          )
          .bind(this.empresaId)
          .run();
        console.log('[DEBUG] Soft delete do tenant concluído');
      } catch (e) {
        console.error('[DEBUG] Erro ao desativar funcionários do tenant:', e);
        result.errors.push({
          line: 0,
          field: 'global',
          message: 'Erro ao desativar funcionários existentes',
        });
        return result;
      }
      // Mudar modo para UPSERT: registros do próprio tenant podem ser reativados com segurança.
      mode = 'UPSERT';
    }

    // 2. Validar todos antes de inserir
    console.log(`[DEBUG] Iniciando validação...`);
    const validationErrors = await this.validate(rows);
    console.log(`[DEBUG] Validação concluída: ${validationErrors.length} erros`);

    if (validationErrors.length > 0) {
      console.log(`[DEBUG] Retornando devido a erros de validação:`, validationErrors.slice(0, 3));
      result.errors = validationErrors;
      return result;
    }

    // 3. Processar cada linha
    console.log(`[DEBUG] Iniciando processamento de ${rows.length} linhas`);
    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        console.log(`[DEBUG] Linha ${i + 1}/${rows.length} - Iniciando...`);
        const cpf = normalizeCPF(row.CPF);

        // Converter datas usando parseFlexibleDate (já foi feito em validators, mas garantir)
        const nascimento = parseFlexibleDate(row.Nascimento);
        const admissao = parseFlexibleDate(row.Admissao);

        // DEBUG: Log primeira linha para verificar mapeamento
        if (i === 0) {
          console.log('[DEBUG] Primeira linha processada com sucesso (dados omitidos por LGPD)', {
            has_nome: !!row.Nome,
            has_canac: !!row.CANAC,
            keys: Object.keys(row),
          });
        }

        // Verificar se já existe exclusivamente no tenant atual, incluindo soft deleted.
        const existing = await this.db
          .prepare(
            'SELECT id, deleted_at FROM funcionarios WHERE cpf = ? AND empresa_id = ? LIMIT 1',
          )
          .bind(cpf, this.empresaId)
          .first<{ id: number; deleted_at: string | null }>();

        if (existing && mode === 'INSERT') {
          result.skipped++;
          continue;
        }

        if (existing && (mode === 'UPDATE' || mode === 'UPSERT')) {
          // UPDATE tenant-scoped (inteligente - só atualiza campos preenchidos)
          const updateFields: string[] = ['deleted_at = NULL', 'updated_at = CURRENT_TIMESTAMP'];
          const updateValues: unknown[] = [];

          // Adicionar cada campo APENAS se for fornecido
          if (row.Nome !== null && row.Nome !== undefined && String(row.Nome).trim() !== '') {
            updateFields.push('nome = ?');
            updateValues.push(row.Nome);
          }
          if (row.Guerra !== null && row.Guerra !== undefined && String(row.Guerra).trim() !== '') {
            updateFields.push('guerra = ?');
            updateValues.push(row.Guerra);
          }
          if (row.Funcao !== null && row.Funcao !== undefined && String(row.Funcao).trim() !== '') {
            updateFields.push('funcao = ?');
            updateValues.push(row.Funcao);
          }
          if (
            row.Aeronave !== null &&
            row.Aeronave !== undefined &&
            String(row.Aeronave).trim() !== ''
          ) {
            updateFields.push('aeronave = ?');
            updateValues.push(row.Aeronave);
          }
          if (nascimento) {
            updateFields.push('nascimento = ?');
            updateValues.push(nascimento);
          }
          if (
            row.Licenca !== null &&
            row.Licenca !== undefined &&
            String(row.Licenca).trim() !== ''
          ) {
            updateFields.push('licenca = ?');
            updateValues.push(row.Licenca);
          }
          if (row.CANAC !== null && row.CANAC !== undefined && String(row.CANAC).trim() !== '') {
            updateFields.push('codigo_anac = ?');
            updateValues.push(row.CANAC);
          }
          if (row.Sispat !== null && row.Sispat !== undefined && String(row.Sispat).trim() !== '') {
            updateFields.push('sispat = ?');
            updateValues.push(row.Sispat);
          }
          if (
            row.Prestserv !== null &&
            row.Prestserv !== undefined &&
            String(row.Prestserv).trim() !== ''
          ) {
            updateFields.push('prestserv = ?');
            updateValues.push(row.Prestserv);
          }
          if (row.Email !== null && row.Email !== undefined && String(row.Email).trim() !== '') {
            updateFields.push('email = ?');
            updateValues.push(row.Email);
          }
          if (
            row.Telefone !== null &&
            row.Telefone !== undefined &&
            String(row.Telefone).trim() !== ''
          ) {
            updateFields.push('telefone = ?');
            updateValues.push(row.Telefone);
          }
          if (admissao) {
            updateFields.push('admissao = ?');
            updateValues.push(admissao);
          }
          if (
            row.Matricula !== null &&
            row.Matricula !== undefined &&
            String(row.Matricula).trim() !== ''
          ) {
            updateFields.push('matricula = ?');
            updateValues.push(row.Matricula);
          }

          // Escopo imutável: a importação só pode atualizar o registro previamente localizado no tenant.
          updateValues.push(existing.id, this.empresaId);

          const updateSQL = `UPDATE funcionarios SET ${updateFields.join(', ')} WHERE id = ? AND empresa_id = ?`;
          const updateResult = await this.db
            .prepare(updateSQL)
            .bind(...updateValues)
            .run();

          if ((updateResult.meta?.changes ?? 0) !== 1) {
            throw new Error('Funcionário não foi atualizado no tenant atual');
          }

          result.updated++;
        } else if (mode === 'UPDATE') {
          // UPDATE não cria registros ausentes.
          result.skipped++;
        } else {
          // INSERT
          await this.db
            .prepare(
              `
              INSERT INTO funcionarios (
                nome, guerra, funcao, aeronave, cpf,
                nascimento, licenca, codigo_anac, sispat, prestserv,
                email, telefone, admissao, matricula, empresa_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            )
            .bind(
              row.Nome,
              row.Guerra || null,
              row.Funcao || null,
              row.Aeronave || null,
              cpf,
              nascimento,
              row.Licenca || null,
              row.CANAC || null,
              row.Sispat || null,
              row.Prestserv || null,
              row.Email || null,
              row.Telefone || null,
              admissao,
              row.Matricula,
              this.empresaId,
            )
            .run();

          result.inserted++;
        }
      } catch (error) {
        result.errors.push({
          line: i + 2,
          field: 'geral',
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  }

  /**
   * Gera template CSV com headers da planilha oficial
   */
  getTemplate(): string {
    const headers = Object.keys(FUNCIONARIOS_COLUMNS);
    const example = [
      'João da Silva',
      'Silva',
      'Piloto',
      'A320',
      '12345678900',
      '1985-03-15',
      'LIC123456',
      'ANAC12345',
      '',
      '',
      'joao@empresa.com',
      '11987654321',
      '2020-01-15',
      'MAT001',
    ];

    return headers.join(',') + '\n' + example.join(',');
  }
}
