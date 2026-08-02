import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { getEmpresaId } from '../middleware/tenant';
import { requireRole } from '../middleware/rbac';
import { getReleaseMetadata } from '../services/release-metadata';
import type { DomainEventTipo } from '../shared/domainEvents';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const DOMAIN_EVENT_TYPES = [
  'CMA_CRIADO',
  'CMA_RENOVADO',
  'CMA_REVOGADO',
  'CMA_VENCENDO_30D',
  'CMA_VENCENDO_7D',
  'CMA_VENCIDO',
  'HABILITACAO_ADICIONADA',
  'HABILITACAO_REVOGADA',
  'FRMS_AVALIACAO_CRIADA',
  'FRMS_STATUS_CRITICO',
  'FRMS_STATUS_NORMAL',
  'FRMS_STATUS_NORMALIZADO',
  'SIMULADOR_AGENDADO',
  'SIMULADOR_REALIZADO',
  'SIMULADOR_CANCELADO',
  'SIMULADOR_REAGENDADO',
  'SIMULADOR_PENDENTE_VENCENDO',
  'FUNCIONARIO_CRIADO',
  'FUNCIONARIO_ATUALIZADO',
  'FUNCIONARIO_INATIVADO',
  'FUNCIONARIO_REATIVADO',
  'TRIPULANTE_ALOCADO',
  'TRIPULANTE_REMOVIDO',
  'TRIPULANTE_ALTERADO',
  'ESCALA_PUBLICADA',
  'ESCALA_ARQUIVADA',
  'HOSPEDAGEM_RESERVADA',
  'HOSPEDAGEM_CANCELADA',
  'DOCUMENTO_ENVIADO',
  'DOCUMENTO_EXCLUIDO',
  'DOCUMENTO_CMA_DETECTADO',
] as const satisfies readonly DomainEventTipo[];

function isDomainEventTipo(value: string): value is DomainEventTipo {
  return DOMAIN_EVENT_TYPES.some((candidate) => candidate === value);
}

app.get('/domain-events', requireRole('admin'), async (c) => {
  const empresaId = getEmpresaId(c);
  const tipo = c.req.query('tipo');
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);

  let sql = `
    SELECT id, empresa_id, modulo, tipo, payload, processado, created_at, processed_at
    FROM domain_events
    WHERE empresa_id = ? AND deleted_at IS NULL
  `;
  const bindings: Array<string | number> = [empresaId];

  if (tipo) {
    sql += ' AND tipo = ?';
    bindings.push(tipo);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  bindings.push(limit);

  const result = await c.env.DB.prepare(sql)
    .bind(...bindings)
    .all();

  return c.json({
    success: true,
    data: result.results || [],
    total: (result.results || []).length,
  });
});

app.get('/integracoes/health', requireRole('admin'), async (c) => {
  const empresaId = getEmpresaId(c);

  const eventos = await c.env.DB.prepare(
    `SELECT tipo, consumidores, processado_por, ultimo_erro, created_at
     FROM domain_events
     WHERE empresa_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 50`,
  )
    .bind(empresaId)
    .all<{
      tipo: string;
      consumidores: string | null;
      processado_por: string | null;
      ultimo_erro: string | null;
      created_at: string;
    }>();

  const jobs = await c.env.DB.prepare(
    `SELECT status_geracao, COUNT(*) as total
     FROM pasta_virtual_jobs
     WHERE empresa_id = ? AND deleted_at IS NULL
     GROUP BY status_geracao`,
  )
    .bind(empresaId)
    .all<{ status_geracao: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status_geracao: string; total: number }> }));

  const pendencias = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as total
     FROM qualificacoes_pendencias
     WHERE empresa_id = ? AND deleted_at IS NULL
     GROUP BY status`,
  )
    .bind(empresaId)
    .all<{ status: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status: string; total: number }> }));

  return c.json({
    success: true,
    data: {
      empresa_id: empresaId,
      eventos_recentes: eventos.results || [],
      pasta_virtual_jobs: jobs.results || [],
      qualificacoes_pendencias: pendencias.results || [],
      version: getReleaseMetadata(c.env).version,
    },
  });
});

app.post('/integracoes/test-event', requireRole('admin'), async (c) => {
  const empresaId = getEmpresaId(c);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { publishDomainEvent } = await import('../shared/domainEvents');

  const modulo = String(body.modulo || 'admin');
  const requestedTipo = String(body.tipo || 'FUNCIONARIO_ATUALIZADO');
  if (!isDomainEventTipo(requestedTipo)) {
    return c.json({ success: false, error: 'Tipo de evento inválido' }, 400);
  }

  const rawPayload = body.payload;
  const payload =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};

  await publishDomainEvent(c.env.DB, modulo, requestedTipo, {
    ...payload,
    empresa_id: String(empresaId),
    origem_modulo: modulo,
    origem_usuario_id: String(c.get('userId') || '0'),
    funcionario_id: body.funcionario_id ? String(body.funcionario_id) : undefined,
  });

  return c.json({ success: true });
});

export default app;
