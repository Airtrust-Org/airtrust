#!/usr/bin/env node
/**
 * Guard: remote staging must never be publishable as "dev-local".
 * Verifies wrangler.toml staging placeholders and the safe deploy script.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

const wrangler = readFileSync(join(ROOT, 'worker-airtrust/wrangler.toml'), 'utf8');
const stagingVars = wrangler.match(/\[env\.staging\.vars\][\s\S]*?(?=\n\[|\n\[\[|$)/)?.[0] ?? '';
if (!stagingVars.includes('APP_VERSION = "managed-by-script"')) {
  fail('[env.staging.vars] must declare APP_VERSION = "managed-by-script"');
}
if (!stagingVars.includes('APP_BUILD_TIME = "managed-by-script"')) {
  fail('[env.staging.vars] must declare APP_BUILD_TIME = "managed-by-script"');
}
if (!wrangler.includes('bf9963f4-eb12-439b-a830-20bbf577ac22')) {
  fail('staging D1 id missing from wrangler.toml');
}

const safeDeploy = readFileSync(join(ROOT, 'scripts/deploy-staging-worker-safe.sh'), 'utf8');
for (const token of [
  'APP_VERSION',
  'dev-local',
  'wrangler deploy --env staging',
  'VERSION_ENDPOINT',
  'bf9963f4-eb12-439b-a830-20bbf577ac22',
]) {
  if (!safeDeploy.includes(token)) {
    fail(`deploy-staging-worker-safe.sh missing required token: ${token}`);
  }
}
if (!safeDeploy.includes('No migrations') && !safeDeploy.includes('no migrations')) {
  fail('deploy-staging-worker-safe.sh must document no-migrations posture');
}

const legacy = readFileSync(join(ROOT, 'scripts/deploy-staging.sh'), 'utf8');
if (!legacy.includes('BLOCKED') || legacy.includes('npx wrangler deploy --env staging')) {
  fail('legacy deploy-staging.sh must remain blocked and must not call wrangler deploy');
}

const systemRoutes = readFileSync(join(ROOT, 'worker-airtrust/src/services/release-metadata.ts'), 'utf8');
if (!systemRoutes.includes("version = 'unversioned-remote'") && !systemRoutes.includes('version = "unversioned-remote"')) {
  fail('getReleaseMetadata must return unversioned-remote for unstamped staging/production');
}
if (!systemRoutes.includes("version = 'dev-local'") && !systemRoutes.includes('version = "dev-local"')) {
  fail('getReleaseMetadata must still allow dev-local for local/development');
}

if (failures.length > 0) {
  console.error('guard:staging-version-stamp FAILED');
  for (const item of failures) console.error(` - ${item}`);
  process.exit(1);
}

console.log('OK: guard:staging-version-stamp');
