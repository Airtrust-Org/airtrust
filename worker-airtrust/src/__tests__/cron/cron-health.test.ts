import { describe, expect, it, vi } from 'vitest';

import {
  buildCronHealthQuery,
  collectCronHealthSnapshot,
  CRON_HEALTH_BACKLOG_THRESHOLD,
  CRON_HEALTH_FAILURE_THRESHOLD,
  CRON_HEALTH_RETRY_THRESHOLD,
} from '../../cron/resilient/cron-health';

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('cron resilience health', () => {
  it('consulta somente campos operacionais agregados e aplica limite', () => {
    const sql = compactSql(buildCronHealthQuery());
    expect(sql).toContain("s.job_name IN ( 'lms-reminders', 'ead-renewal'");
    expect(sql).toContain("i.status = 'FAILED' AND i.attempts >= ?");
    expect(sql).toContain('LIMIT ?');
    expect(sql).not.toMatch(/token|cookie|email|cpf|nome|payload_json/i);
  });

  it('classifica falhas repetidas, lease expirado, backlog e retries esgotados', async () => {
    const all = vi.fn().mockResolvedValue({
      results: [
        {
          job_name: 'ead-renewal',
          scope_key: 'global',
          consecutive_failures: CRON_HEALTH_FAILURE_THRESHOLD,
          last_error_code: 'EAD_RENEWAL_REPAIR_FAILED',
          lease_owner: 'ead-renewal:owner',
          lease_expires_at: '2026-08-02T07:59:00.000Z',
          pending_items: CRON_HEALTH_BACKLOG_THRESHOLD,
          exhausted_items: 2,
        },
      ],
    });
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    const db = { prepare } as unknown as D1Database;

    const snapshot = await collectCronHealthSnapshot(db, new Date('2026-08-02T08:00:00.000Z'));

    expect(bind).toHaveBeenCalledWith(CRON_HEALTH_RETRY_THRESHOLD, 200);
    expect(snapshot).toMatchObject({
      checkedScopes: 1,
      repeatedFailureScopes: 1,
      expiredLeaseScopes: 1,
      backlogScopes: 1,
      exhaustedItemScopes: 1,
      pendingItems: CRON_HEALTH_BACKLOG_THRESHOLD,
      exhaustedItems: 2,
    });
    expect(snapshot.affectedScopes).toEqual([
      {
        job_name: 'ead-renewal',
        scope_key: 'global',
        error_code: 'EAD_RENEWAL_REPAIR_FAILED',
      },
    ]);
  });
});
