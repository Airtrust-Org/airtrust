import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const source = readFileSync('scripts/staging/smoke-simulator-planning-persistence.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/staging-simulator-planning-persistence-qa.yml', 'utf8');

test('staging simulator QA compares CAE against the persisted proposal pairing', () => {
  assert.match(source, /const pairingBeforeCae = pairingSignature\(pairingBlocks\)/);
  assert.match(source, /const pairingAfterCae = pairingSignature/);
  assert.match(source, /comparação CAE alterou as duplas\/singles da proposta/);
  assert.match(source, /pairing_preserved_after_cae: true/);
});

test('staging simulator QA uses the dedicated compare-cae endpoint without regenerating proposal', () => {
  assert.match(source, /\/api\/simuladores\/planejamento-v2\/comparar-cae/);
  assert.doesNotMatch(source, /generateProposal\(cae/i);
  assert.match(workflow, /Generate, persist, resume and reconcile CAE planning/);
});
