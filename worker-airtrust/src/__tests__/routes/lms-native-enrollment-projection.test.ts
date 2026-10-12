import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set(k: string, v: unknown): void }, next: () => Promise<void>) => {
    c.set('userId', 900);
    c.set('funcionarioId', 69);
    c.set('userRole', 'employee');
    await next();
  },
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => 6 }));
vi.mock('../../services/lms-edition-mismatch', () => ({
  detectLmsEditionMismatch: vi.fn(async () => ({ mismatch: false })),
}));

import matriculas from '../../routes/lms-matriculas';

function testApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/lms/matriculas', matriculas);
  return app;
}
function state(flag = '6', environment = 'staging', marked = true) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const list = [
    { id: 101, curso_id: 9, funcionario_id: 69, empresa_id: 6,
      status: 'NAO_INICIADO', progresso_pct: 0, tipo_conteudo: 'scorm', titulo: 'Novo Native' },
    { id: 102, curso_id: 8, funcionario_id: 69, empresa_id: 6,
      status: 'EM_ANDAMENTO', progresso_pct: 15, tipo_conteudo: 'scorm', titulo: 'SCORM existente' },
  ];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            first: async () => {
              if (sql.includes('COUNT(*) AS n')) return { n: list.length };
              if (sql.includes('FROM lms_matriculas m')) return { ...list[0] };
              throw Error('UNEXPECTED_READ');
            },
            all: async () => {
              if (sql.includes('FROM lms_native_catalog_activation')) {
                return { results: marked ? [{ curso_id: 9 }] : [] };
              }
              if (sql.includes('FROM lms_matriculas m')) return { results: list };
              throw Error('UNEXPECTED_LIST_QUERY');
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const env = { DB: db, ENVIRONMENT: environment,
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: flag } as Env;
  return { db, env, calls };
}
describe('Effective Native enrollment identity for authenticated learner lists', () => {
  it.each(['/minhas','/minhas-ead'])('projects activated Native on %s but preserves SCORM', async (path) => {
    const { env, calls } = state();
    const res = await testApp().fetch(new Request(
      'http://localhost/api/lms/matriculas'+path), env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { id: number; tipo_conteudo: string }[] };
    expect(json.data.map(row => [row.id, row.tipo_conteudo]))
      .toEqual([[101,'native'],[102,'scorm']]);
    const lookup = calls.find(call => call.sql.includes('FROM lms_native_catalog_activation'));
    expect(lookup?.values).toEqual([6,9,8]);
  });
  it('returns effective Native on enrollment detail and never consults SCORM progress', async () => {
    const { env, calls } = state();
    const response = await testApp().fetch(new Request(
      'http://localhost/api/lms/matriculas/101'), env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    const json = await response.json() as { data: {
      tipo_conteudo: string; scorm_progresso: unknown; completion_diagnostic: unknown;
    } };
    expect(json.data.tipo_conteudo).toBe('native');
    expect(json.data.scorm_progresso).toBeNull();
    expect(json.data.completion_diagnostic).toBeNull();
    expect(calls.some(call => call.sql.includes('FROM lms_progresso_scorm'))).toBe(false);
    expect(calls.some(call => call.sql.includes('FROM lms_xapi_statements'))).toBe(false);
    expect(calls.find(call => call.sql.includes('lms_native_catalog_activation'))?.values)
      .toEqual([6,9]);
  });

  it('does not query a non-existent activation table when flag is disabled', async () => {
    const { env, calls } = state('');
    const res = await testApp().fetch(new Request(
      'http://localhost/api/lms/matriculas/minhas'), env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    const json = await res.json() as { data: { tipo_conteudo: string }[] };
    expect(json.data.map(x => x.tipo_conteudo)).toEqual(['scorm','scorm']);
    expect(calls.some(x => x.sql.includes('lms_native_catalog_activation'))).toBe(false);
  });
  it('does not leak staging marker identity through the production environment', async () => {
    const { env, calls } = state('6','production');
    const res = await testApp().fetch(new Request(
      'http://localhost/api/lms/matriculas/minhas'), env, {} as ExecutionContext);
    expect(res.status).toBe(200);
    expect(calls.some(x => x.sql.includes('lms_native_catalog_activation'))).toBe(false);
  });
  it('does not claim Native without a matching activated course', async () => {
    const { env } = state('6','staging',false);
    const res = await testApp().fetch(new Request(
      'http://localhost/api/lms/matriculas/minhas'), env, {} as ExecutionContext);
    const json = await res.json() as { data: { tipo_conteudo: string }[] };
    expect(json.data.map(x => x.tipo_conteudo)).toEqual(['scorm','scorm']);
  });
});
