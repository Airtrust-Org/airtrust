import { Hono } from 'hono';
import type { Env } from '../../types';
import { describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { errorHandler } from '../../middleware/error-handler';

const viewer = vi.hoisted(() => ({ userId: 7, role: 'manager', empresaId: 1 }));
import nextGen from '../../routes/sgso-next-gen';

type Body = { data: { eventos: Array<{ ator_id: number | null }> } };

/** P10-01 (RELPREV): o workflow não devolve o autor do envio de um relato anônimo. */
describe('RELPREV workflow: ator de relato anônimo', () => {
  it('oculta o ator do envio (anônimo) e preserva o ator de gestores e dos relatos identificados', async () => {
    const db = new SqliteD1Database();
    try {
      db.database.exec(`
        CREATE TABLE sgso_relatos (id TEXT PRIMARY KEY, empresa_id INTEGER, anonimo INTEGER, created_by INTEGER, deleted_at TEXT);
        CREATE TABLE sgso_relato_workflow_eventos (
          id INTEGER PRIMARY KEY AUTOINCREMENT, relato_id TEXT, empresa_id INTEGER, tipo_evento TEXT,
          status_evento TEXT, visivel_relator INTEGER, payload_json TEXT, ator_id INTEGER, criado_em TEXT);
        CREATE TABLE sgso_relato_notificacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT, relato_id TEXT, empresa_id INTEGER, template_codigo TEXT, created_at TEXT);
        INSERT INTO sgso_relatos VALUES ('anon', 1, 1, 42, NULL), ('ident', 1, 0, 42, NULL);
        INSERT INTO sgso_relato_workflow_eventos (relato_id, empresa_id, tipo_evento, status_evento, ator_id, criado_em) VALUES
          ('anon', 1, 'RECEBIMENTO', 'CONCLUIDO', 42, '2026-11-01T10:00:00Z'),
          ('anon', 1, 'CLASSIFICACAO_IA', 'CONCLUIDO', 42, '2026-11-01T10:00:01Z'),
          ('anon', 1, 'TRANSICAO_STATUS', 'CONCLUIDO', 7, '2026-11-01T11:00:00Z'),
          ('ident', 1, 'RECEBIMENTO', 'CONCLUIDO', 42, '2026-11-01T10:00:00Z');
      `);
      const app = new Hono<{ Bindings: Env; Variables: Record<string, unknown> }>();
      app.use('*', async (c, next) => {
        c.set('empresaId', viewer.empresaId);
        c.set('tenantContext', { empresaId: viewer.empresaId, userId: viewer.userId, role: viewer.role });
        c.set('userId', viewer.userId);
        c.set('userRole', viewer.role);
        await next();
      });
      app.route('/api/sgso/next', nextGen);
      app.onError(errorHandler);
      const env = { DB: db.asD1() } as unknown as Env;

      const anon = await app.request('/api/sgso/next/relprev/submissoes/anon/workflow', {}, env);
      expect(anon.status).toBe(200);
      const anonEvents = ((await anon.json()) as Body).data.eventos;
      expect(anonEvents.map((e) => e.ator_id)).toEqual([null, null, 7]);

      const ident = await app.request('/api/sgso/next/relprev/submissoes/ident/workflow', {}, env);
      expect(((await ident.json()) as Body).data.eventos[0].ator_id).toBe(42);

      // Quem não é gestão não acessa o workflow.
      viewer.role = 'aluno';
      expect((await app.request('/api/sgso/next/relprev/submissoes/anon/workflow', {}, env)).status).toBe(403);
      // Outro tenant não enxerga eventos.
      viewer.role = 'manager';
      viewer.empresaId = 2;
      const other = await app.request('/api/sgso/next/relprev/submissoes/anon/workflow', {}, env);
      expect(((await other.json()) as Body).data.eventos).toEqual([]);
    } finally {
      viewer.role = 'manager';
      viewer.empresaId = 1;
      db.close();
    }
  });
});
