import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv, Env } from '../../types';
import { createFrmsFadigaCheckinRouter } from '../../routes/frms-fadiga-checkin';

function createLegacyRouter() {
  const legacy = new Hono<AppEnv>();

  legacy.get('/daily-fatigue', (c) => {
    const date = c.req.query('date');
    if (date === '2026-09-02') {
      return c.json({ success: false, error: 'upstream failure' }, 503);
    }

    return c.json({
      success: true,
      data: {
        items: [
          {
            funcionario_id: 101,
            funcionario_nome: 'Tripulante Sem Check-in',
            status: 'not_submitted',
            data_source: 'default_estimate',
          },
          {
            funcionario_id: 102,
            funcionario_nome: 'Tripulante Atenção',
            status: 'attention',
            data_source: 'crew_reported',
          },
          {
            funcionario_id: 103,
            funcionario_nome: 'Tripulante Crítico',
            status: 'critical',
            data_source: 'crew_reported',
          },
          {
            funcionario_id: 104,
            funcionario_nome: 'Tripulante Não Apto',
            status: 'unfit_for_duty',
            data_source: 'crew_reported',
          },
          {
            funcionario_id: 105,
            funcionario_nome: 'Tripulante Normal',
            status: 'normal',
            data_source: 'crew_reported',
          },
        ],
      },
    });
  });

  legacy.get('/daily-fatigue/alerts', (c) =>
    c.json({ success: true, data: { delegated: true } }),
  );

  return legacy;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  const routes = createFrmsFadigaCheckinRouter({
    legacyRouter: createLegacyRouter(),
    authMiddleware: async (c, next) => {
      c.set('userRole', c.req.header('x-role') || 'ADMINISTRADOR');
      await next();
    },
    canSeeTeamScope: (role) => String(role || '').toUpperCase() === 'ADMINISTRADOR',
  });
  app.route('/api/frms', routes);
  return app;
}

describe('GET /api/frms/daily-fatigue/alerts', () => {
  it('deriva alertas de equipe do snapshot diário sem depender de frms_alerta', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-01', {
        headers: { 'x-role': 'ADMINISTRADOR' },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.source).toBe('daily_fatigue_status');
    expect(body.data.count).toBe(4);
    expect(body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tripulante_id: 101,
          nivel: 'ATENCAO',
          alert_type: 'daily_fatigue_not_submitted',
        }),
        expect.objectContaining({
          tripulante_id: 102,
          nivel: 'ATENCAO',
          alert_type: 'daily_fatigue_attention',
        }),
        expect.objectContaining({
          tripulante_id: 103,
          nivel: 'CRITICO',
          alert_type: 'daily_fatigue_critical',
        }),
        expect.objectContaining({
          tripulante_id: 104,
          nivel: 'CRITICO',
          alert_type: 'daily_fatigue_unfit_for_duty',
        }),
      ]),
    );
    expect(body.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ tripulante_id: 105 })]),
    );
  });

  it('preserva o contrato legado para perfis sem escopo de equipe', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-01', {
        headers: { 'x-role': 'PILOTO' },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { delegated: true },
    });
  });

  it('não mascara falha do snapshot diário canônico', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-02', {
        headers: { 'x-role': 'ADMINISTRADOR' },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'upstream failure',
    });
  });
});
