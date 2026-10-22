import { describe, expect, it, vi } from 'vitest';
import { isNativeForLegacyLmsPath, nativeScopedSql } from '../../services/lms-native-catalog-legacy-guard';
import type { Env } from '../../types';

function mock(flag?: string, row: number | null = 72, reject = false, tableExists = true) {
  const first = vi.fn(async () => {
    if (reject) throw new Error('D1 table missing or temporarily unavailable');
    return row === null ? null : { curso_id: row };
  });
  const existsFirst = vi.fn(async () => {
    if (reject) throw new Error('D1 schema temporarily unavailable');
    return tableExists ? { found: 1 } : null;
  });
  const bind = vi.fn(() => ({ first }));
  const schemaBind = vi.fn(() => ({ first: existsFirst }));
  const prepare = vi.fn((sql: string) => ({
    bind: sql.includes('sqlite_master') ? schemaBind : bind,
  }));
  const env = { ENVIRONMENT: 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: flag,
    DB: { prepare } as unknown as D1Database } as Env;
  return { env, prepare, bind, schemaBind };
}

describe('effective Native catalog identity — fail-closed staging-only read barrier', () => {
  it('keeps physical native blocked regardless of environment and without D1 queries', async () => {
    const { env, prepare } = mock();
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'native')).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('keeps non-SCORM legacy formats unchanged and checks only staging SCORM identity', async () => {
    const { env, prepare } = mock(undefined, null, false, false);
    for (const kind of ['h5p', 'pdf', 'video', 'pptx']) {
      expect(await isNativeForLegacyLmsPath(env, 6, 72, kind)).toBe(false);
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('sqlite_master'));
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it('blocks physical SCORM marked Native even if the catalog read allowlist is OFF', async () => {
    const { env, prepare, schemaBind, bind } = mock('', 72, false, true);
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(true);
    expect(schemaBind).toHaveBeenCalledWith('lms_native_catalog_activation');
    expect(bind).toHaveBeenCalledWith(6, 72);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('preserves unmarked SCORM when marker table exists and UI flag is OFF', async () => {
    const { env } = mock('', null, false, true);
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
  });
  it('fails closed when marker schema lookup fails even with catalog UI OFF', async () => {
    const { env } = mock('', 72, true);
    await expect(isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).rejects.toMatchObject({
      statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED',
    });
  });
  it('blocks an activated SCORM-physical course by exact tenant and course', async () => {
    const { env, prepare, bind } = mock('6,12');
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(true);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('FROM lms_native_catalog_activation'));
    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith(6, 72);
  });
  it('keeps an unactivated SCORM course allowed in the same staging tenant', async () => {
    const { env } = mock('6', null);
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
  });
  it('ignores display-flag mismatches, but never queries production or bad identifiers', async () => {
    const { env, prepare } = mock('16', null, false, false);
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '*';
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    expect(prepare).toHaveBeenCalledTimes(2);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '6';
    expect(await isNativeForLegacyLmsPath(env, -1, 72, 'scorm')).toBe(false);
    env.ENVIRONMENT = 'production';
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it('rejects legacy execution if marker lookup fails once the flag is enabled', async () => {
    const { env } = mock('6', 72, true);
    await expect(isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).rejects.toMatchObject({
      statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED',
    });
  });
});


describe('Native evidence SQL predicate — exact staged marker and no production fallback', () => {
  const baseSql = "SELECT b.id FROM lms_native_matricula_edicoes b " +
    "JOIN lms_cursos c ON c.id=b.curso_id AND c.empresa_id=b.empresa_id " +
    "WHERE c.tipo_conteudo='native' AND b.empresa_id=? AND b.ciclo_id=?";

  it('includes tenant-and-course-correlated marker only with exact staging opt-in', () => {
    const { env } = mock('6');
    const sql = nativeScopedSql(baseSql, env, 6);
    expect(sql).toContain("c.tipo_conteudo='scorm'");
    expect(sql).toContain('FROM lms_native_catalog_activation a');
    expect(sql).toContain('a.empresa_id=c.empresa_id');
    expect(sql).toContain('a.curso_id=c.id');
    expect(sql).toContain('b.empresa_id=? AND b.ciclo_id=?');
  });

  it('never reads activation table for production, mismatched tenant or unset flag', () => {
    const { env } = mock('');
    expect(nativeScopedSql(baseSql, env, 6)).toBe(baseSql);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '60';
    expect(nativeScopedSql(baseSql, env, 6)).toBe(baseSql);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '6';
    env.ENVIRONMENT = 'production';
    expect(nativeScopedSql(baseSql, env, 6)).toBe(baseSql);
    expect(nativeScopedSql(baseSql, undefined, 6)).toBe(baseSql);
  });

  it('fails before SQL execution if the canonical Native predicate is absent or ambiguous', () => {
    const { env } = mock('6');
    expect(() => nativeScopedSql('SELECT 1', env, 6))
      .toThrow('NATIVE_SQL_SCOPE_CONTRACT_INVALID');
    expect(() => nativeScopedSql(baseSql + ' AND c.tipo_conteudo=\'native\'', env, 6))
      .toThrow('NATIVE_SQL_SCOPE_CONTRACT_INVALID');
  });
});
