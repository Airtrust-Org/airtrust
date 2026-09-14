// source_reference: staging simulator-planning QA governance (#648)
// operational_decision: tests only; no database target or remote mutation.
// dry_run_required: not applicable; static source assertions only.
// rollback_plan_required: not applicable; tests perform no writes.
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
  assert.match(source, /const resumedWithCae = await authFetch/);
  assert.match(source, /session_needs: persistedNeeds/);
  assert.match(source, /cae_availability: resumedWithCae\.json\.data\.cae_document/);
  assert.match(source, /reabertura final não preservou exatamente a dupla\/singleton comparada com CAE/);
  assert.match(source, /resumed_after_cae_before_compare: true/);
  assert.match(source, /final_pairing_persisted: true/);
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
  assert.match(workflow, /persisted draft resumed again before CAE comparison: PASS/);
  assert.match(workflow, /final reopened draft preserves compared pair\/single composition: PASS/);
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

test('staging simulator fixture treats planning policy as immutable baseline', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.doesNotMatch(seed, /INSERT INTO empresas_config/);
  assert.doesNotMatch(seed, /ON CONFLICT\(empresa_id\) DO UPDATE SET[\s\S]*planejamento_simulador_regra_quinzena/);
  assert.match(seed, /_qa_sim_planning_requires_config/);
  assert.match(seed, /planejamento_simulador_regra_quinzena = 'AMBAS'/);
});

test('staging simulator fixture never publishes or reuses an unrelated roster', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_requires_isolated_roster/);
  assert.match(seed, /id <> \$\{e\(QA_ROSTER_ID\)\}/);
  assert.doesNotMatch(seed, /UPDATE escalas_mensais\s+SET status = 'publicada'/);
  assert.match(seed, /em\.id = \$\{e\(QA_ROSTER_ID\)\}/);
  assert.match(seed, /em\.observacoes = \$\{e\(PLANNING_MARKER\)\}/);
});

test('staging simulator rollback fails closed if disposable QA artifacts remain active', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_rollback_guard/);
  assert.match(seed, /draft_count INTEGER NOT NULL CHECK \(draft_count = 0\)/);
  assert.match(seed, /allocation_count INTEGER NOT NULL CHECK \(allocation_count = 0\)/);
  assert.match(seed, /roster_count INTEGER NOT NULL CHECK \(roster_count = 0\)/);
  assert.match(seed, /model_version_count INTEGER NOT NULL CHECK \(model_version_count = 0\)/);
});

test('staging simulator workflow pre-cleans stale disposable fixture before provisioning', () => {
  const preClean = workflow.indexOf('Remove stale synthetic simulator-planning artifacts before provisioning');
  const provision = workflow.indexOf('Provision only synthetic simulator-planning data');
  assert.ok(preClean >= 0, 'workflow sem pre-clean de fixture antiga');
  assert.ok(provision > preClean, 'pre-clean precisa ocorrer antes do provisionamento');
  assert.match(workflow, /seed-qa-simulator-planning\.mjs --rollback --apply/);
});

test('staging simulator read-only audit surfaces disposable fixture residue', () => {
  const audit = readFileSync('scripts/staging/audit-simulator-matrix-baseline.mjs', 'utf8');
  assert.match(audit, /qaPlanningResidue/);
  assert.match(audit, /qa_planning_hygiene_clean/);
  assert.match(audit, /RUN_GOVERNED_PERSISTENCE_QA_WITH_FAIL_CLOSED_PRE_CLEAN/);
});


test('staging simulator fixture never adopts or deletes a foreign Charlie participant', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_requires_charlie_absent/);
  assert.match(seed, /f\.matricula = \${e\(PARTICIPANTE3_CODIGO\)}/);
  assert.doesNotMatch(seed, /UPDATE funcionarios\s+SET nome = 'QA Participante Charlie'/);
  assert.match(seed, /nome = 'QA Participante Charlie'/);
  assert.match(seed, /cargo = 'Participante QA'/);
  assert.match(seed, /alfa\.setor IS funcionarios\.setor/);
  assert.match(seed, /alfa\.setor_id IS funcionarios\.setor_id/);
});


test('staging simulator fixture rejects foreign reserved artifacts and cleanup is signature-gated', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_requires_reserved_signatures/);
  assert.match(seed, /qa-simulator-planning/);
  assert.match(seed, /QA Planejamento Persistente — Sessão 1/);
  assert.match(seed, /QA Simulador — Planejamento Persistente/);
  assert.match(seed, /COALESCE\(ea\.escala_id, ''\) = \$\{e\(QA_ROSTER_ID\)\}/);
  assert.match(seed, /COALESCE\(ea\.observacoes, ''\) = \$\{e\(PLANNING_MARKER\)\}/);
  assert.match(seed, /COALESCE\(ea\.created_by, ''\) = 'qa-simulator-planning'/);
  assert.match(seed, /titulo = 'QA Simulator Planning Roster'/);
  assert.match(seed, /modelo_aeronave = 'AW139'/);
  assert.match(seed, /dominio_codigo = 'OPERACOES'/);
  assert.match(seed, /cor = '#64748b'/);
  assert.match(seed, /COALESCE\(lms_integrada, 0\) = 0/);
});
