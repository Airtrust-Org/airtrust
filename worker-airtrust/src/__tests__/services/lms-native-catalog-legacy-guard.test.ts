import { describe, expect, it, vi } from 'vitest';
import { isNativeForLegacyLmsPath } from '../../services/lms-native-catalog-legacy-guard';
import type { Env } from '../../types';

function mock(flag?: string, row: number | null = 72, reject = false) {
  const first = vi.fn(async () => {
    if (reject) throw new Error('D1 table missing or temporarily unavailable');
    return row === null ? null : { curso_id: row };
  });
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  const env = { ENVIRONMENT: 'staging',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: flag,
    DB: { prepare } as unknown as D1Database } as Env;
  return { env, prepare, bind };
}

describe('effective Native catalog identity — fail-closed staging-only read barrier', () => {
  it('keeps physical native blocked regardless of environment and without D1 queries', async () => {
    const { env, prepare } = mock();
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'native')).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('does not add a DB query to existing formats without explicit activation-read flag', async () => {
    const { env, prepare } = mock();
    for (const kind of ['scorm', 'h5p', 'pdf', 'video', 'pptx']) {
      expect(await isNativeForLegacyLmsPath(env, 6, 72, kind)).toBe(false);
    }
    expect(prepare).not.toHaveBeenCalled();
  });
  it('blocks an activated SCORM-physical course by exact tenant and course', async () => {
    const { env, prepare, bind } = mock('6,12');
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(true);
    expect(prepare).toHaveBeenCalledWith(expect.stringContaining('FROM lms_native_catalog_activation'));
    expect(bind).toHaveBeenCalledExactlyOnceWith(6, 72);
  });
  it('keeps an unactivated SCORM course allowed in the same staging tenant', async () => {
    const { env } = mock('6', null);
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
  });
  it('does not query on another tenant, wildcard, production or bad identifiers', async () => {
    const { env, prepare } = mock('16');
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '*';
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    env.NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS = '6';
    expect(await isNativeForLegacyLmsPath(env, -1, 72, 'scorm')).toBe(false);
    env.ENVIRONMENT = 'production';
    expect(await isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
  });
  it('rejects legacy execution if marker lookup fails once the flag is enabled', async () => {
    const { env } = mock('6', 72, true);
    await expect(isNativeForLegacyLmsPath(env, 6, 72, 'scorm')).rejects.toMatchObject({
      statusCode: 503, code: 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED',
    });
  });
});
