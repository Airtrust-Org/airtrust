/**
 * CATEGORIA IMPORTACAO SERVICE
 *
 * Schema para importação de categorias:
 * - Campos: codigo, nome, descricao, tipo, observacoes
 * - Campos obrigatórios: codigo, nome
 * - Código sempre UPPERCASE, único
 */

import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { normalizeCode } from './columnMappings';
import type { ValidationError } from './validators';

// ===== SCHEMA =====

export const CategoriaImportSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  descricao: z.string().optional().nullable(),
  tipo: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
});

export type CategoriaImportData = z.infer<typeof CategoriaImportSchema>;

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

export class CategoriaImportacaoService {
  constructor(private db: D1Database) {}

  /**
   * Retorna template CSV
   */
  getTemplate(): string {
    const headers = ['codigo', 'nome', 'descricao', 'tipo', 'observacoes'];
    const exemplo = [
      'CAT-001',
      'Exemplo Categoria',
      'Descrição da categoria',
      'TIPO_A',
      'Observações gerais',
    ];
    return `${headers.join(',')}\n${exemplo.join(',')}`;
  }

  /**
   * Valida batch completo sem inserir
   */
  async validate(rows: Record<string, unknown>[]): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowErrors = await this.validateRow(rows[i], i + 2);
      errors.push(...rowErrors);
    }

    return errors;
  }

  /**
   * Valida uma linha
   */
  private async validateRow(
    row: Record<string, unknown>,
    lineNumber: number,
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    // Validação com Zod
    const parsed = CategoriaImportSchema.safeParse(row);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push({
          line: lineNumber,
          field: issue.path.join('.'),
          message: issue.message,
        });
      }
      return errors;
    }

    // Validação adicional: código deve ser único
    const codigo = normalizeCode(parsed.data.codigo);

    try {
      const existing = await this.db
        .prepare('SELECT id FROM categorias WHERE codigo = ? AND deleted_at IS NULL')
        .bind(codigo)
        .first();

      if (existing) {
        // Não é erro, apenas warning (UPSERT vai atualizar)
        console.log(`[CATEGORIA] Código ${codigo} já existe (será atualizado em UPSERT)`);
      }
    } catch (e) {
      errors.push({
        line: lineNumber,
        field: 'codigo',
        message: `Erro ao verificar código: ${(e as Error).message}`,
      });
    }

    return errors;
  }

  /**
   * Importa categorias com validação completa
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
  ): Promise<ImportResult> {
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
      console.log('[CATEGORIA] Modo REPLACE_ALL: deletando todas categorias (soft delete)...');
      try {
        await this.db
          .prepare("UPDATE categorias SET deleted_at = datetime('now') WHERE deleted_at IS NULL")
          .run();
        console.log('[CATEGORIA] Soft delete concluído');
      } catch (e) {
        console.error('[CATEGORIA] Erro ao deletar:', e);
        result.errors.push({
          line: 0,
          field: 'global',
          message: 'Erro ao deletar categorias existentes',
        });
        return result;
      }
      // Mudar modo para INSERT para as linhas novas
      mode = 'INSERT';
    }

    // 2. Processar cada linha
    for (let i = 0; i < rows.length; i++) {
      const lineNumber = i + 2;
      const row = rows[i];

      // Validar linha
      const validationErrors = await this.validateRow(row, lineNumber);
      if (validationErrors.length > 0) {
        result.errors.push(...validationErrors);
        result.skipped++;
        continue;
      }

      // Parse com schema
      const parsed = CategoriaImportSchema.parse(row);
      const codigo = normalizeCode(parsed.codigo);

      try {
        // Verificar se já existe
        const existing = await this.db
          .prepare('SELECT id FROM categorias WHERE codigo = ? AND deleted_at IS NULL')
          .bind(codigo)
          .first<{ id: number }>();

        if (existing) {
          // Já existe
          if (mode === 'INSERT') {
            result.skipped++;
            console.log(`[CATEGORIA] Categoria ${codigo} já existe (modo INSERT, skipando)`);
            continue;
          }

          // UPDATE ou UPSERT: atualizar
          await this.db
            .prepare(
              `UPDATE categorias 
               SET nome = ?, descricao = ?, tipo = ?, observacoes = ?, updated_at = datetime('now')
               WHERE codigo = ? AND deleted_at IS NULL`,
            )
            .bind(
              parsed.nome,
              parsed.descricao || null,
              parsed.tipo || null,
              parsed.observacoes || null,
              codigo,
            )
            .run();

          result.updated++;
          console.log(`[CATEGORIA] Categoria ${codigo} atualizada`);
        } else {
          // Não existe
          if (mode === 'UPDATE') {
            result.skipped++;
            console.log(`[CATEGORIA] Categoria ${codigo} não existe (modo UPDATE, skipando)`);
            continue;
          }

          // INSERT ou UPSERT: inserir
          await this.db
            .prepare(
              `INSERT INTO categorias (codigo, nome, descricao, tipo, observacoes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            )
            .bind(
              codigo,
              parsed.nome,
              parsed.descricao || null,
              parsed.tipo || null,
              parsed.observacoes || null,
            )
            .run();

          result.inserted++;
          console.log(`[CATEGORIA] Categoria ${codigo} inserida`);
        }
      } catch (e) {
        console.error(`[CATEGORIA] Erro ao processar linha ${lineNumber}:`, e);
        result.errors.push({
          line: lineNumber,
          field: 'database',
          message: `Erro ao salvar: ${(e as Error).message}`,
        });
        result.skipped++;
      }
    }

    // 3. Resultado final
    result.success = result.errors.length === 0;

    return result;
  }
}
