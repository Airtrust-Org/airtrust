import { processarEventosParaModulo } from '../../shared/handlers';
import { runCronJobWithLease, type CronJobLogger } from './job-runner';

const JOB_NAME = 'domain-events-dispatch';
const SCOPE_KEY = 'global';
export const DOMAIN_EVENT_TENANT_BATCH = 25;
export const DOMAIN_EVENT_ITEM_LIMIT = 50;
// Conservative accounting estimate for the consumer read/update cycle.
export const DOMAIN_EVENT_D1_OPERATIONS_PER_MODULE = 4;

export const DOMAIN_EVENT_MODULES = [
  'escalas',
  'frms',
  'qualificacoes',
  'simuladores',
  'hospedagem',
  'pasta_virtual',
  'compliance',
] as const;

export function buildDomainEventTenantPageQuery(): string {
  return `SELECT id
            FROM empresas
           WHERE deleted_at IS NULL
             AND ativo = 1
             AND id > ?
           ORDER BY id ASC
           LIMIT ?`;
}

export function nextTenantCursor(
  current: number,
  processedIds: number[],
  pageSize: number,
): { cursor: number; cycleComplete: boolean } {
  if (processedIds.length === 0) return { cursor: 0, cycleComplete: true };
  const last = Number(processedIds.at(-1) || current);
  return {
    cursor: processedIds.length < pageSize ? 0 : last,
    cycleComplete: processedIds.length < pageSize,
  };
}

export async function runDomainEventDispatchJob(db: D1Database, logger: CronJobLogger) {
  return runCronJobWithLease({
    db,
    jobName: JOB_NAME,
    scopeKey: SCOPE_KEY,
    logger,
    ttlSeconds: 240,
    budgetMs: 25_000,
    execute: async (context) => {
      let cursor = Number(context.state?.cursor_value || 0);
      if (!Number.isInteger(cursor) || cursor < 0) cursor = 0;

      context.planOperations(
        1 +
          DOMAIN_EVENT_TENANT_BATCH *
            DOMAIN_EVENT_MODULES.length *
            DOMAIN_EVENT_D1_OPERATIONS_PER_MODULE,
      );
      if (!context.consumeD1()) {
        context.stopForBudget('D1_PREVENTIVE_LIMIT_BEFORE_TENANT_DISCOVERY');
        return {
          outcome: 'PARTIAL' as const,
          cursorAfter: String(cursor),
          metadata: { pending: true, tenant_cursor: cursor },
          markStateSuccess: false,
        };
      }

      const page = await db
        .prepare(buildDomainEventTenantPageQuery())
        .bind(cursor, DOMAIN_EVENT_TENANT_BATCH)
        .all<{ id: number }>();
      const tenantIds = (page.results || [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0);

      let processed = 0;
      let failed = 0;
      let eventsProcessed = 0;
      let eventErrors = 0;
      const tenantsWithError: number[] = [];
      const visited: number[] = [];

      for (const empresaId of tenantIds) {
        const plannedTenantCost =
          DOMAIN_EVENT_MODULES.length * DOMAIN_EVENT_D1_OPERATIONS_PER_MODULE;
        if (!context.hasBudget(1200) || !context.hasOperationalBudget(plannedTenantCost, 0)) {
          context.stopForBudget('PREVENTIVE_LIMIT_BEFORE_TENANT');
          break;
        }

        let tenantFailed = false;
        let budgetStopped = false;
        for (const modulo of DOMAIN_EVENT_MODULES) {
          if (!context.consumeD1(DOMAIN_EVENT_D1_OPERATIONS_PER_MODULE)) {
            context.stopForBudget('D1_PREVENTIVE_LIMIT_DURING_TENANT');
            budgetStopped = true;
            break;
          }
          try {
            const result = await processarEventosParaModulo(
              db,
              String(empresaId),
              modulo,
              DOMAIN_EVENT_ITEM_LIMIT,
            );
            eventsProcessed += Number(result.processados || 0);
            eventErrors += Number(result.erros || 0);
            if (Number(result.erros || 0) > 0) tenantFailed = true;
          } catch {
            tenantFailed = true;
            eventErrors += 1;
          }
        }

        if (budgetStopped) break;

        visited.push(empresaId);
        cursor = empresaId;
        if (tenantFailed) {
          failed += 1;
          tenantsWithError.push(empresaId);
        } else {
          processed += 1;
        }

        await context.checkpoint({
          cursorValue: String(cursor),
          metadata: {
            tenant_cursor: cursor,
            processed_tenants: processed,
            failed_tenants: failed,
            tenants_with_error: tenantsWithError.slice(-20),
          },
        });
      }

      const fullyVisitedPage = visited.length === tenantIds.length;
      const cursorResult = fullyVisitedPage
        ? nextTenantCursor(cursor, tenantIds, DOMAIN_EVENT_TENANT_BATCH)
        : { cursor, cycleComplete: false };
      const stopped = context.budgetSnapshot().stop_reason !== null;
      const succeeded = cursorResult.cycleComplete && !stopped && failed === 0;

      return {
        outcome: succeeded ? ('SUCCEEDED' as const) : ('PARTIAL' as const),
        processedCount: processed,
        failedCount: failed,
        cursorAfter: String(cursorResult.cursor),
        metadata: {
          cycle_complete: cursorResult.cycleComplete,
          tenant_cursor: cursorResult.cursor,
          tenants_planned: tenantIds.length,
          tenants_visited: visited.length,
          tenants_with_error: tenantsWithError.slice(-20),
          events_processed: eventsProcessed,
          event_errors: eventErrors,
          pending_tenants: Math.max(0, tenantIds.length - visited.length),
        },
        markStateSuccess: succeeded,
      };
    },
  });
}
