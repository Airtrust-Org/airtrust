import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('local production deploy aliases fail closed instead of invoking wrangler Pages directly', () => {
  const pkg = JSON.parse(read('package.json'));
  const scripts = pkg.scripts ?? {};
  assert.equal(scripts['deploy:pages'], 'bash scripts/deploy-pages-only.sh');
  assert.equal(scripts.deploy, 'bash scripts/build-and-deploy.sh');
  assert.equal(scripts['deploy:worker'], 'bash scripts/deploy-worker-only.sh');
  for (const name of ['deploy', 'deploy:pages', 'deploy:worker', 'deploy:worker:only', 'deploy:all']) {
    assert.doesNotMatch(String(scripts[name] ?? ''), /wrangler\s+pages\s+deploy|wrangler\s+deploy\s+--env\s+production/);
  }
});

test('Pages local compatibility entrypoint is fail closed', () => {
  const stub = read('scripts/deploy-pages-only.sh');
  assert.match(stub, /LOCAL_PRODUCTION_PAGES_DEPLOY_DISABLED_USE_GITHUB_ACTIONS/);
  assert.match(stub, /deploy-airtrust\.yml/);
  assert.match(stub, /exit 1/);
});

test('ops guard blocks direct local Pages deploys outside staging-only tooling', () => {
  const guard = read('scripts/audit-dangerous-ops.sh');
  assert.match(guard, /local_pages_deploy_hits=/);
  assert.match(guard, /!scripts\/staging\/\*\*/);
  assert.match(guard, /direct local Pages deploy found outside staging-only tooling/);
});
