import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { patchWranglerEnvVars } from '../lib/patch-wrangler-env-vars.mjs';

const source = readFileSync(new URL('../../worker-airtrust/wrangler.toml', import.meta.url), 'utf8');
const section = (text, env) => {
  const start = text.indexOf(`[env.${env}.vars]`);
  const next = text.indexOf('\n[', start + 1);
  return text.slice(start, next < 0 ? text.length : next);
};

test('production stamps only production and preserves staging byte-for-byte', () => {
  const result = patchWranglerEnvVars(source, { environment: 'production', appVersion: '2026-07-17-f4df0bdd', buildTime: '2026-07-17T20:00:00Z' });
  assert.match(section(result, 'production'), /APP_VERSION = "2026-07-17-f4df0bdd"/);
  assert.equal(section(result, 'staging'), section(source, 'staging'));
});

test('staging stamps only staging and preserves production byte-for-byte', () => {
  const result = patchWranglerEnvVars(source, { environment: 'staging', appVersion: 'staging-f4df0bdd', buildTime: '2026-07-17T20:00:00Z' });
  assert.match(section(result, 'staging'), /APP_VERSION = "staging-f4df0bdd"/);
  assert.equal(section(result, 'production'), section(source, 'production'));
});

test('applies extraVars provenance stamps to the target environment only', () => {
  const result = patchWranglerEnvVars(source, {
    environment: 'staging',
    appVersion: 'staging-abc1234',
    buildTime: '2026-07-18T00:00:00Z',
    extraVars: {
      AIRTRUST_SOURCE_SHA: 'abc1234def5678900000000000000000000000',
      AIRTRUST_WORKER_BUNDLE_SHA256: 'deadbeef',
    },
  });
  assert.match(section(result, 'staging'), /AIRTRUST_SOURCE_SHA = "abc1234def5678900000000000000000000000"/);
  assert.match(section(result, 'staging'), /AIRTRUST_WORKER_BUNDLE_SHA256 = "deadbeef"/);
  assert.equal(section(result, 'production'), section(source, 'production'));
});

test('rejects unsafe extraVars keys and values', () => {
  assert.throws(() =>
    patchWranglerEnvVars(source, {
      environment: 'staging',
      appVersion: 'x',
      buildTime: 'y',
      extraVars: { 'not-a-valid-key': 'z' },
    }),
  );
  assert.throws(() =>
    patchWranglerEnvVars(source, {
      environment: 'staging',
      appVersion: 'x',
      buildTime: 'y',
      extraVars: { AIRTRUST_SOURCE_SHA: 'has spaces' },
    }),
  );
});

test('rejects wrong environment, ambiguous keys, comments, missing sections, and unsafe stamps', () => {
  assert.throws(() => patchWranglerEnvVars(source.replace('ENVIRONMENT = "production"', 'ENVIRONMENT = "staging"'), { environment: 'production', appVersion: 'x', buildTime: 'x' }));
  assert.throws(() => patchWranglerEnvVars(source.replace('[env.production.vars]', '# [env.production.vars]'), { environment: 'production', appVersion: 'x', buildTime: 'x' }));
  assert.throws(() => patchWranglerEnvVars(source.replace(/(\[env\.production\.vars\][\s\S]*?)APP_VERSION = "managed-by-script"/, '$1APP_VERSION = "a"\nAPP_VERSION = "b"'), { environment: 'production', appVersion: 'x', buildTime: 'x' }));
  assert.throws(() => patchWranglerEnvVars(source, { environment: 'production', appVersion: 'bad value', buildTime: 'x' }));
});
