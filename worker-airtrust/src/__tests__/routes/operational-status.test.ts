import { describe, expect, it } from 'vitest';
import {
  buildGlobalOperationalStatusQuery,
  buildTenantGlobalItemStatusQuery,
  buildTenantOperationalStatusQuery,
} from '../../observability/operational-status';

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('operational status queries', () => {
  it('exposes only operational aggregates in the global view', () => {
    const sql = compactSql(buildGlobalOperationalStatusQuery());
    expect(sql).toContain('FROM cron_job_state s');
    expect(sql).toContain('pending_items');
    expect(sql).not.toMatch(/payload_json|last_error_message|cpf|email|nome|token/i);
  });

  it('filters tenant-scoped state by exact scope key', () => {
    const sql = compactSql(buildTenantOperationalStatusQuery());
    expect(sql).toContain('WHERE s.scope_key = ?');
  });

  it('filters global ledger items by internal empresa_id and never returns payload', () => {
    const sql = compactSql(buildTenantGlobalItemStatusQuery());
    expect(sql).toContain("json_extract(i.payload_json, '$.empresa_id')");
    expect(sql).toContain('= ?');
    expect(sql).not.toContain('SELECT i.payload_json');
  });
});
