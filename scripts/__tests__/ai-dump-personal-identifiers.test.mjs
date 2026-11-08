import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidCpf } from '../pii-delta-lib.mjs';

// P12-01: regression for the historical source inventory, without
// embedding any identifying number or using personal fixtures.
test('historical workflow inventory contains no CPF-like valid literals', () => {
  const text = readFileSync(
    resolve(process.cwd(), 'perplexity_airtrust_sources/07_WORKFLOWS_AND_AUTOMATIONS.md'),
    'utf8',
  );
  const candidates = text.match(/\b\d{3}[.-]?\d{3}[.-]?\d{3}[-.]?\d{2}\b/g) || [];
  assert.equal(candidates.filter(isValidCpf).length, 0);
  assert.match(text, /Arquivo histórico omitido por proteção de dados/);
  assert.match(text, /## FILE: scripts\/backfill-analitico-placeholder\.sql/);
});
