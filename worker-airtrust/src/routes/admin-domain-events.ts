import { Hono } from 'hono';
import type { Env } from '../types';
import { getReleaseMetadata } from '../services/release-metadata';

const app = new Hono<{ Bindings: Env }>();

app.get('/domain-events', async (c) => {
  const empresaId = c.req.query('empresa_id');
  const tipo = c.req.query('tipo');
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200);

  let sql = `
    SELECT id, empresa_id, modulo, tipo, payload, processado, created_at, processed_at
    FROM domain_events
    WHERE deleted_at IS NULL
  `;
  const bindings: Array<string | number> = [];

  if (empresaId) {
    sql += ' AND empresa_id = ?';
    bindings.push(Number(empresaId));
  }
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

app.get('/integracoes/health', async (c) => {
  const empresaId = c.req.query('empresa_id') || String((c.get as any)('empresaId') || '');

  const eventos = empresaId
    ? await c.env.DB.prepare(
        `SELECT tipo, consumidores, processado_por, ultimo_erro, created_at
         FROM domain_events
         WHERE empresa_id = ? AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 50`,
      )
        .bind(Number(empresaId))
        .all<{
          tipo: string;
          consumidores: string | null;
          processado_por: string | null;
          ultimo_erro: string | null;
          created_at: string;
        }>()
    : {
        results: [] as Array<{
          tipo: string;
          consumidores: string | null;
          processado_por: string | null;
          ultimo_erro: string | null;
          created_at: string;
        }>,
      };

  const jobs = await c.env.DB.prepare(
    `SELECT status_geracao, COUNT(*) as total
     FROM pasta_virtual_jobs
     WHERE deleted_at IS NULL
     GROUP BY status_geracao`,
  )
    .all<{ status_geracao: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status_geracao: string; total: number }> }));

  const pendencias = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as total
     FROM qualificacoes_pendencias
     WHERE deleted_at IS NULL
     GROUP BY status`,
  )
    .all<{ status: string; total: number }>()
    .catch(() => ({ results: [] as Array<{ status: string; total: number }> }));

  return c.json({
    success: true,
    data: {
      empresa_id: empresaId || null,
      eventos_recentes: eventos.results || [],
      pasta_virtual_jobs: jobs.results || [],
      qualificacoes_pendencias: pendencias.results || [],
      version: getReleaseMetadata(c.env).version,
    },
  });
});

app.post('/integracoes/test-event', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
  const { publishDomainEvent } = await import('../shared/domainEvents');

  await publishDomainEvent(
    c.env.DB,
    String(body.modulo || 'admin'),
    String(body.tipo || 'FUNCIONARIO_ATUALIZADO') as any,
    {
      empresa_id: String(body.empresa_id || (c.get as any)('empresaId') || '0'),
      origem_modulo: String(body.modulo || 'admin'),
      origem_usuario_id: String((c.get as any)('userId') || '0'),
      funcionario_id: body.funcionario_id ? String(body.funcionario_id) : undefined,
      ...(body.payload || {}),
    },
  );

  return c.json({ success: true });
});

export default app;
