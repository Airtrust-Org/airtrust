import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { auth } from '../middleware/auth';
import { canSeeFrmsTeamScope } from '../lib/frms/access';
import legacyRouter from './frms-fadiga-checkin-legacy';

const router = new Hono<AppEnv>();

// Audit 201 regression guard: team alerts follow the canonical daily-fatigue status surface.
function dailyFatigueAlertMessage(status: string): string {
  if (status === 'not_submitted') {
    return 'Fadiga diária não preenchida pelo tripulante — usando estimativa padrão. Revisão operacional necessária.';
  }
  if (status === 'unfit_for_duty') {
    return 'Fadiga diária indica condição não apta para jornada. Revisão operacional imediata necessária.';
  }
  if (status === 'critical') {
    return 'Fadiga diária em nível crítico. Revisão operacional imediata necessária.';
  }
  return 'Fadiga diária em nível de atenção. Revisão operacional necessária.';
}

router.get('/daily-fatigue/alerts', auth(), async (c, next) => {
  if (!canSeeFrmsTeamScope(c.get('userRole'))) {
    await next();
    return;
  }

  const date = c.req.query('date') || new Date().toISOString().slice(0, 10);
  const teamUrl = new URL(c.req.url);
  teamUrl.pathname = '/daily-fatigue';
  teamUrl.search = '';
  teamUrl.searchParams.set('date', date);
  teamUrl.searchParams.set('scope', 'team');

  const teamResponse = await legacyRouter.fetch(
    new Request(teamUrl.toString(), c.req.raw),
    c.env,
    c.executionCtx,
  );

  if (!teamResponse.ok) return teamResponse;

  const teamPayload = (await teamResponse.json()) as {
    success?: boolean;
    data?: { items?: Array<Record<string, unknown>> };
  };

  if (teamPayload.success === false) {
    return c.json({ success: false, error: 'Erro ao carregar status de fadiga diária' }, 500);
  }

  const alertableStatuses = new Set([
    'not_submitted',
    'attention',
    'critical',
    'unfit_for_duty',
  ]);

  const items = (teamPayload.data?.items || [])
    .filter((item) => alertableStatuses.has(String(item.status || '')))
    .map((item) => {
      const status = String(item.status || '');
      const funcionarioId = item.funcionario_id;
      const critical = status === 'critical' || status === 'unfit_for_duty';
      return {
        id: `daily-fatigue-derived-${funcionarioId}-${date}-${status}`,
        tripulante_id: funcionarioId,
        nivel: critical ? 'CRITICO' : 'ATENCAO',
        tipo_limite: `daily_fatigue_${status}`,
        mensagem: dailyFatigueAlertMessage(status),
        created_at: `${date} 00:00:00`,
        resolvido: 0,
        resolvido_em: null,
        tripulante_nome: item.funcionario_nome,
        requires_operational_review: 1,
        alert_type: `daily_fatigue_${status}`,
        data_source: item.data_source,
      };
    });

  return c.json({
    success: true,
    data: {
      date,
      count: items.length,
      items,
      source: 'daily_fatigue_status',
    },
  });
});

// Keep the complete existing FRMS fatigue router intact. The route above is the only
// override; non-team access and every other endpoint continue through the legacy router.
router.route('/', legacyRouter);

export default router;
