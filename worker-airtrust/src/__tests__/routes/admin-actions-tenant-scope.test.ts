import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin actions tenant isolation', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/routes/admin.ts'), 'utf8');

  it('never reads the global legacy audit view', () => {
    expect(source).not.toContain('SELECT * FROM v_admin_actions_audit');
  });

  it('requires tenant context and filters canonical admin events', () => {
    expect(source).toContain("error: 'tenant_scope_required'");
    expect(source).toContain("FROM audit_events_v2");
    expect(source).toContain("WHERE event_category = 'ADMIN_OPERATION'");
    expect(source).toContain('empresa_id = ?');
    expect(source).toContain('target_empresa_id = ?');
    expect(source).toContain('actor_empresa_id = ?');
  });
});
