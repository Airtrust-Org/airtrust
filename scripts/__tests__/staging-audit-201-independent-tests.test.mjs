import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('audit-201 does not cascade one route failure into unrelated residual cases', () => {
  const source = fs.readFileSync('e2e/staging-audit-201.spec.ts', 'utf8');
  assert.doesNotMatch(source, /test\.describe\.configure\(\{\s*mode:\s*['"]serial['"]/);
  assert.match(source, /representative migrated routes have no horizontal overflow at 375px/);
  assert.match(source, /Pasta 360 opens from the canonical employee journey/);
});
