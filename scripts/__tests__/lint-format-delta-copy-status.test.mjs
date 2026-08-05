// source_reference: regression coverage for exact-copy handling in the delta lint gate.
// operational_decision: a C100 compatibility extraction carries no new lines and
// may retain the documented legacy lint baseline; modified copies stay in scope.
// dry_run_required: pure parser test; no repository mutation.
// rollback_plan_required: test-only file; no runtime or data effect.

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChangedFileStatus } from '../guard-lint-format-delta.mjs';

test('excludes only C100 exact copies from whole-file lint', () => {
  const parsed = parseChangedFileStatus(
    [
      'C100',
      'worker-airtrust/src/routes/lms-cursos.ts',
      'worker-airtrust/src/routes/lms-cursos-legacy.ts',
      'M',
      'worker-airtrust/src/routes/lms-cursos.ts',
      '',
    ].join('\0'),
  );

  assert.deepEqual(parsed.files, ['worker-airtrust/src/routes/lms-cursos.ts']);
  assert.deepEqual(parsed.exactCopies, [
    {
      source: 'worker-airtrust/src/routes/lms-cursos.ts',
      destination: 'worker-airtrust/src/routes/lms-cursos-legacy.ts',
    },
  ]);
});

test('keeps modified copies and renames in lint scope', () => {
  const parsed = parseChangedFileStatus(
    ['C098', 'src/old.ts', 'src/copied.ts', 'R100', 'src/before.ts', 'src/after.ts', ''].join('\0'),
  );

  assert.deepEqual(parsed.files, ['src/copied.ts', 'src/after.ts']);
  assert.deepEqual(parsed.exactCopies, []);
});
