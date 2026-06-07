/**
 * QUALIFICACAO TIPO IMPORTACAO - Refatorado (Schema Normalizado)
 *
 * Schema refletindo EXATAMENTE a planilha oficial:
 * - 8 colunas (tipo, codigo, nome, descricao, categoria, carga_horaria, validade, observacoes)
 * - Campos obrigatórios: codigo, nome
 * - Código sempre UPPERCASE, único
 */

import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { QUALIFICACOES_TIPOS_COLUMNS, normalizeCode } from './columnMappings';
import { validateQualificacaoTipoRow, type ValidationError } from './validators';

// ===== SCHEMA NORMALIZADO (EXATAMENTE como tabela de importação) =====

export const QualificacaoTipoImportSchema = z.object({
  tipo: z.string().optional().nullable(),
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  descricao: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  carga_horaria: z.union([z.string(), z.number()]).optional().nullable(),
  validade: z.union([z.string(), z.number()]).optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export type QualificacaoTipoImportData = z.infer<typeof QualificacaoTipoImportSchema>;

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

export class QualificacaoTipoImportacaoService {
  constructor(
    private db: D1Database,
    private tenantEmpresaId?: number,
  ) {}

  /**
   * Valida batch completo sem inserir
   */
  async validate(rows: Record<string, unknown>[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowErrors = await validateQualificacaoTipoRow(rows[i], i + 2);
      errors.push(...rowErrors);
    }

    return errors;
  }

  /**
   * Importa tipos com validação completa
   *
   * MODOS:
   * - INSERT: Insere apenas se não existe
   * - UPDATE: Atualiza todos os campos
   * - UPSERT: INSERT se não existe, UPDATE se existe (padrão)
   * - REPLACE_ALL: Delete todos (soft) e reinsert
   */
  async import(
    rows: Record<string, unknown>[],
    mode: 'INSERT' | 'UPDATE' | 'UPSERT' | 'REPLACE_ALL' = 'UPSERT',
    empresaId = this.tenantEmpresaId,
  ): Promise<ImportResult> {
    if (!empresaId || empresaId <= 0) {
      throw new Error('TENANT_CONTEXT_REQUIRED');
    }

    const result: ImportResult = {
      success: false,
      totalRows: rows.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // 1. Se modo REPLACE_ALL, deletar todos (soft delete) primeiro
    if (mode === 'REPLACE_ALL') {
      console.log('[DEBUG] Modo REPLACE_ALL (Tipos): deletando todos tipos (soft delete)...');
      try {
        await this.db
          .prepare(
            "UPDATE qualificacoes_tipos SET deleted_at = datetime('now') WHERE empresa_id = ? AND deleted_at IS NULL",
          )
          .bind(empresaId)
          .run();
        console.log('[DEBUG] Soft delete (Tipos) concluído');
      } catch (e) {
        console.error('[DEBUG] Erro ao deletar tipos:', e);
        result.errors.push({
          line: 0,
          field: 'global',
          message: 'Erro ao deletar tipos existentes',
        });
        return result;
      }
      // Mudar modo para INSERT para as linhas novas
      mode = 'INSERT';
    }

    // 2. Validar todos antes de inserir
    const validationErrors = await this.validate(rows);
    if (validationErrors.length > 0) {
      result.errors = validationErrors;
      return result;
    }

    // 2. Processar cada linha
    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const codigo = normalizeCode(row.codigo);

        if (!codigo) {
          result.errors.push({
            line: i + 2,
            field: 'codigo',
            message: 'Código inválido',
          });
          continue;
        }

        // Verificar se já existe (incluindo soft deleted)
        const existing = await this.db
          .prepare(
            'SELECT id, deleted_at FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ?',
          )
          .bind(codigo, empresaId)
          .first<{ id: number; deleted_at: string | null }>();

        if (existing && mode === 'INSERT' && !existing.deleted_at) {
          result.skipped++;
          continue;
        }

        // Converter campos numéricos
        const validade = row.validade ? parseInt(String(row.validade), 10) : null;
        const cargaHoraria = row.carga_horaria ? parseFloat(String(row.carga_horaria)) : null;

        if (existing && (mode === 'UPDATE' || mode === 'UPSERT')) {
          // UPDATE (faz undelete se necessário)
          await this.db
            .prepare(
              `
              UPDATE qualificacoes_tipos SET
                tipo = ?,
                nome = ?,
                descricao = ?,
                categoria = ?,
                carga_horaria = ?,
                validade = ?,
                observacoes = ?,
                deleted_at = NULL,
                updated_at = CURRENT_TIMESTAMP
              WHERE UPPER(codigo) = UPPER(?) AND empresa_id = ?
            `,
            )
            .bind(
              row.tipo || null,
              row.nome,
              row.descricao || null,
              row.categoria || 'Geral', // Default to 'Geral' if empty
              cargaHoraria,
              validade,
              row.observacoes || null,
              codigo,
              empresaId,
            )
            .run();

          result.updated++;
        } else {
          // INSERT - Gerar UUID para id (coluna TEXT)
          const uuid = crypto.randomUUID();
          await this.db
            .prepare(
              `
              INSERT INTO qualificacoes_tipos (
                id, tipo, codigo, nome, descricao, categoria,
                carga_horaria, validade, observacoes, empresa_id, created_at, updated_at, deleted_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
            `,
            )
            .bind(
              uuid,
              row.tipo || null,
              codigo,
              row.nome,
              row.descricao || null,
              row.categoria || 'Geral', // Default to 'Geral' if empty
              cargaHoraria,
              validade,
              row.observacoes || null,
              empresaId,
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
   * Gera template CSV com headers EXATAMENTE da tabela de importação
   */
  getTemplate(): string {
    const headers = [
      'tipo',
      'codigo',
      'nome',
      'descricao',
      'categoria',
      'carga_horaria',
      'validade',
      'observacoes',
    ];
    const example = ['Exame', 'ASO', 'Atestado de Saúde Ocupacional', '', '', '', '12', ''];

    return headers.join(',') + '\n' + example.join(',');
  }
}
