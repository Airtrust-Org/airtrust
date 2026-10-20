import { describe, expect, it, vi } from 'vitest';
import { Hono, type ExecutionContext } from 'hono';
import frmsBombeiros, { isAuthorizedBombeirosFrmsTenant } from '../../routes/frms-bombeiros';

const execContext = {
  waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {},
} as ExecutionContext;

function appFor(empresaId: number, codigo: string, role = 'admin') {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      const call = { sql, params: [] as unknown[] };
      queries.push(call);
      const statement = {
        bind(...params: unknown[]) { call.params = params; return statement; },
        async all() { return { results: [] }; },
        async first() { return null; },
        async run() { throw new Error('Writes prohibited by BOA read-only route'); },
      };
      return statement;
    },
  };
  const app = new Hono<{ Bindings: any; Variables: any }>();
  app.use('*', async (c, next) => {
    c.env = { DB: db, ENVIRONMENT: 'test' };
    c.set('userId', '999');
    c.set('userRole', role);
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId, empresaCodigo: codigo, empresaNome: codigo,
      role, plano: 'qa', permissions: [],
    });
    await next();
  });
  app.onError((error) => new Response(JSON.stringify({ code: (error as { code?: string }).code }), {
    status: (error as { statusCode?: number }).statusCode ?? 500,
    headers: { 'Content-Type': 'application/json' },
  }));
  app.route('/', frmsBombeiros);
  const get = (query = '?mes=2026-09') => app.fetch(
    new Request(`http://localhost/relatorios/mensal-consolidado${query}`), {}, execContext,
  );
  const getCrew = (query = '?cursor=0&limit=50') => app.fetch(
    new Request(`http://localhost/equipe${query}`), {}, execContext,
  );
  return { queries, get, getCrew };
}

describe('BOA/CBMMG — fronteira exclusiva de tenant', () => {
  it.each([
    [6, 'costadosol', 'admin'],
    [6, 'bombeiros', 'admin'],
    [300, 'costadosol', 'admin'],
    [300, 'airtrust', 'admin'],
    [300, 'bombeiros', 'manager'],
    [0, 'bombeiros', 'admin'],
  ] as const)('nega contexto ID %i, codigo %s, papel %s', (empresaId, codigo, role) => {
    expect(isAuthorizedBombeirosFrmsTenant({ empresaId, empresaCodigo: codigo, role })).toBe(false);
  });

  it('aceita identidade de tenant BOA diferente da empresa 6 com admin do tenant', () => {
    expect(isAuthorizedBombeirosFrmsTenant({
      empresaId: 130, empresaCodigo: 'bombeiros', role: 'admin',
    })).toBe(true);
  });

  it.each([
    [6, 'costadosol', 'admin'],
    [6, 'bombeiros', 'admin'],
    [130, 'costadosol', 'admin'],
    [130, 'airtrust', 'admin'],
  ] as const)('nega solicitação HTTP e não faz NENHUMA consulta D1 para %i/%s', async (id, codigo, role) => {
    const { get, queries } = appFor(id, codigo, role);
    const response = await get('?mes=2026-09&empresa_id=130');
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'BOMBEIROS_TENANT_REQUIRED' });
    expect(queries).toEqual([]);
  });

  it('nega leitura ao gestor mesmo com código correto antes de acessar D1', async () => {
    const { get, queries } = appFor(130, 'bombeiros', 'manager');
    expect((await get()).status).toBe(403);
    expect(queries).toEqual([]);
  });

  it('bloqueia dado operacional sem revisão de perfil aprovada e não consulta funcionários', async () => {
    const { get, queries } = appFor(130, 'bombeiros');
    const response = await get('?mes=2026-09&empresa_id=6');
    expect(response.status).toBe(503);
    const body = await response.json() as { code: string };
    expect(body.code).toBe('BOMBEIROS_FRMS_POLICY_NOT_READY');
    // O parâmetro arbitrário empresa_id=6 nunca substitui contexto JWT/tenant.
    expect(queries.every(q => !q.params.includes(6))).toBe(true);
    expect(queries.some(q => /\bfuncionarios\b/.test(q.sql))).toBe(false);
  });

  it('rejeita mês inválido antes de realizar consultas', async () => {
    const { get, queries } = appFor(130, 'bombeiros');
    expect((await get('?mes=2026-99')).status).toBe(400);
    expect(queries).toEqual([]);
  });

  it.each([
    [6, 'costadosol'],
    [6, 'bombeiros'],
    [130, 'costadosol'],
    [130, 'airtrust'],
  ] as const)('nega cadastro BOA via HTTP de empresa %i/%s antes de SQL', async (id, codigo) => {
    const { getCrew, queries } = appFor(id, codigo);
    expect((await getCrew('?cursor=0&limit=50&empresa_id=130')).status).toBe(403);
    expect(queries).toHaveLength(0);
  });

  it('não expõe cadastro em tenant Bombeiros sem perfil regulatório aprovado', async () => {
    const { getCrew, queries } = appFor(130, 'bombeiros');
    const res = await getCrew();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'BOMBEIROS_FRMS_POLICY_NOT_READY' });
    expect(queries.some(q => /FROM funcionarios/i.test(q.sql))).toBe(false);
  });

  it('rejeita cursor malformado ou limit acima do teto sem consultar DB', async () => {
    const { getCrew, queries } = appFor(130, 'bombeiros');
    expect((await getCrew('?cursor=-1&limit=50')).status).toBe(400);
    expect((await getCrew('?cursor=0&limit=131')).status).toBe(400);
    expect(queries).toHaveLength(0);
  });
});
