import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { findRouteOwnershipViolations } from '../guard-route-ownership.mjs';

test('does not flag the current Worker as having undocumented terminal collisions', () => {
  assert.deepEqual(findRouteOwnershipViolations(), []);
});

test('documents shared prefix mounts instead of treating them as duplicates', () => {
  const source = readFileSync('scripts/guard-route-ownership.mjs', 'utf8');
  assert.match(source, /\/api\/frms/);
  assert.match(source, /LEGACY_ALLOWED_PREFIX_MOUNTS/);
  assert.match(source, /terminal/);
});
