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
  assert.match(source, /QA-PARTICIPANTE-CHARLIE/);
  assert.match(source, /reparear QA não preservou Charlie como singleton/);
  assert.match(source, /singleton_preserved_after_cae: true/);
  assert.match(source, /unmatched_crew_blocks \|\| 0\) === 1/);
  assert.match(source, /finalStatus === 'REPLANEJAR'/);
});

test('staging simulator QA uses the dedicated compare-cae endpoint without regenerating proposal', () => {
  assert.match(source, /\/api\/simuladores\/planejamento-v2\/comparar-cae/);
  assert.doesNotMatch(source, /generateProposal\(cae/i);
  assert.match(workflow, /Generate, persist, resume and reconcile CAE planning/);
});

test('staging simulator fixture provisions three needs so a pair and a singleton coexist', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /QA-PARTICIPANTE-CHARLIE/);
  assert.match(seed, /history_count = 3/);
  assert.match(seed, /allocation_count = 3/);
  assert.match(workflow, /explicit unmatched singleton preserved after CAE comparison: PASS/);
});

test('staging simulator QA always rolls back the synthetic planning fixture after evidence collection', () => {
  assert.match(workflow, /name: Staging D1 Cleanup Synthetic Simulator Planning Fixture/);
  assert.match(workflow, /if: always\(\) && needs\.d1-provision-simulator-planning-fixture\.result != 'skipped'/);
  assert.match(workflow, /seed-qa-simulator-planning\.mjs --rollback --apply/);
  assert.match(workflow, /CLEANUP: \$\{\{ needs\.d1-cleanup-simulator-planning-fixture\.result \}\}/);
  assert.match(workflow, /\[\[ "\$CLEANUP" == 'success' \]\]/);
});

test('staging simulator runtime QA does not mutate planning policy through the API', () => {
  assert.doesNotMatch(source, /planejamento-v2\/config/);
  assert.doesNotMatch(source, /roster_policy: 'AMBAS'/);
  assert.match(source, /generatedProposal\?\.config\?\.roster_policy === 'AMBAS'/);
  assert.match(source, /generatedProposal\?\.config\?\.planning_horizon_days/);
});


test('staging simulator planning QA never reapplies the canonical examiner base fixture', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.doesNotMatch(workflow, /seed-qa-examiner-training\.mjs --apply/);
  assert.match(seed, /f\.matricula IN \(\$\{e\(PARTICIPANTE1_CODIGO\)\}, \$\{e\(PARTICIPANTE2_CODIGO\)\}\)/);
  assert.match(seed, /\) = 2 THEN 1 ELSE 0/);
});
