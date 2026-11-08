import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const viewer = vi.hoisted(() => ({ userId: 42, role: 'user', empresaId: 1 }));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('empresaId', viewer.empresaId);
    c.set('tenantContext', { empresaId: viewer.empresaId, userId: viewer.userId, role: viewer.role });
    c.set('userId', viewer.userId);
    c.set('userRole', viewer.role);
    c.set('role', viewer.role);
    await next();
  },
}));
import sgsoRoutes from '../../routes/sgso';

describe('SGSO anonymous submitter privacy (P10-01)', () => {
  it('redacts detail and status history but preserves internal audit and tenant isolation', async () => {
    const db = new SqliteD1Database();
    try {
      db.database.exec(readFileSync('migrations/0271_sgso_tabelas_base.sql', 'utf8'));
      db.database.exec(readFileSync('migrations/0272_sgso_fatores_humanos_e_protocolo.sql', 'utf8'));
      db.database.exec(
        "DROP TABLE IF EXISTS funcionarios; " +
        "CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, cargo TEXT, deleted_at TEXT);" +
        "CREATE TABLE IF NOT EXISTS aeronaves (id INTEGER PRIMARY KEY, empresa_id INTEGER, prefixo TEXT, modelo TEXT, deleted_at TEXT);" +
        "INSERT OR REPLACE INTO funcionarios (id, empresa_id, nome, cargo) VALUES (42,1,'Relator Sintetico','Piloto'),(99,1,'Colega Sintetico','Piloto');",
      );
      const app = new Hono<any>();
      app.route('/api/sgso', sgsoRoutes);
      const env = { DB: db.asD1() } as any;
      viewer.userId = 42;
      viewer.empresaId = 1;
      viewer.role = 'user';
      const post = await app.request('/api/sgso/relatos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PERIGO',
          anonimo: true,
          data_ocorrencia: '2026-11-01',
          descricao: 'Relato sintetico de perigo sem dados pessoais no texto.',
        }),
      }, env);
      expect(post.status).toBe(201);
      const id = ((await post.json()) as any).data.id;
      const stored = await db.prepare('SELECT created_by FROM sgso_relatos WHERE id = ?')
        .bind(id).first<{ created_by: number }>();
      expect(stored?.created_by).toBe(42);

      viewer.userId = 99;
      viewer.role = 'aluno';
      const detail = await app.request('/api/sgso/relatos/' + id, {}, env);
      expect(detail.status).toBe(200);
      const report = ((await detail.json()) as any).data;
      expect(report.relator_id).toBeNull();
      expect(report.relator_nome).toBe('Anônimo');
      expect(report).not.toHaveProperty('created_by');

      const history = await app.request('/api/sgso/relatos/' + id + '/historico', {}, env);
      expect(history.status).toBe(200);
      const events = ((await history.json()) as any).data;
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event).not.toHaveProperty('alterado_por');
        expect(event).not.toHaveProperty('alterado_por_nome');
        expect(event).not.toHaveProperty('relato_anonimo');
      }
      expect(JSON.stringify(events)).not.toContain('Relator Sintetico');

      const list = await app.request('/api/sgso/relatos', {}, env);
      expect(list.status).toBe(200);
      expect(((await list.json()) as any).data[0].relator_nome).toBe('Anônimo');

      viewer.empresaId = 2;
      expect((await app.request('/api/sgso/relatos/' + id, {}, env)).status).toBe(404);
      const wrongTenantHistory = await app.request('/api/sgso/relatos/' + id + '/historico', {}, env);
      expect(wrongTenantHistory.status).toBe(200);
      expect(((await wrongTenantHistory.json()) as any).data).toEqual([]);
    } finally {
      viewer.userId = 42;
      viewer.empresaId = 1;
      viewer.role = 'user';
      db.close();
    }
  });
});
