import { describe, it, expect } from 'vitest';
import {
  validateD1Target,
  validateTenantTarget,
  buildSeedSql,
  ALLOWED_D1_NAME,
  ALLOWED_TENANT_ID,
  ALLOWED_TENANT_CODIGO,
  FIXTURE_ORIGEM,
  FIXTURE_TRIPULANTE_MATRICULA,
} from '../../../../scripts/staging/seed-frms-iogp-demo.mjs';
import { buildCleanupSql } from '../../../../scripts/staging/cleanup-frms-iogp-demo.mjs';

describe('FRMS IOGP Staging Demo Fixture Guards & Idempotency', () => {
  it('fails closed when targeting production databases', () => {
    expect(() => validateD1Target('airtrust-db')).toThrow(/bloqueado \(produção\)/);
    expect(() => validateD1Target('airtrust-db-production')).toThrow(/bloqueado \(produção\)/);
    expect(() => validateD1Target('prod-db')).toThrow(/bloqueado \(produção\)/);
    expect(() => validateD1Target('')).toThrow(/D1 target vazio/);
  });

  it('allows only the designated staging database', () => {
    expect(validateD1Target(ALLOWED_D1_NAME)).toBe(ALLOWED_D1_NAME);
    expect(() => validateD1Target('unauthorized-db')).toThrow(/não é o staging esperado/);
  });

  it('fails closed when targeting an unauthorized tenant', () => {
    expect(() => validateTenantTarget(1, 'airtrust')).toThrow(/Tenant ID 1 não autorizado/);
    expect(() => validateTenantTarget(6, 'cds')).toThrow(/Tenant ID 6 não autorizado/);
    expect(() => validateTenantTarget(999006, 'wrong_codigo')).toThrow(/Tenant código "wrong_codigo" não autorizado/);
    expect(() => validateTenantTarget(ALLOWED_TENANT_ID, ALLOWED_TENANT_CODIGO)).not.toThrow();
  });

  it('generates idempotent seed SQL isolated to tenant 999006 and QA prefix', () => {
    const sql = buildSeedSql();
    expect(sql).toContain(FIXTURE_TRIPULANTE_MATRICULA);
    expect(sql).toContain(FIXTURE_ORIGEM);
    expect(sql).toContain(String(ALLOWED_TENANT_ID));
    expect(sql).toContain('DEMO_QA_IOGP_690_2');
    expect(sql).toContain('qa-frms-demo-20260818-01');
    expect(sql).toContain('qa-frms-demo-20260821-01');
    expect(sql).toContain('frms_acumulo_rolling');
    expect(sql).toContain('horas_voo_lancamentos');
    // Ensure all insert statements are guarded by NOT EXISTS or INSERT OR REPLACE
    expect(sql).not.toMatch(/INSERT INTO funcionarios\s*\([^)]*\)\s*VALUES/i);
  });

  it('generates restricted cleanup SQL targeting only fixture keys', () => {
    const cleanupSql = buildCleanupSql();
    expect(cleanupSql).toContain(FIXTURE_TRIPULANTE_MATRICULA);
    expect(cleanupSql).toContain(FIXTURE_ORIGEM);
    expect(cleanupSql).toContain(String(ALLOWED_TENANT_ID));
    expect(cleanupSql).toContain('DELETE FROM frms_jornada');
    expect(cleanupSql).toContain('registrado_por =');
    expect(cleanupSql).not.toMatch(/DELETE FROM frms_jornada WHERE empresa_id =/i); // No generic tenant deletes
  });
});
