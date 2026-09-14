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


test('staging simulator fixture reactivates only its exact soft-deleted Charlie identity', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_requires_charlie_signature/);
  assert.match(seed, /f\.matricula = \${e\(PARTICIPANTE3_CODIGO\)}/);
  assert.match(seed, /SELECT COUNT\(\*\)[\s\S]*PARTICIPANTE3_CODIGO[\s\S]*\) <= 1/);
  assert.match(seed, /UPDATE funcionarios\s+SET deleted_at = NULL,[\s\S]*matricula = \${e\(PARTICIPANTE3_CODIGO\)}/);
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

test('staging simulator history cleanup is signature-gated and never marker-only', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /_qa_sim_planning_requires_history_signatures/);
  assert.match(seed, /UPPER\(COALESCE\(qh\.qualificacao_codigo, ''\)\) = UPPER\(\$\{e\(PLANNING_QUAL_CODE\)\}\)/);
  assert.match(seed, /f\.matricula IN \(\$\{e\(PARTICIPANTE1_CODIGO\)\}, \$\{e\(PARTICIPANTE2_CODIGO\)\}, \$\{e\(PARTICIPANTE3_CODIGO\)\}\)/);
  assert.match(seed, /UPDATE qualificacoes_historico[\s\S]*qualificacao_id = \([\s\S]*PLANNING_QUAL_CODE[\s\S]*funcionario_id IN \(/);
  assert.doesNotMatch(seed, /UPDATE qualificacoes_historico[\s\S]{0,220}observacoes = \$\{e\(PLANNING_MARKER\)\};/);
});


test('staging simulator seed rejects divergent soft-deleted reserved history before reactivation', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  const reservedGuardStart = seed.indexOf('_qa_sim_planning_requires_reserved_signatures');
  const configGuardStart = seed.indexOf('_qa_sim_planning_requires_config');
  assert.ok(reservedGuardStart >= 0 && configGuardStart > reservedGuardStart);
  const reservedGuard = seed.slice(reservedGuardStart, configGuardStart);
  assert.match(reservedGuard, /qh\.observacoes = \$\{e\(PLANNING_MARKER\)\}/);
  assert.doesNotMatch(reservedGuard, /qh\.deleted_at IS NULL/);
  assert.match(reservedGuard, /UPPER\(COALESCE\(qh\.qualificacao_codigo, ''\)\) = UPPER\(\$\{e\(PLANNING_QUAL_CODE\)\}\)/);
  assert.doesNotMatch(reservedGuard, /f\.deleted_at IS NULL/);
  assert.doesNotMatch(reservedGuard, /qt\.deleted_at IS NULL/);
});


test('staging simulator seed rejects foreign reserved model-version rows before normalization', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  const reservedGuardStart = seed.indexOf('_qa_sim_planning_requires_reserved_signatures');
  const configGuardStart = seed.indexOf('_qa_sim_planning_requires_config');
  assert.ok(reservedGuardStart >= 0 && configGuardStart > reservedGuardStart);
  const reservedGuard = seed.slice(reservedGuardStart, configGuardStart);
  assert.match(reservedGuard, /FROM modelos_sessao_versionamento msv/);
  assert.match(reservedGuard, /msv\.codigo_canonico = \$\{e\(PLANNING_MODEL_CODE\)\}/);
  assert.match(reservedGuard, /msv\.versao_matriz = 'QA_SIMULATOR_PLANNING'/);
  assert.match(reservedGuard, /msv\.versao_numero = 1/);
  assert.match(reservedGuard, /msv\.is_current = 1/);
  assert.match(reservedGuard, /msv\.modelo_anterior_id IS NULL/);
  assert.match(reservedGuard, /msv\.efetivo_ate IS NULL/);
});


test('staging simulator fixture uses canonical funcionario role columns', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /is_instrutor, is_checador, is_examinador/);
  assert.match(seed, /COALESCE\(is_instrutor, 0\) = 0/);
  assert.match(seed, /COALESCE\(is_checador, 0\) = 0/);
  assert.match(seed, /COALESCE\(is_examinador, 0\) = 0/);
  assert.doesNotMatch(seed, /instrutor_simulador|checador_simulador/);
});

test('staging simulator fixture avoids D1 remote file-import reset path', () => {
  const seed = readFileSync('scripts/staging/seed-qa-simulator-planning.mjs', 'utf8');
  assert.match(seed, /'--remote', '--command', sql, '--json'/);
  assert.doesNotMatch(seed, /'--remote', '--file'/);
  assert.doesNotMatch(seed, /mkdtempSync|writeFileSync|rmSync/);
});


test('staging simulator QA gates schema compatibility before any D1 mutation', () => {
  const workflow = readFileSync('.github/workflows/staging-simulator-planning-persistence-qa.yml', 'utf8');
  const schemaGate = workflow.indexOf('Require simulator-planning fixture schema compatibility (read-only)');
  const firstMutation = workflow.indexOf('Remove stale synthetic simulator-planning artifacts before provisioning');
  assert.ok(schemaGate >= 0 && firstMutation > schemaGate);
  const preflight = readFileSync('scripts/staging/preflight-simulator-planning-schema.mjs', 'utf8');
  assert.match(preflight, /PRAGMA table_info/);
  assert.match(preflight, /is_instrutor/);
  assert.match(preflight, /is_checador/);
  assert.match(preflight, /is_examinador/);
  assert.match(preflight, /planejamento_snapshot_json/);
  assert.doesNotMatch(preflight, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b[^\n]*FROM/i);
});

test('staging simulator QA checks semantic fixture ownership before any D1 mutation', () => {
  const workflow = readFileSync('.github/workflows/staging-simulator-planning-persistence-qa.yml', 'utf8');
  const semanticGate = workflow.indexOf('Require simulator-planning fixture ownership preconditions (read-only)');
  const firstMutation = workflow.indexOf('Remove stale synthetic simulator-planning artifacts before provisioning');
  assert.ok(semanticGate >= 0 && firstMutation > semanticGate);
  const preflight = readFileSync('scripts/staging/preflight-simulator-planning-fixture.mjs', 'utf8');
  assert.match(preflight, /READ_ONLY_FIXTURE_PREFLIGHT/);
  assert.match(preflight, /fixture_preconditions_compatible/);
  assert.match(preflight, /history_divergent/);
  assert.match(preflight, /charlie_divergent/);
  assert.doesNotMatch(preflight, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/);
});
