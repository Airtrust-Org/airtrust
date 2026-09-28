import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const listSnapshotMock = vi.fn();

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', 1);
    c.set('userRole', 'ADMINISTRADOR');
    c.set('funcionarioId', 41);
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../lib/frms/operational-snapshot', () => ({
  listFrmsOperationalSnapshot: (...args: unknown[]) => listSnapshotMock(...args),
}));

import snapshotRoutes from '../../routes/frms-operational-snapshot';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/frms', snapshotRoutes);
  return app;
}

describe('GET /frms/operational-snapshot recovery presentation contract', () => {
  beforeEach(() => listSnapshotMock.mockReset());

  it('preserva ausência de avaliação como null sem apagar zero real', async () => {
    listSnapshotMock.mockResolvedValueOnce({
      items: [
        {
          funcionario_id: 10,
          recovery_credit_points: 0,
          recovery_state: null,
          recovery_activity_type: null,
        },
        {
          funcionario_id: 11,
          recovery_credit_points: 0,
          recovery_state: 'PARTIAL',
          recovery_activity_type: 'STANDBY_ONSITE',
        },
      ],
      summary: {},
    });

    const response = await createApp().fetch(
      new Request(
        'http://localhost/frms/operational-snapshot?data_inicio=2026-09-27&data_fim=2026-09-27',
        { headers: { 'x-role': 'ADMINISTRADOR', 'x-empresa-id': '6' } },
      ),
      { DB: {} as D1Database } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.data[0].recovery_credit_points).toBeNull();
    expect(body.data[1].recovery_credit_points).toBe(0);
  });
});
