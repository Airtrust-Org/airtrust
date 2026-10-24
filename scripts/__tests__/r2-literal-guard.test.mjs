import assert from 'node:assert/strict';
import test from 'node:test';
import { findR2LiteralAssignment } from '../r2-literal-guard.mjs';

const keyId = ['R2', 'ACCESS_KEY_ID'].join('_');
const secretKey = ['R2', 'SECRET_ACCESS_KEY'].join('_');
const accountId = ['R2', 'ACCOUNT_ID'].join('_');
const syntheticKey = 'b'.repeat(32);
const syntheticSecret = 'c'.repeat(64);
const record = (path, line, content) => path + '\x00' + line + '\x00' + content;

test('detects R2 key material in .env, quoted TOML, YAML, JSON, and Markdown', () => {
  const cases = [
    record('config.env', 1, keyId + '=' + syntheticKey),
    record('worker.toml', 2, secretKey + ' = "' + syntheticSecret + '"'),
    record('config.yaml', 3, secretKey + ': "' + syntheticSecret + '"'),
    record('config.json', 4, '{"' + accountId + '": "' + syntheticKey + '"}'),
    record('docs.md', 5, '| ' + keyId + ' = ' + syntheticKey + ' |'),
    record('ops.md', 6, '  ' + secretKey + ' = ' + syntheticSecret),
    record('other.yaml', 7, keyId + ': ' + syntheticKey + ' # YOUR_' + keyId),
  ];
  for (const [i, line] of cases.entries()) {
    const finding = findR2LiteralAssignment(line);
    assert.ok(finding, 'expected rejection for synthetic credential-shaped assignment');
    assert.equal(finding.line, i + 1);
    assert.equal(JSON.stringify(finding).includes(syntheticKey), false);
    assert.equal(JSON.stringify(finding).includes(syntheticSecret), false);
  }
});

test('allows only exact, context-local placeholders', () => {
  for (const key of [keyId, secretKey, accountId]) {
    for (const prefix of ['YOUR_', 'EXAMPLE_', 'PLACEHOLDER_']) {
      assert.equal(findR2LiteralAssignment(record('template.md', 10, key + ' = ' + prefix + key)), null);
    }
  }
});

test('does not allow placeholder elsewhere to mask a credential-shaped value', () => {
  assert.ok(findR2LiteralAssignment(record('docs.md', 31, secretKey + ': "' + syntheticSecret + '" # YOUR_' + secretKey)));
  assert.ok(findR2LiteralAssignment(record('docs.md', 32, 'YOUR_' + secretKey + '=' + syntheticSecret + '; ' + keyId + '=' + syntheticKey)));
});

test('ignores dynamic references, descriptions, and short values', () => {
  const cases = [
    'const field = "' + keyId + '";',
    keyId + ': ' + String.fromCharCode(36) + '{{ secrets.R2_ACCESS_KEY_ID }}',
    'See ' + secretKey + ' for setup',
    secretKey + '=your-short-value',
    secretKey + ': <TOKEN>',
    keyId + '=',
  ];
  cases.forEach((line, i) => assert.equal(findR2LiteralAssignment(record('notes.md', i + 1, line)), null));
});

test('timestamp colons before and after secrets never alter path, line, or redactability', () => {
  const stamp = '"timestamp":"2026-10-24T22:43:46Z"';
  const credential = '"' + secretKey + '":"' + syntheticSecret + '"';
  for (const content of ['{' + stamp + ',' + credential + '}', '{' + credential + ',' + stamp + '}', '{' + credential + ',' + stamp + ',' + credential + '}']) {
    const finding = findR2LiteralAssignment(record('docs:legacy/credentials.json', 123, content));
    assert.deepEqual(finding, { path: 'docs:legacy/credentials.json', line: 123, field: secretKey });
    assert.equal(JSON.stringify(finding).includes(syntheticSecret), false);
  }
});

test('invalid or ambiguous git grep framing fails closed without printing candidate', () => {
  assert.throws(
    () => findR2LiteralAssignment('notes:12:' + secretKey + '=' + syntheticSecret),
    (error) => error.message === 'R2_GREP_FRAMING_INVALID' && !error.message.includes(syntheticSecret),
  );
});

test('structured findings expose no secret bytes', () => {
  const f = findR2LiteralAssignment(record('docs/legacy:export.md', 123, '"' + secretKey + '": "' + syntheticSecret + '"'));
  assert.deepEqual(f, { path: 'docs/legacy:export.md', line: 123, field: secretKey });
  assert.equal('value' in f, false);
});
