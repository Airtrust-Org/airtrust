/**
 * FRMS BOA — release artifact guard: synthetic preview is emitted only for
 * the official staging Pages build. No remote network, writes or credentials.
 * source_reference: docs/frms/BOA_DEMO_INTERATIVA_OFFLINE_20261021.html
 * operational_decision: keep demo absent from production while a guarded
 * staging artifact can be reviewed without any D1 tenant.
 * dry_run_required: plugin emission is simulated in memory.
 * rollback_plan_required: no remote resources are touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const configFile = resolve(root, 'vite.config.ts');
const stagingApi = 'https://airtrust-api-staging.airtrust.workers.dev/api';
const stagingHost = 'https://airtrust-api-staging.airtrust.workers.dev';

async function emitForBuild(apiUrl, proxy) {
  const prevApi = process.env.VITE_API_URL;
  const prevProxy = process.env.VITE_DEV_PROXY_TARGET;
  try {
    process.env.VITE_API_URL = apiUrl;
    process.env.VITE_DEV_PROXY_TARGET = proxy;
    const loaded = await loadConfigFromFile(
      { command: 'build', mode: 'production' }, configFile, root,
    );
    assert.ok(loaded, 'Vite config must load');
    const plugin = loaded.config.plugins.find(p => p?.name === 'boa-synthetic-preview-staging-only');
    assert.ok(plugin, 'BOA preview plugin must remain in release build');
    const emitted = [];
    await plugin.generateBundle.call({
      emitFile(artifact) { emitted.push(artifact); },
      error(message) { throw new Error(String(message)); },
    }, {}, {});
    return emitted;
  } finally {
    if (prevApi === undefined) delete process.env.VITE_API_URL;
    else process.env.VITE_API_URL = prevApi;
    if (prevProxy === undefined) delete process.env.VITE_DEV_PROXY_TARGET;
    else process.env.VITE_DEV_PROXY_TARGET = prevProxy;
  }
}

test('official staging build emits only fictitious non-connected BOA preview', async () => {
  const assets = await emitForBuild(stagingApi, stagingHost);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].type, 'asset');
  assert.equal(assets[0].fileName, 'qa/boa-frms-demonstracao.html');
  assert.match(assets[0].source, /DEMO LOCAL • NÃO HOMOLOGADA/);
  assert.match(assets[0].source, /100% fictícios/);
  assert.doesNotMatch(assets[0].source, /https?:\/\//i);
});

test('production API build and mismatched staging proxy cannot publish BOA preview', async () => {
  assert.deepEqual(await emitForBuild('https://api.airtrust.online/api', stagingHost), []);
  assert.deepEqual(await emitForBuild(stagingApi, 'https://api.airtrust.online'), []);
});
