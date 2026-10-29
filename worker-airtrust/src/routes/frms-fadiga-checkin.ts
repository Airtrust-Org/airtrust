import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import legacyRouter from './frms-fadiga-checkin-legacy';
import { frmsOperationalTodayIso } from '../lib/frms/operational-date';

export { resolveContextoPilotoLimites } from './frms-fadiga-checkin-legacy';

type FrmsFatigueRouter = typeof legacyRouter;

type FrmsFatigueRouterOptions = {
  legacyRouter?: FrmsFatigueRouter;
};

type DailyFatigueStatusItem = Record<string, unknown> & {
  funcionario_id?: unknown;
  funcionario_nome?: unknown;
  status?: unknown;
  data_source?: unknown;
};

// Audit 201 regression guard: alerts follow the canonical daily-fatigue status surface.
// The delegated endpoint owns auth + RBAC and automatically degrades scope=team to self
// for profiles without team visibility, so this wrapper does not duplicate auth logic.
function dailyFatigueAlertMessage(status: string): string {
  if (status === 'not_submitted') {
    return 'Fadiga diária não preenchida pelo tripulante — cálculo indisponível até o check-in.';
  }
  if (status === 'incomplete_checkin') {
    return 'Check-in de fadiga incompleto — cálculo indisponível até completar os dados obrigatórios.';
  }
  if (status === 'unfit_for_duty') {
    return 'Fadiga diária indica condição não apta para jornada. Revisão operacional imediata necessária.';
  }
  if (status === 'critical') {
    return 'Fadiga diária em nível crítico. Revisão operacional imediata necessária.';
  }
  return 'Fadiga diária em nível de atenção. Revisão operacional necessária.';
}

function legacyRequest(c: Context<AppEnv>, pathname: string): Request {
  const url = new URL(c.req.url);
  url.pathname = pathname;
  return new Request(url.toString(), c.req.raw);
}

export function createFrmsFadigaCheckinRouter(
  options: FrmsFatigueRouterOptions = {},
): FrmsFatigueRouter {
  const delegatedRouter = options.legacyRouter ?? legacyRouter;
  const router = new Hono<AppEnv>();

  router.get('/daily-fatigue/alerts', async (c) => {
    const date = c.req.query('date') || frmsOperationalTodayIso();
    const teamRequest = legacyRequest(c, '/daily-fatigue');
    const teamUrl = new URL(teamRequest.url);
    teamUrl.search = '';
    teamUrl.searchParams.set('date', date);
    teamUrl.searchParams.set('scope', 'team');

    // The daily roster is paginated. A single implicit first page (100 crew)
    // silently drops later check-in alerts; collect every page or fail closed.
    // Non-managers are still scoped to their own record by the delegated route.
    const pageSize = 500;
    const maxPages = 20;
    const statusItems: DailyFatigueStatusItem[] = [];
    const seenCrew = new Set<number>();
    const validStatuses = new Set([
      'no_duty', 'normal', 'not_submitted', 'incomplete_checkin',
      'attention', 'critical', 'unfit_for_duty',
    ]);
    const incomplete = () => c.json({
      success: false,
      error: 'FRMS_DAILY_FATIGUE_SNAPSHOT_INCOMPLETE',
    }, 502);

    for (let page = 0; page < maxPages; page++) {
      const pageUrl = new URL(teamUrl);
      pageUrl.searchParams.set('limit', String(pageSize));
      pageUrl.searchParams.set('offset', String(page * pageSize));
      const statusResponse = await delegatedRouter.fetch(
        new Request(pageUrl.toString(), teamRequest),
        c.env,
        c.executionCtx,
      );
      if (!statusResponse.ok) return statusResponse;

      let statusPayload: { success?: boolean; data?: Record<string, unknown> };
      try {
        statusPayload = (await statusResponse.json()) as typeof statusPayload;
      } catch {
        return incomplete();
      }
      const data = statusPayload?.data;
      if (statusPayload?.success !== true || !data || data.date !== date) {
        return incomplete();
      }

      if (Array.isArray(data.items)) {
        if (data.items.length > pageSize) return incomplete();
        for (const item of data.items as DailyFatigueStatusItem[]) {
          const id = item?.funcionario_id;
          if (!Number.isSafeInteger(id) || Number(id) <= 0 ||
              !validStatuses.has(String(item?.status || '')) ||
              seenCrew.has(Number(id))) {
            return incomplete();
          }
          seenCrew.add(Number(id));
          statusItems.push(item);
        }
        if (data.items.length < pageSize) break;
        // Never silently truncate a roster beyond the bounded QA-safe scan.
        if (page === maxPages - 1) {
          return c.json({ success: false, error: 'FRMS_DAILY_FATIGUE_ROSTER_LIMIT' }, 503);
        }
      } else if (page === 0 && Number.isSafeInteger(data.funcionario_id) &&
                 Number(data.funcionario_id) > 0 &&
                 validStatuses.has(String(data.status || ''))) {
        // The delegated route downgrades a non-manager's scope=team to self.
        statusItems.push(data as DailyFatigueStatusItem);
        break;
      } else {
        return incomplete();
      }
    }

    const alertableStatuses = new Set([
      'not_submitted',
      'incomplete_checkin',
      'attention',
      'critical',
      'unfit_for_duty',
    ]);

    const items = statusItems
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
  // override; every other endpoint continues through the legacy router.
  router.route('/', delegatedRouter);

  return router;
}

const router = createFrmsFadigaCheckinRouter();

export default router;
