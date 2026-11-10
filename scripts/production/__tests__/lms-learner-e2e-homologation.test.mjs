import test from 'node:test';
import assert from 'node:assert/strict';

test('lms-learner-e2e-homologation module loads and exports runHomologation', async () => {
  const mod = await import('../lms-learner-e2e-homologation.mjs');
  assert.equal(typeof mod.runHomologation, 'function');
});
