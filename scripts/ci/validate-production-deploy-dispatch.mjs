#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const BOOLEAN = /^(true|false)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(message) {
  throw new Error(message);
}

export function validateProductionDeployDispatch(input) {
  const {
    ref,
    sha,
    deployWorker,
    deployPages,
    runMigrations,
    expectedSha,
    reason,
    confirmProduction,
  } = input;

  if (ref !== 'refs/heads/main') fail('Deploy AirTrust only runs from refs/heads/main');
  if (!SHA.test(sha)) fail('github sha is invalid');
  for (const [name, value] of [
    ['deploy_worker', deployWorker],
    ['deploy_pages', deployPages],
    ['run_migrations', runMigrations],
  ]) {
    if (!BOOLEAN.test(value)) fail(`${name} is not a canonical boolean`);
  }
  if (deployWorker !== 'true' && deployPages !== 'true') {
    fail('select at least one deployment target');
  }
  if (confirmProduction !== 'AIRTRUST_PRODUCTION') fail('production confirmation mismatch');
  const normalizedReason = String(reason || '').trim();
  if (
    normalizedReason.length < 10 ||
    normalizedReason.length > 500 ||
    CONTROL.test(normalizedReason)
  ) {
    fail('reason must contain 10-500 printable characters');
  }
  if (expectedSha) {
    if (!SHA.test(expectedSha)) fail('expected_sha is invalid');
    if (expectedSha !== sha) fail('expected_sha does not match github sha');
  }
  if (runMigrations !== 'false') {
    fail('LEGACY_MIGRATION_RUNNER_DISABLED_USE_SCHEMA_V2');
  }

  return {
    deployWorker: deployWorker === 'true',
    deployPages: deployPages === 'true',
    reason: normalizedReason,
    sha,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const result = validateProductionDeployDispatch({
    ref: process.env.EVENT_REF || '',
    sha: process.env.EVENT_SHA || '',
    deployWorker: process.env.DISPATCH_DEPLOY_WORKER || '',
    deployPages: process.env.DISPATCH_DEPLOY_PAGES || '',
    runMigrations: process.env.DISPATCH_RUN_MIGRATIONS || '',
    expectedSha: process.env.DISPATCH_EXPECTED_SHA || '',
    reason: process.env.DISPATCH_REASON || '',
    confirmProduction: process.env.DISPATCH_CONFIRM_PRODUCTION || '',
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
