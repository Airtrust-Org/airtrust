import type { Context } from 'hono';
import type { Env } from '../types';
import { badRequest, forbidden } from './error-handler';

function getRequiredEmpresaId(c: Context<{ Bindings: Env }>): number {
  const rawEmpresaId = (c.get as (key: string) => unknown)('empresaId');
  const empresaId = Number(rawEmpresaId);
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw forbidden('Contexto de empresa inválido', 'TENANT_CONTEXT_REQUIRED');
  }
  return empresaId;
}

function enforceCertificateAdminTenantBoundary(c: Context<{ Bindings: Env }>): void {
  const pathname = new URL(c.req.url).pathname;
  const prefix = '/api/certificados/admin/';
  if (!pathname.startsWith(prefix)) return;

  const empresaId = getRequiredEmpresaId(c);
  const [operation, ...pathIds] = pathname.slice(prefix.length).replace(/\/+$/, '').split('/');

  if (operation === 'empresas-com-templates') {
    throw forbidden(
      'Listagem global de empresas não está disponível para administradores de tenant',
      'TENANT_SCOPE_FORBIDDEN',
    );
  }

  if (operation === 'copiar-template') {
    const fromEmpresa = Number(pathIds[0]);
    const toEmpresa = Number(pathIds[1]);
    if (fromEmpresa !== empresaId || toEmpresa !== empresaId) {
      throw forbidden('Operação de template fora do tenant autenticado', 'TENANT_SCOPE_FORBIDDEN');
    }
    return;
  }

  if (operation === 'ativar-template' || operation === 'templates') {
    const targetEmpresaId = Number(pathIds[0]);
    if (targetEmpresaId !== empresaId) {
      throw forbidden('Operação de template fora do tenant autenticado', 'TENANT_SCOPE_FORBIDDEN');
    }
  }
}

async function enforceMatrizTreinamentoWriteBoundary(c: Context<{ Bindings: Env }>): Promise<void> {
  if (c.req.method !== 'POST') return;

  const pathname = new URL(c.req.url).pathname.replace(/\/+$/, '');
  const isSingle = pathname === '/api/matriz-treinamento/registros';
  const isBulk = pathname === '/api/matriz-treinamento/registros/bulk';
  if (!isSingle && !isBulk) return;

  const body = (await c.req.raw
    .clone()
    .json()
    .catch(() => null)) as {
    qualificacao_tipo_id?: unknown;
    qualificacao_tipo_ids?: unknown;
  } | null;
  if (!body) return;

  const empresaId = getRequiredEmpresaId(c);
  const tipoIds = isBulk
    ? Array.isArray(body.qualificacao_tipo_ids)
      ? body.qualificacao_tipo_ids
      : []
    : [body.qualificacao_tipo_id];
  // Ausência continua sendo tratada pelo handler legado como payload inválido.
  if (tipoIds.length === 0 || tipoIds.every((value) => value === undefined)) return;

  const hasInvalidId = tipoIds.some(
    (value) =>
      (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      String(value).trim().length === 0,
  );
  if (hasInvalidId) {
    badRequest('ID de tipo de qualificação inválido', 'INVALID_QUALIFICATION_TYPE_ID');
  }

  const normalizedIds = [...new Set(tipoIds.map((value) => String(value).trim()))];

  const placeholders = normalizedIds.map(() => '?').join(', ');
  const row = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT id) AS total
       FROM qualificacoes_tipos
      WHERE empresa_id = ?
        AND deleted_at IS NULL
        AND id IN (${placeholders})`,
  )
    .bind(empresaId, ...normalizedIds)
    .first<{ total: number }>();

  if (Number(row?.total || 0) !== normalizedIds.length) {
    throw forbidden('Tipo de qualificação inválido para a empresa atual', 'TENANT_SCOPE_FORBIDDEN');
  }
}

/**
 * Proteções cirúrgicas para rotas legadas que ainda aceitam IDs de tenant no
 * path/body antes de suas consultas internas. Mantém o bloqueio fail-closed
 * próximo ao gate de role sem ampliar privilégios.
 */
export async function enforceLegacyTenantBoundaries(c: Context<{ Bindings: Env }>): Promise<void> {
  enforceCertificateAdminTenantBoundary(c);
  await enforceMatrizTreinamentoWriteBoundary(c);
}
