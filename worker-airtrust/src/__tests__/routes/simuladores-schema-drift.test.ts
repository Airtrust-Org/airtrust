import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import simuladoresRelatorios from '../../routes/simuladores-relatorios';
import simuladoresFichasExtras from '../../routes/simuladores-fichas-extras';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: any) => {
    c.set('empresaId', 1);
    c.set('userId', 1);
    c.set('userRole', 'ADMIN');
    await next();
  }
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 1, userId: 1 })
}));

describe('Simuladores Schema Drift Regressions', () => {
  it('relatorios /uso does not crash when simuladores table lacks empresa_id', async () => {
    const app = new Hono();
    // Simulate D1 DB behavior where simuladores does NOT have empresa_id
    const mockDb = {
      prepare: (sql: string) => {
        if (sql.includes('PRAGMA table_info(simuladores)')) {
          return {
            all: () => Promise.resolve({
              results: [{ name: 'id' }, { name: 'nome' }] // no empresa_id
            })
          };
        }
        return {
          bind: (...args: any[]) => ({
            all: () => {
              if (sql.includes('simuladores s') && sql.includes('s.empresa_id =')) {
                throw new Error('D1_ERROR: no such column: s.empresa_id');
              }
              return Promise.resolve({ results: [] });
            },
            first: () => Promise.resolve(null)
          })
        };
      }
    };

    app.use('*', async (c: any, next: any) => {
      (c as any).env = { DB: mockDb as any, JWT_SECRET: 'test' };
      c.set('empresaId', 1); // Mock tenant context
      c.set('userId', 1);
      await next();
    });
    app.route('/relatorios', simuladoresRelatorios);

    const res = await app.request('/relatorios/uso?data_inicio=2026-01-01&data_fim=2026-12-31', {
      headers: { Authorization: 'Bearer test' }
    });
    
    const body = await res.json() as { success: boolean };
    // Pre-fix it would throw D1_ERROR inside the mock and return 500
    // Post-fix it succeeds because it doesn't add s.empresa_id = ?
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('historico-notas route does not crash on insert when historico_notas_manobras lacks empresa_id', async () => {
    const app = new Hono();
    let insertSql = '';
    const mockDb = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          run: () => {
            if (sql.includes('INSERT INTO historico_notas_manobras') && sql.includes('empresa_id')) {
               throw new Error('D1_ERROR: table historico_notas_manobras has no column named empresa_id');
            }
            insertSql = sql;
            return Promise.resolve({ meta: { last_row_id: 123 } });
          },
          first: () => {
             // Mock fichaCheck and funcionarioCheck success
             if (sql.includes('fichas_sessao')) return Promise.resolve({ id: 1 });
             if (sql.includes('funcionarios')) return Promise.resolve({ id: 10 });
             return Promise.resolve(null);
          }
        })
      })
    };

    app.use('*', async (c: any, next: any) => {
      (c as any).env = { DB: mockDb as any, JWT_SECRET: 'test' };
      c.set('empresaId', 1);
      c.set('userId', 1);
      await next();
    });
    app.route('/', simuladoresFichasExtras);

    const reqBody = {
      funcionario_id: 10,
      ficha_id: 1,
      codigo_manobra: 'M01',
      nota: 8.5
    };

    const res = await app.request('/historico-notas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
      body: JSON.stringify(reqBody)
    });
    
    if (res.status !== 201) {
      console.log(await res.text());
    } else {
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(true);
    }
    
    expect(res.status).toBe(201);
    expect(insertSql).not.toContain('empresa_id');
  });
});
