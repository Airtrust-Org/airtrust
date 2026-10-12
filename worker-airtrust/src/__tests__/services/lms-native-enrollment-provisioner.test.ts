import { describe, expect, it, vi } from 'vitest';
import { canProvisionNative, provisionNativeEnrollment } from '../../services/lms-native-enrollment-provisioner';
import type { Env } from '../../types';

function harness(opts: { production?: boolean; preview?: string; writes?: string; marker?: string;
  fk?: number; failBatch?: boolean; changes?: number; row?: unknown } = {}) {
  const statements: { sql: string; bindings: unknown[] }[] = [];
  const batch = vi.fn(async (items: unknown[]) => {
    if (opts.failBatch) throw new Error('injected transaction abort');
    expect(items).toHaveLength(13);
    return items.map((_, i) => ({
      success: true,
      meta: { changes: [3,6,9,11].includes(i) ? opts.changes ?? 1 : 0 },
    }));
  });
  const db = {
    prepare: vi.fn((sql: string) => ({
      first: vi.fn(async () => ({ foreign_keys: opts.fk ?? 1 })),
      bind: (...bindings: unknown[]) => {
        const stmt = { sql, bindings };
        statements.push(stmt);
        return { ...stmt, first: async () => opts.row === undefined ?
          { matricula_id: 42, ciclo_id: 51, edicao_id: 7 } : opts.row };
      },
    })),
    batch,
  } as unknown as D1Database;
  const env = {
    ENVIRONMENT: opts.production ? 'production' : 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: opts.marker ?? '6',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: opts.preview ?? '6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: opts.writes ?? '6',
    DB: db,
  } as Env;
  const execute = (override: Partial<Parameters<typeof provisionNativeEnrollment>[0]> = {}) =>
    provisionNativeEnrollment({ env, empresaId: 6, cursoId: 10, actorUserId: 900, edicaoId: 7,
      ...override });
  return { execute, statements, batch, db, env };
}

describe('Native provision transaction is staging-only and unmounted', () => {
  it('rejects production and all disabled/mismatched allowlists before D1 access', async () => {
    for (const options of [
      { production: true }, { preview: '' }, { writes: '' }, { marker: '' },
      { preview: '*' }, { writes: '60' }, { marker: '60' },
    ]) {
      const f = harness(options);
      await expect(f.execute()).rejects.toMatchObject({ code: 'NATIVE_PROVISION_NOT_ENABLED' });
      expect(f.db.prepare).not.toHaveBeenCalled();
      expect(f.batch).not.toHaveBeenCalled();
    }
  });
  it('requires valid tenant/course/actor/edition identifiers', async () => {
    const f = harness();
    for (const bad of [
      { empresaId: 0 }, { cursoId: 1.5 }, { actorUserId: -1 }, { edicaoId: NaN },
    ]) await expect(f.execute(bad)).rejects.toMatchObject({ code: 'NATIVE_PROVISION_INVALID_CONTEXT' });
    expect(f.db.prepare).not.toHaveBeenCalled();
  });
  it('fails closed if deferred FK enforcement cannot be confirmed', async () => {
    const f = harness({ fk: 0 });
    await expect(f.execute()).rejects.toMatchObject({ code: 'NATIVE_PROVISION_FK_PREFLIGHT_FAILED' });
    expect(f.batch).not.toHaveBeenCalled();
  });
  it('binds all identities and edition pin in one 13-statement atomic batch', async () => {
    const f = harness();
    await expect(f.execute()).resolves.toEqual({ matriculaId: 42, cicloId: 51, edicaoId: 7 });
    expect(f.batch).toHaveBeenCalledTimes(1);
    expect(f.statements).toHaveLength(14); // 13 transactional + receipt SELECT
    expect(f.statements[0].bindings).toEqual([900,10,6,7]);
    expect(f.statements[1].bindings.slice(1)).toEqual([900,10,6,7]);
    expect(f.statements[0].sql).toContain("ed.status='PUBLISHED'");
    expect(f.statements[1].sql).toContain('JOIN funcionarios f');
    expect(f.statements[1].sql).toContain("TRIM(f.status)");
    expect(f.statements[1].sql).toContain("f.empresa_id=c.empresa_id");
    expect(f.statements[6].sql).toContain('INSERT INTO lms_matricula_ciclos');
    expect(f.statements[6].sql).toContain("'LMS','NAO_INICIADO',1");
    expect(f.statements[9].sql).toContain('INSERT INTO lms_native_matricula_edicoes');
    expect(f.statements[12].sql).toContain('NATIVE_PROVISION_ORPHAN_INTENT');
    expect(f.statements[13].sql).toContain('u.funcionario_id=m.funcionario_id');
    expect(f.statements.every(stmt => !/certificados|qualificacoes_historico/.test(stmt.sql))).toBe(true);
  });
  it('never reports enrollment success after a failed batch or mixed changes', async () => {
    for (const opts of [{ failBatch: true, row: null }, { changes: 0, row: null }]) {
      const f = harness(opts);
      await expect(f.execute()).rejects.toMatchObject({ code: 'NATIVE_PROVISION_ATOMIC_REJECTED' });
    }
  });
  it('recovers a lost response only when the exact pinned enrollment can be verified', async () => {
    const f = harness({ failBatch: true });
    await expect(f.execute()).resolves.toEqual({ matriculaId: 42, cicloId: 51, edicaoId: 7 });
    expect(f.batch).toHaveBeenCalledTimes(1);
    const receipt = f.statements.find(statement => statement.sql.includes('SELECT m.id AS matricula_id'));
    expect(receipt?.sql).toContain('JOIN lms_native_catalog_activation a');
    expect(receipt?.sql).toContain('f.empresa_id=m.empresa_id');
    expect(receipt?.sql).toContain("cy.status=m.status");
    expect(receipt?.sql).toContain("ed.status='PUBLISHED'");
    expect(receipt?.sql).toContain("m.status IN ('NAO_INICIADO','EM_ANDAMENTO')");
    expect(receipt?.bindings).toEqual([900,6,10,7]);
  });

  it('does not fabricate a receipt if postcommit D1 lookup fails', async () => {
    const f = harness({ row: null });
    await expect(f.execute()).rejects.toMatchObject({ code: 'NATIVE_PROVISION_RECEIPT_UNAVAILABLE' });
  });
  it('keeps an exact tenant matching contract without wildcard', () => {
    const f = harness();
    expect(canProvisionNative(f.env, 6)).toBe(true);
    expect(canProvisionNative(f.env, 60)).toBe(false);
  });
});
