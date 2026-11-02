import type { Context } from 'hono';
import type { Env } from '../types';
import { extrairUsuarioAuditoria, registrarAuditoria } from '../utils/auditoria';
import { getEmpresaId } from './tenant';

// Leitura do Context do Hono para o módulo Controle de Voos / RDV. O acesso a
// dados fica em repositories/controle-voos/rdv-repository (sem dependência do framework).

export function getEmpresaIdSafe(c: Context<{ Bindings: Env }>): number {
  try {
    return getEmpresaId(c);
  } catch {
    const raw = (c.get as (key: string) => unknown)('empresaId');
    const parsed = typeof raw === 'string' ? Number(raw) : Number(raw || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}

export function getActorId(c: Context<{ Bindings: Env }>): string | number | null {
  const raw = (c.get as (key: string) => unknown)('userId');
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return null;
}

export async function maybeRecordSystemAudit(
  c: Context<{ Bindings: Env }>,
  table: string,
  action: 'INSERT' | 'UPDATE',
  recordId: string | number,
  beforeData: unknown,
  afterData: unknown,
): Promise<void> {
  await registrarAuditoria({
    db: c.env.DB,
    tabela: table,
    acao: action,
    registro_id: recordId,
    dados_anteriores: beforeData,
    dados_novos: afterData,
    ...extrairUsuarioAuditoria(c),
  });
}
