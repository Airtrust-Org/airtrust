import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const listSnapshotMock = vi.fn();
const syncCheckinMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', Number(c.req.header('x-user-id') || 1));
    c.set('userRole', c.req.header('x-role') || 'manager');
    const rawFuncionarioId = c.req.header('x-funcionario-id');
    c.set('funcionarioId', rawFuncionarioId ? Number(rawFuncionarioId) : null);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: any) => Number(c.req.header('x-empresa-id') || 1),
}));

vi.mock('../../lib/frms/operational-snapshot', () => ({
  listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
}));

vi.mock('../../lib/frms/fadiga-frms-sync', () => ({
  sincronizarCheckinComFrms: (...args: unknown[]) => syncCheckinMock(...args),
}));

import snapshotRoutes from '../../routes/frms-operational-snapshot';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', snapshotRoutes);
  return app;
}

function createDb(
  resolveFuncionarioId: number | null,
  reconcileRows: Array<Record<string, unknown>> = [],
) {
  return {
    prepare: vi.fn((query: string) => {
      if (query.includes('FROM usuarios u') && query.includes('JOIN funcionarios f')) {
        return {
          bind: () => ({
            first: async () => (resolveFuncionarioId ? { id: resolveFuncionarioId } : null),
          }),
        };
      }

      if (
        query.includes('FROM funcionarios') &&
        query.includes('WHERE id = ?') &&
        query.includes('empresa_id = ?')
      ) {
        return {
          bind: () => ({
            first: async () => null,
          }),
        };
      }

      if (query.includes('FROM frms_fadiga_checkin ch')) {
        let binds: unknown[] = [];
        return {
          bind: (...args: unknown[]) => {
            binds = args;
            return {
              all: async () => ({ results: reconcileRows, binds }),
            };
          },
        };
      }

      throw new Error(`Unhandled query: ${query}`);
    }),
  } as unknown as D1Database;
}

