import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGET } from './lms-terrenos-r32-direct-release.mjs';

test('operational direct replacement is pinned to one tenant/course/enrollment', () => {
  assert.deepEqual(TARGET, { empresaId: 6, cursoId: 9, matriculaId: 1215 });
  assert.equal(Object.isFrozen(TARGET), true);
});
