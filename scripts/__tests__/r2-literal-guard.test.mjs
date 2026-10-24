import assert from 'node:assert/strict';
import test from 'node:test';
import { findR2LiteralAssignment } from '../r2-literal-guard.mjs';

const keyId = ['R2', 'ACCESS_KEY_ID'].join('_');
const secretKey = ['R2', 'SECRET_ACCESS_KEY'].join('_');
const accountId = ['R2', 'ACCOUNT_ID'].join('_');
const syntheticKey = 'b'.repeat(32);
const syntheticSecret = 'c'.repeat(64);

test('detects R2 key material in .env, quoted TOML, YAML, JSON, and Markdown', () => {
  const cases = [
    'config.env:1:' + keyId + '=' + syntheticKey,
    'worker.toml:2:' + secretKey + ' = "' + syntheticSecret + '"',
    'config.yaml:3:' + secretKey + ': "' + syntheticSecret + '"',
    'config.json:4:{"' + accountId + '": "' + syntheticKey + '"}',
    'docs.md:5:| ' + keyId + ' = ' + syntheticKey + ' |',
    'ops.md:6:  ' + secretKey + ' = ' + syntheticSecret,
    'other.yaml:7:' + keyId + ': ' + syntheticKey + ' # YOUR_' + keyId,
  ];
  for (const line of cases) {
    const finding = findR2LiteralAssignment(line);
    assert.ok(finding, 'expected rejection for synthetic credential-shaped assignment');
    assert.equal(finding.line, Number(line.match(/:(\d+):/)[1]));
    assert.equal(JSON.stringify(finding).includes(syntheticKey), false);
    assert.equal(JSON.stringify(finding).includes(syntheticSecret), false);
  }
});

test('allows only exact, context-local placeholders', () => {
  for (const key of [keyId, secretKey, accountId]) {
    for (const prefix of ['YOUR_', 'EXAMPLE_', 'PLACEHOLDER_']) {
      const line = 'template.md:10:' + key + ' = ' + prefix + key;
      assert.equal(findR2LiteralAssignment(line), null);
    }
  }
});

test('does not allow placeholder appearing elsewhere to mask a live-looking value', () => {
  assert.ok(findR2LiteralAssignment('docs.md:31:' + secretKey + ': "' + syntheticSecret + '" # YOUR_' + secretKey));
  assert.ok(findR2LiteralAssignment('docs.md:32:YOUR_' + secretKey + '=' + syntheticSecret + '; ' + keyId + '=' + syntheticKey));
});

test('does not mistake dynamic references, documentation mentions, or short values for secrets', () => {
  const cases = [
    'src.ts:4:const field = "' + keyId + '";',
    'config.yml:5:' + keyId + ': ' + String.fromCharCode(36) + '{{ secrets.R2_ACCESS_KEY_ID }}',
    'docs.md:6:See ' + secretKey + ' for setup',
    'config.env:7:' + secretKey + '=your-short-value',
    'docs.md:8:' + secretKey + ': <TOKEN>',
    'example.txt:9:' + keyId + '=',
  ];
  cases.forEach((line) => assert.equal(findR2LiteralAssignment(line), null));
});

test('structured finding exposes no secret bytes and parses paths with colons', () => {
  const f = findR2LiteralAssignment('docs/legacy:export.md:123:"' + secretKey + '": "' + syntheticSecret + '"');
  assert.deepEqual(f, { path: 'docs/legacy:export.md', line: 123, field: secretKey });
  assert.equal('value' in f, false);
});
