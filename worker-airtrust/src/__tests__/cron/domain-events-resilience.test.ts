import { describe, expect, it } from 'vitest';
import {
  buildDomainEventTenantPageQuery,
  DOMAIN_EVENT_MODULES,
  DOMAIN_EVENT_TENANT_BATCH,
  nextTenantCursor,
} from '../../cron/resilient/domain-events';

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('domain events tenant cursor', () => {
  it('uses keyset pagination over active tenants', () => {
    const sql = compactSql(buildDomainEventTenantPageQuery());
    expect(sql).toContain('id > ?');
    expect(sql).toContain('ORDER BY id ASC');
    expect(sql).toContain('LIMIT ?');
    expect(DOMAIN_EVENT_TENANT_BATCH).toBeLessThanOrEqual(25);
    expect(DOMAIN_EVENT_MODULES.length).toBeGreaterThan(1);
  });

  it('reaches the final tenant across 100 simulated tenants', () => {
    const tenants = Array.from({ length: 100 }, (_, index) => index + 1);
    const visited: number[] = [];
    let cursor = 0;

    while (visited.length < tenants.length) {
      const page = tenants.filter((id) => id > cursor).slice(0, DOMAIN_EVENT_TENANT_BATCH);
      visited.push(...page);
      const next = nextTenantCursor(cursor, page, DOMAIN_EVENT_TENANT_BATCH);
      cursor = next.cursor;
      if (next.cycleComplete) break;
    }

    expect(visited).toHaveLength(100);
    expect(visited.at(-1)).toBe(100);
  });

  it('resets the cursor only after a short final page', () => {
    expect(nextTenantCursor(75, [76, 77], DOMAIN_EVENT_TENANT_BATCH)).toEqual({
      cursor: 0,
      cycleComplete: true,
    });
    expect(
      nextTenantCursor(
        0,
        Array.from({ length: 25 }, (_, i) => i + 1),
        25,
      ),
    ).toEqual({
      cursor: 25,
      cycleComplete: false,
    });
  });
});
