import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findOperationalSqlViolations,
  parseNameStatus,
} from '../check-operational-sql-sources.mjs';

test('skips only exact R100 renames while keeping modified renames and copies in scope', () => {
  const parsed = parseNameStatus(
    [
      'R100',
      'worker-airtrust/migrations/0001_old.sql',
      'scripts/rollback/0001_old.sql',
      'R099',
      'worker-airtrust/migrations/0002_old.sql',
      'scripts/rollback/0002_old.sql',
      'C100',
      'worker-airtrust/migrations/0003_source.sql',
      'scripts/manual/0003_copy.sql',
      'A',
      'scripts/manual/0004_added.sql',
      '',
    ].join('\0'),
  );

  assert.deepEqual(parsed.exactRenames, ['scripts/rollback/0001_old.sql']);
  assert.deepEqual(parsed.candidates, [
    'scripts/rollback/0002_old.sql',
    'scripts/manual/0003_copy.sql',
    'scripts/manual/0004_added.sql',
  ]);
});

test('continues to reject changed DML without an operational source marker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-sql-guard-'));
  try {
    const relative = 'scripts/manual/0001_changed.sql';
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, 'DELETE FROM example;\n');

    const violations = findOperationalSqlViolations({ root, files: [relative] });
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, relative);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts changed DML carrying a reviewed operational marker', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-sql-guard-'));
  try {
    const relative = 'scripts/manual/0001_reviewed.sql';
    const fullPath = path.join(root, relative);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, '-- source_reference: reviewed input\nDELETE FROM example;\n');

    assert.deepEqual(findOperationalSqlViolations({ root, files: [relative] }), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
