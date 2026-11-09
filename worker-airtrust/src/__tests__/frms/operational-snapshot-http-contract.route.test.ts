/** FRMS P02: HTTP contract at the actual Hono route boundary; not a full browser/D1 E2E. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import snapshotRouter from '../../routes/frms-operational-snapshot';
import { listFrmsOperationalSnapshot } from '../../lib/frms/operational-snapshot';
import { canSeeFrmsTeamScopeForContext } from '../../middleware/frms-access';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: number) => void }, next: () => Promise<void>) => {
    c.set('funcionarioId', 41);
    c.set('userId', 501);
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({ getEmpresaId: () => 999013 }));
vi.mock('../../middleware/frms-access', () => ({ canSeeFrmsTeamScopeForContext: vi.fn() }));
vi.mock('../../lib/frms/operational-snapshot', () => ({ listFrmsOperationalSnapshot: vi.fn() }));

const emptySummary = {
  total_tripulantes: 0, total_escalados: 0, checkins_recebidos: 0,
  checkins_pendentes: 0, alertas_criticos: 0, alertas_atencao: 0,
  dados_estimados: 0, inconsistencias: 0, sem_fatorizacao: 0,
  quinzena_incompleta: 0, quinzena_atencao: 0, quinzena_critica: 0,
};
type ResponseBody = { success: boolean; meta: { scope: string; forced_funcionario_id?: number } };
const mockedList = vi.mocked(listFrmsOperationalSnapshot);
const mockedAccess = vi.mocked(canSeeFrmsTeamScopeForContext);

function createRequest(dbFirst: () => Promise<{ id: number } | null> = async () => ({ id: 41 })) {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          calls.push({ sql, binds });
          return { first: dbFirst };
        },
      };
    },
  };
  const app = new Hono<AppEnv>();
  app.route('/api/frms', snapshotRouter);
  const request = (query = 'data_inicio=2026-11-08&data_fim=2026-11-09') =>
    app.fetch(new Request(`http://localhost/api/frms/operational-snapshot?${query}`), { DB: db } as unknown as Env);
  return { request, calls, db };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedAccess.mockResolvedValue(true);
  mockedList.mockResolvedValue({ items: [], summary: emptySummary });
});

describe('FRMS operational snapshot HTTP/tenant/RBAC contract (P02 boundary)', () => {
  it('for team scope forwards the resolved tenant and verified dates, not an arbitrary client tenant', async () => {
    const { request } = createRequest();
    const response = await request('data_inicio=2026-11-08&data_fim=2026-11-09&empresa_id=6');
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResponseBody).meta.scope).toBe('team');
    expect(mockedList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      empresaId: 999013, dataInicio: '2026-11-08', dataFim: '2026-11-09',
    }));
  });

  it('non-team users are restricted to their active-tenant employee even when requesting another ID', async () => {
    mockedAccess.mockResolvedValue(false);
    const { request, calls } = createRequest();
    const response = await request('data_inicio=2026-11-08&data_fim=2026-11-09&funcionario_id=999');
    expect(response.status).toBe(200);
    expect(((await response.json()) as ResponseBody).meta).toEqual({ scope: 'self', forced_funcionario_id: 41 });
    expect(calls[0].sql).toContain('empresa_id = ?');
    expect(calls[0].binds).toEqual([41, 999013]);
    expect(mockedList).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      empresaId: 999013, filters: expect.objectContaining({ funcionario_id: 41 }),
    }));
  });

  it('fails closed when the authenticated employee does not belong to the active tenant', async () => {
    mockedAccess.mockResolvedValue(false);
    const { request } = createRequest(async () => null);
    const response = await request();
    expect(response.status).toBe(404);
    expect(((await response.json()) as ResponseBody).success).toBe(false);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('rejects a reversed time window before touching D1', async () => {
    const { request, calls } = createRequest();
    const response = await request('data_inicio=2026-11-09&data_fim=2026-11-08');
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('does not convert an internal snapshot failure into success or reveal raw error messages', async () => {
    mockedList.mockRejectedValueOnce(new Error('D1 SECRET INTERNAL SQL SAMPLE'));
    const { request } = createRequest();
    const response = await request();
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain('SECRET INTERNAL SQL');
    expect(JSON.parse(body).success).toBe(false);
  });
});
