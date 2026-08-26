import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIXTURE_ROOT,
  STAGING_DB_ID,
  STAGING_DB_NAME,
  STAGING_TARGET,
  SYNTHETIC_TENANT_A,
  SYNTHETIC_TENANT_B,
  WORKER_ROOT,
  buildValidationScenarioPlan,
  parseRemoteValidationCliArgs,
  resolveApprovedFixturePath,
} from '../../services/controle-voos/sigvoos-staging-remote-validation';

describe('sigvoos staging remote validation guards', () => {
  it('keeps STAGING_DB_NAME/STAGING_DB_ID in sync with wrangler.toml env.staging binding', () => {
    const wranglerToml = readFileSync(resolve(WORKER_ROOT, 'wrangler.toml'), 'utf8');
    const stagingEnvMatch = wranglerToml.match(
      /\[env\.staging\][\s\S]*?(?=\n\[env\.(?!staging)|$)/,
    );
    if (!stagingEnvMatch) {
      throw new Error('WRANGLER_TOML_ENV_STAGING_SECTION_NOT_FOUND');
    }
    const stagingEnvBlock = stagingEnvMatch[0];
    const nameMatch = stagingEnvBlock.match(/database_name\s*=\s*"([^"]+)"/);
    const idMatch = stagingEnvBlock.match(/database_id\s*=\s*"([^"]+)"/);

    expect(nameMatch?.[1]).toBe(STAGING_DB_NAME);
    expect(idMatch?.[1]).toBe(STAGING_DB_ID);
  });

  it('requires an explicit staging target and blocks production', () => {
    expect(parseRemoteValidationCliArgs(['--target', STAGING_TARGET])).toEqual({
      mode: 'preview',
      target: STAGING_TARGET,
    });
    expect(parseRemoteValidationCliArgs(['--target', STAGING_TARGET, '--mode', 'apply'])).toEqual({
      mode: 'apply',
      target: STAGING_TARGET,
    });

    expect(() => parseRemoteValidationCliArgs([])).toThrow('SIGVOOS_STAGING_VALIDATION_TARGET_REQUIRED');
    expect(() => parseRemoteValidationCliArgs(['--target', 'production'])).toThrow(
      'BLOQUEADO — REQUER FASE SENSÍVEL',
    );
    expect(() => parseRemoteValidationCliArgs(['--target', 'dev'])).toThrow(
      'SIGVOOS_STAGING_VALIDATION_TARGET_MUST_BE_STAGING',
    );
  });

  it('accepts only local approved fixtures under the synthetic fixture root', () => {
    expect(resolveApprovedFixturePath('sigvoos-com-flight-report-id.json')).toBe(
      `${FIXTURE_ROOT}/sigvoos-com-flight-report-id.json`,
    );
    expect(() => resolveApprovedFixturePath('https://example.com/payload.json')).toThrow(
      'BLOQUEADO — REQUER FASE SENSÍVEL',
    );
    expect(() => resolveApprovedFixturePath('../outside.json')).toThrow(
      'SIGVOOS_STAGING_VALIDATION_FIXTURE_OUTSIDE_APPROVED_ROOT',
    );
  });

  it('builds the controlled scenario plan with synthetic tenants only', () => {
    expect(buildValidationScenarioPlan()).toEqual([
      { label: 'with-flight-report', fixture: 'sigvoos-com-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
      { label: 'without-flight-report', fixture: 'sigvoos-sem-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
      { label: 'multileg', fixture: 'sigvoos-multileg-flight-report-id.json', empresaId: SYNTHETIC_TENANT_A },
      {
        label: 'staff-conflict',
        fixture: 'sigvoos-staff-id-inscription-conflict.json',
        empresaId: SYNTHETIC_TENANT_A,
      },
      { label: 'missing-canac', fixture: 'sigvoos-sem-canac.json', empresaId: SYNTHETIC_TENANT_A },
      {
        label: 'optional-sensitive',
        fixture: 'sigvoos-optional-missing-extra-sensitive.json',
        empresaId: SYNTHETIC_TENANT_A,
      },
      { label: 'tenant-b-isolation', fixture: 'sigvoos-com-flight-report-id.json', empresaId: SYNTHETIC_TENANT_B },
    ]);
  });
});
