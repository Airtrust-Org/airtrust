/**
 * DB UTILS - Helpers para Database D1
 *
 * Funções utilitárias para:
 * - Soft delete
 * - Audit trail
 * - Paginação
 * - Query builders
 * - Sanitização
 */

import type { Env } from '../types';

// ===== SOFT DELETE =====

/**
 * Marca registro como deletado (soft delete) ao invés de remover do banco
 * Atualiza deleted_at com timestamp atual
 */
export async function softDelete(db: D1Database, table: string, id: number): Promise<D1Result> {
  const query = `
    UPDATE ${table} 
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `;

  return await db.prepare(query).bind(id).run();
}


// ===== PAGINATION =====

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  total: number;
  totalPages: number;
}

/**
 * Calcula offset e retorna metadados de paginação
 */
export function calculatePagination(params: PaginationParams, total: number): PaginationResult {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 50));
  const offset = (page - 1) * limit;
  const totalPages = Math.ceil(total / limit);

  return {
    page,
    limit,
    offset,
    total,
    totalPages,
  };
}

/**
 * Conta total de registros em uma tabela (excluindo soft deleted)
 */
export async function countRecords(
  db: D1Database,
  table: string,
  whereClause?: string,
  bindings?: unknown[],
): Promise<number> {
  let query = `SELECT COUNT(*) as total FROM ${table} WHERE deleted_at IS NULL`;

  if (whereClause) {
    query += ` AND ${whereClause}`;
  }

  let stmt = db.prepare(query);

  if (bindings && bindings.length > 0) {
    stmt = stmt.bind(...bindings);
  }

  const result = await stmt.first<{ total: number }>();

  return result?.total || 0;
}

// ===== AUDIT TRAIL =====

export interface AuditParams {
  userId?: number;
  action: string;
  entityType: string;
  entityId?: number;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Registra ação no audit log
 * Útil para compliance e rastreabilidade
 */
export async function logAudit(db: D1Database, params: AuditParams): Promise<void> {
  const query = `
    INSERT INTO audit_logs (
      user_id, 
      action, 
      entity_type, 
      entity_id, 
      old_values, 
      new_values, 
      ip_address, 
      user_agent,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;

  await db
    .prepare(query)
    .bind(
      params.userId || null,
      params.action,
      params.entityType,
      params.entityId || null,
      params.oldValues ? JSON.stringify(params.oldValues) : null,
      params.newValues ? JSON.stringify(params.newValues) : null,
      params.ipAddress || null,
      params.userAgent || null,
    )
    .run();
}

// ===== QUERY BUILDERS =====

/**
 * Constrói WHERE clause para busca textual
 * Busca em múltiplas colunas usando LIKE
 */
export function buildSearchWhere(
  columns: string[],
  searchTerm?: string,
): { clause: string; binding: string } | null {
  if (!searchTerm || searchTerm.trim() === '') {
    return null;
  }

  const conditions = columns.map((col) => `${col} LIKE ?`).join(' OR ');
  const searchPattern = `%${searchTerm.trim()}%`;

  return {
    clause: `(${conditions})`,
    binding: searchPattern,
  };
}

/**
 * Constrói ORDER BY clause seguro
 * Previne SQL injection validando coluna e direção
 */
export function buildOrderBy(
  allowedColumns: string[],
  column?: string,
  direction: 'ASC' | 'DESC' = 'DESC',
): string {
  const sanitizedColumn =
    column && allowedColumns.includes(column) ? column : allowedColumns[0] || 'id';

  const sanitizedDirection = direction === 'ASC' ? 'ASC' : 'DESC';

  return `${sanitizedColumn} ${sanitizedDirection}`;
}