describe('GET /frms/operational-snapshot', () => {
  beforeEach(() => {
    listSnapshotMock.mockReset();
    syncCheckinMock.mockReset();
    syncCheckinMock.mockResolvedValue({
      sincronizado: true,
      jornada_id: 'jornada-auto',
      effectiveness_nova: 88.4,
    });
  });

  it('7) mantém isolamento por empresa_id', async () => {
    listSnapshotMock.mockResolvedValueOnce({
      items: [],
      summary: {
        total_tripulantes: 0,
        total_escalados: 0,
        checkins_recebidos: 0,
        checkins_pendentes: 0,
        alertas_criticos: 0,
        alertas_atencao: 0,
        dados_estimados: 0,
        inconsistencias: 0,
        sem_fatorizacao: 0,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request(
        'http://localhost/frms/operational-snapshot?data_inicio=2026-05-25&data_fim=2026-05-26&funcionario_id=99',
        {
          method: 'GET',
          headers: {
            'x-role': 'manager',
            'x-empresa-id': '2',
            'x-user-id': '900',
          },
        },
      ),
      { DB: createDb(null) } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(listSnapshotMock).toHaveBeenCalledTimes(1);

    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 2,
      dataInicio: '2026-05-25',
      dataFim: '2026-05-26',
      filters: expect.objectContaining({ funcionario_id: 99 }),
    });
  });

  it('permite role ADMINISTRADOR ver snapshot de equipe sem forçar funcionario_id próprio', async () => {
    listSnapshotMock.mockResolvedValueOnce({
      items: [],
      summary: {
        total_tripulantes: 0,
        total_escalados: 0,
        checkins_recebidos: 0,
        checkins_pendentes: 0,
        alertas_criticos: 0,
        alertas_atencao: 0,
        dados_estimados: 0,
        inconsistencias: 0,
        sem_fatorizacao: 0,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request(
        'http://localhost/frms/operational-snapshot?data_inicio=2026-06-01&data_fim=2026-06-05',
        {
          method: 'GET',
          headers: {
            'x-role': 'ADMINISTRADOR',
            'x-empresa-id': '6',
            'x-user-id': '41',
            'x-funcionario-id': '41',
          },
        },
      ),
      { DB: createDb(41) } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(listSnapshotMock).toHaveBeenCalledTimes(1);

    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 6,
      dataInicio: '2026-06-01',
      dataFim: '2026-06-05',
      filters: expect.not.objectContaining({ funcionario_id: 41 }),
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      meta: { scope: 'team' },
    });
  });

  it('8) usuário comum não vê snapshot de outros funcionários', async () => {
    listSnapshotMock.mockResolvedValueOnce({
      items: [],
      summary: {
        total_tripulantes: 0,
        total_escalados: 0,
        checkins_recebidos: 0,
        checkins_pendentes: 0,
        alertas_criticos: 0,
        alertas_atencao: 0,
        dados_estimados: 0,
        inconsistencias: 0,
        sem_fatorizacao: 0,
      },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request(
        'http://localhost/frms/operational-snapshot?data_inicio=2026-05-25&data_fim=2026-05-26&funcionario_id=999',
        {
          method: 'GET',
          headers: {
            'x-role': 'user',
            'x-empresa-id': '7',
            'x-user-id': '44',
          },
        },
      ),
      { DB: createDb(11) } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(listSnapshotMock).toHaveBeenCalledTimes(1);

    const [, params] = listSnapshotMock.mock.calls[0];
    expect(params).toMatchObject({
      empresaId: 7,
      filters: expect.objectContaining({ funcionario_id: 11 }),
    });

    await expect(response.json()).resolves.toMatchObject({
      success: true,
      meta: { scope: 'self', forced_funcionario_id: 11 },
    });
  });

  it('reconcilia check-in completo sem jornada no mesmo tenant', async () => {
    const candidate = {
      id: 'checkin-6',
      funcionario_id: 6,
      horas_sono: 6,
      wake_time: '05:30',
      jornada_inicio_prevista: '06:30',
    };
    const db = createDb(null, [candidate]);
    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/frms/operational-snapshot/reconcile-checkins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'manager',
          'x-empresa-id': '6',
          'x-user-id': '41',
        },
        body: JSON.stringify({ data_operacional: '2026-09-24', funcionario_ids: [6] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { requested: 1, eligible: 1, reconciled: 1, unresolved: 0 },
      meta: { scope: 'team' },
    });
    expect(syncCheckinMock).toHaveBeenCalledWith(
      db,
      'checkin-6',
      6,
      '2026-09-24',
      6,
      6,
      '05:30',
      '06:30',
    );
    const query = (db.prepare as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([sql]) => String(sql).includes('FROM frms_fadiga_checkin ch'),
    )?.[0] as string;
    expect(query).toContain('WHERE ch.empresa_id = ?');
    expect(query).toContain('j.empresa_id = ch.empresa_id');
    expect(query).toContain('NOT EXISTS');
  });

  it('bloqueia reconciliação cross-tenant/cross-user para role sem escopo de equipe', async () => {
    const db = createDb(11, []);
    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/frms/operational-snapshot/reconcile-checkins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'user',
          'x-empresa-id': '7',
          'x-user-id': '44',
        },
        body: JSON.stringify({ data_operacional: '2026-09-24', funcionario_ids: [999] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(403);
    expect(syncCheckinMock).not.toHaveBeenCalled();
  });

  it('rejeita payload inválido de reconciliação antes de tocar o banco', async () => {
    const db = createDb(null, []);
    const app = createApp();
    const response = await app.fetch(
      new Request('http://localhost/frms/operational-snapshot/reconcile-checkins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-role': 'manager', 'x-empresa-id': '6' },
        body: JSON.stringify({ data_operacional: '24/09/2026', funcionario_ids: [] }),
      }),
      { DB: db } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(400);
    expect(db.prepare).not.toHaveBeenCalled();
    expect(syncCheckinMock).not.toHaveBeenCalled();
  });

  it('9) falha explicitamente em vez de fingir fila vazia quando o perfil regulatório não está configurado', async () => {
    const { FrmsParameterResolutionError } = await import('../../lib/frms/parameter-governance');
    listSnapshotMock.mockRejectedValueOnce(
      new FrmsParameterResolutionError(
        'FRMS_CONTEXT_UNAVAILABLE',
        'No effective FRMS profile assignment for empresa=6',
      ),
    );

    const app = createApp();
    const response = await app.fetch(
      new Request(
        'http://localhost/frms/operational-snapshot?data_inicio=2026-09-01&data_fim=2026-09-01',
        {
          method: 'GET',
          headers: {
            'x-role': 'manager',
            'x-empresa-id': '6',
            'x-user-id': '1',
          },
        },
      ),
      { DB: createDb(null) } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as any;
    expect(body.success).toBe(false);
    expect(body.code).toBe('FRMS_CONTEXT_UNAVAILABLE');
    expect(body.meta.notice).toBe('FRMS_CONTEXT_UNAVAILABLE');
    expect(body.data).toBeUndefined();
  });
});
