import { describe, expect, it, vi } from 'vitest';
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
    const offset = Number(c.req.query('offset') || 0);
    const limit = Number(c.req.query('limit') || 100);
    if (date === '2026-09-03' || date === '2026-09-05') {
      if (date === '2026-09-05' && offset > 0) {
        return c.json({ success: false, error: 'page 2 unavailable' }, 503);
      }
      const crew = Array.from({ length: 501 }, (_, i) => ({
        funcionario_id: i + 1,
        funcionario_nome: 'Tripulante QA',
        status: i === 500 ? 'not_submitted' : 'normal',
        data_source: i === 500 ? 'missing_checkin' : 'crew_reported',
      }));
      return c.json({ success: true, data: { date, items: crew.slice(offset, offset + limit) } });
    }
    if (date === '2026-09-07') {
      return c.json({
        success: true,
        data: {
          date,
          items: [
            { funcionario_id: 401, status: 'attention', data_source: 'crew_reported',
              nivel_fadiga: 'VERDE', status_operacional: 'APTO' },
            { funcionario_id: 402, status: 'attention', data_source: 'crew_reported',
              nivel_fadiga: 'VERMELHO', status_operacional: 'RESTRITO' },
            { funcionario_id: 403, status: 'attention', data_source: 'crew_reported',
              nivel_fadiga: 'VERDE', status_operacional: 'NAO_APTO' },
            { funcionario_id: 404, status: 'incomplete_checkin', data_source: 'crew_reported',
              nivel_fadiga: 'VERMELHO', status_operacional: 'RESTRITO' },
          ],
        },
      });
    }
    if (date === '2026-09-06') {
      return c.json({
        success: true,
        data: {
          date,
          items: [
            { funcionario_id: 301, status: 'normal', data_source: 'crew_reported',
              nivel_fadiga: 'LARANJA', status_operacional: 'RESTRITO', requires_operational_review: true },
            { funcionario_id: 302, status: 'normal', data_source: 'crew_reported',
              nivel_fadiga: 'AMARELO', status_operacional: 'APTO_COM_RESSALVA', requires_operational_review: false },
            { funcionario_id: 303, status: 'normal', data_source: 'crew_reported',
              nivel_fadiga: 'VERDE', status_operacional: 'RESTRITO', requires_operational_review: true },
            { funcionario_id: 304, status: 'normal', data_source: 'crew_reported',
              nivel_fadiga: 'VERDE', status_operacional: 'APTO', requires_operational_review: false },
            { funcionario_id: 305, status: 'normal', data_source: 'crew_reported',
              nivel_fadiga: 'VERMELHO', status_operacional: 'RESTRITO', requires_operational_review: true },
          ],
        },
      });
    }
    if (date === '2026-09-04') {
      return c.json({ success: true, data: { date, items: null } });
    }

    if ((c.req.header('x-role') || '').toUpperCase() === 'PILOTO') {
      return c.json({
        success: true,
        data: {
          date,
          funcionario_id: 201,
          status: 'attention',
          data_source: 'crew_reported',
        },
      });
    }

    return c.json({
      success: true,
      data: {
        date,
        items: [
          {
            funcionario_id: 101,
            funcionario_nome: 'Tripulante Sem Check-in',
            status: 'not_submitted',
            data_source: 'missing_checkin',
          },
          {
            funcionario_id: 106,
            funcionario_nome: 'Tripulante Check-in Incompleto',
            status: 'incomplete_checkin',
            data_source: 'crew_reported',
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
    c.json({ success: false, error: 'legacy alerts route should not be called' }, 500),
  );

  return legacy;
}

function createApp() {
  const app = new Hono<AppEnv>();
  const routes = createFrmsFadigaCheckinRouter({
    legacyRouter: createLegacyRouter(),
  });
  app.route('/api/frms', routes);
  return app;
}

describe('GET /api/frms/daily-fatigue/alerts', () => {
  it('defaults to the Brazilian operational day when UTC has already rolled over', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-30T00:30:00Z')); // 21:30 on 29 Oct in Brasília.
      const response = await createApp().fetch(
        new Request('http://localhost/api/frms/daily-fatigue/alerts', {
          headers: { 'x-role': 'ADMINISTRADOR' },
        }),
        {} as Env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as any;
      expect(body.data.date).toBe('2026-10-29');
    } finally {
      vi.useRealTimers();
    }
  });

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
    expect(body.data.count).toBe(5);
    expect(body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tripulante_id: 101,
          nivel: 'ATENCAO',
          alert_type: 'daily_fatigue_not_submitted',
        }),
        expect.objectContaining({
          tripulante_id: 106,
          nivel: 'ATENCAO',
          alert_type: 'daily_fatigue_incomplete_checkin',
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

  it('não esconde score configurado elevado ou revisão pós-check-in apenas porque a triagem diária foi normal', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-06', {
        headers: { 'x-role': 'ADMINISTRADOR' },
      }),
      {} as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.data.count).toBe(4);
    expect(body.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ tripulante_id: 301, nivel: 'CRITICO',
        alert_type: 'daily_fatigue_score_critical' }),
      expect.objectContaining({ tripulante_id: 302, nivel: 'ATENCAO',
        alert_type: 'daily_fatigue_score_attention' }),
      expect.objectContaining({ tripulante_id: 303, nivel: 'ATENCAO',
        alert_type: 'daily_fatigue_review_required' }),
      expect.objectContaining({ tripulante_id: 305, nivel: 'CRITICO',
        alert_type: 'daily_fatigue_score_critical' }),
    ]));
    expect(body.data.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ tripulante_id: 304 })]),
    );
    expect(body.data.items.every((item: { mensagem: string }) =>
      item.mensagem.includes('revisão') || item.mensagem.includes('Revisão'))).toBe(true);
  });

  it('não reduz severidade CRITICA calculada a ATENCAO quando a triagem subjetiva já era atenção', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-07', {
        headers: { 'x-role': 'ADMINISTRADOR' },
      }), {} as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    const byId = new Map(body.data.items.map((item: { tripulante_id: number }) =>
      [item.tripulante_id, item]));
    expect(byId.get(401)).toMatchObject({
      nivel: 'ATENCAO', alert_type: 'daily_fatigue_attention',
    });
    expect(byId.get(402)).toMatchObject({
      nivel: 'CRITICO', alert_type: 'daily_fatigue_score_critical',
    });
    expect(byId.get(403)).toMatchObject({
      nivel: 'CRITICO', alert_type: 'daily_fatigue_score_critical',
    });
    // Never trust a stale score when the check-in evidence is incomplete.
    expect(byId.get(404)).toMatchObject({
      nivel: 'ATENCAO', alert_type: 'daily_fatigue_incomplete_checkin',
    });
    expect(body.data.count).toBe(4);
  });

  it('varre páginas além dos 100 primeiros tripulantes sem perder alerta real', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-03', {
        headers: { 'x-role': 'ADMINISTRADOR' },
      }),
      {} as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.data.count).toBe(1);
    expect(body.data.items[0]).toMatchObject({
      tripulante_id: 501,
      alert_type: 'daily_fatigue_not_submitted',
    });
  });

  it('falha fechado se o snapshot estiver malformado ou uma página posterior falhar', async () => {
    for (const [date, status] of [['2026-09-04', 502], ['2026-09-05', 503]] as const) {
      const response = await createApp().fetch(
        new Request(`http://localhost/api/frms/daily-fatigue/alerts?date=${date}`, {
          headers: { 'x-role': 'ADMINISTRADOR' },
        }),
        {} as Env,
        {} as ExecutionContext,
      );
      expect(response.status).toBe(status);
      const body = (await response.json()) as any;
      expect(body.success).toBe(false);
      expect(body.data?.count).toBeUndefined();
    }
  });

  it('preserva o comportamento self quando o endpoint canônico restringe o escopo de equipe', async () => {
    const response = await createApp().fetch(
      new Request('http://localhost/api/frms/daily-fatigue/alerts?date=2026-09-01', {
        headers: { 'x-role': 'PILOTO' },
      }),
      {} as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(1);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        tripulante_id: 201,
        nivel: 'ATENCAO',
        alert_type: 'daily_fatigue_attention',
      }),
    ]);
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
