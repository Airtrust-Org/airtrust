import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/staging-0438-legacy-validation.yml'), 'utf8');
const physical = readFileSync(resolve(root, 'scripts/staging/validate-0438-legacy-physical-state.sh'), 'utf8');
const tenant = readFileSync(resolve(root, 'scripts/staging/validate-0438-e2e-tenant-records.mjs'), 'utf8');

const forbiddenRemoteMutation = /\b(?:INSERT\s+INTO|UPDATE\s+[A-Za-z_]|DELETE\s+FROM|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE)\b/i;

test('0438 legacy workflow is staging-only and never reconciles schema ledgers', () => {
  assert.match(workflow, /AIRTRUST_STAGING_0438_LEGACY_VALIDATION/);
  assert.match(workflow, /airtrust-db-staging-baseline-20260701/);
  assert.match(workflow, /Require staging Worker provenance to match frozen SHA/);
  assert.match(workflow, /Schema V2 staging ledger reconciliation: intentionally NOT performed/);
  assert.doesNotMatch(workflow, /apply-schema-change-v2\.yml/);
  assert.doesNotMatch(workflow, /AIRTRUST_PRODUCTION/);
  assert.doesNotMatch(workflow, /apply_change/);
  assert.doesNotMatch(workflow, /build-0438-dual-ledger-apply/);
});

test('legacy physical validator requires exact historical divergence without writing', () => {
  assert.match(physical, /d1-ledger" 1/);
  assert.match(physical, /schema-v2-ledger-intentionally-absent" 0/);
  assert.match(physical, /active-baseline" 1/);
  assert.match(physical, /active-stage-duplicate-groups" 0/);
  assert.match(physical, /RDV_0438_SCHEMA_V2_LEDGER_RECONCILED=NO/);
  assert.doesNotMatch(physical, /--apply/);
  assert.doesNotMatch(physical, forbiddenRemoteMutation);
});

test('functional validation reuses full lifecycle, checks tenant records, and always cleans fixtures', () => {
  for (const operation of [
    'enviar_rdv',
    'iniciar_revisao',
    'devolver_rdv',
    'reenviar_rdv',
    'aprovar_rdv',
    'finalizar_rdv',
    'tenant_b_nao_acessa_rdv_tenant_a',
    'tenant_b_nao_acessa_abastecimentos_tenant_a',
  ]) {
    assert.match(workflow, new RegExp(operation));
  }
  assert.match(workflow, /validate-0438-e2e-tenant-records\.mjs/);
  assert.match(workflow, /cleanup-controle-voos-e2e-fixtures\.mjs/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /rdv-0438-legacy-functional-evidence/);
  assert.doesNotMatch(tenant, /--apply/);
  assert.doesNotMatch(tenant, forbiddenRemoteMutation);
});

test('E2E CAS contract enforces version on corrigir_apos_devolucao and bumps rdvVersao', () => {
  const e2eScript = readFileSync(resolve(root, 'scripts/staging/run-controle-voos-e2e.mjs'), 'utf8');

  // Verify operation corrigir_apos_devolucao sends versao: rdvVersao
  const match = e2eScript.match(/operation:\s*'corrigir_apos_devolucao'[\s\S]*?body:\s*\{([\s\S]*?)\}/);
  assert.ok(match, 'corrigir_apos_devolucao operation must exist');
  assert.match(match[1], /versao:\s*rdvVersao/, 'corrigir_apos_devolucao body must include versao: rdvVersao');
  assert.match(match[1], /ocorrencias:/, 'corrigir_apos_devolucao body must include ocorrencias');

  // Verify version is bumped after corrigir_apos_devolucao
  const afterCall = e2eScript.slice(
    e2eScript.indexOf("operation: 'corrigir_apos_devolucao'"),
    e2eScript.indexOf("operation: 'refinalizar_preenchimento_rdv'"),
  );
  assert.match(afterCall, /rdvVersao\s*\+=\s*1/, 'rdvVersao must be incremented after corrigir_apos_devolucao');

  // Verify no stale comments claiming PUT RDV does not accept versao or does not bump version
  assert.doesNotMatch(e2eScript, /PUT \/voos\/:id\/rdv nao aceita `versao`/);
  assert.doesNotMatch(e2eScript, /rdvVersao NAO muda aqui/);
});

test('fixture cleanup script is fail closed, handles FKs child-first, and never touches production', () => {
  const cleanupScript = readFileSync(resolve(root, 'scripts/staging/cleanup-controle-voos-e2e-fixtures.mjs'), 'utf8');

  // D1 error is NOT swallowed
  assert.doesNotMatch(cleanupScript, /AVISO: comando falhou \(continuando cleanup\)/, 'D1 errors must not be swallowed');
  assert.match(cleanupScript, /throw new Error\(`D1 execute falhou \[/, 'failed D1 execute must throw with statement label');

  // Manifest is deleted only after all deletes and verification succeed
  assert.match(cleanupScript, /CLEANUP_POSTCONDITION_FAILED/);
  const deleteLoopIdx = cleanupScript.indexOf('for (const [label, sql] of statements)');
  const verifyIdx = cleanupScript.indexOf('CLEANUP_POSTCONDITION_FAILED');
  const rmManifestIdx = cleanupScript.indexOf('rmSync(dirname(manifestPath)');
  assert.ok(deleteLoopIdx > 0 && verifyIdx > deleteLoopIdx && rmManifestIdx > verifyIdx, 'manifest removal must happen strictly after delete loop and verification');

  // Safety & FK governance
  assert.doesNotMatch(cleanupScript, /foreign_keys\s*=\s*OFF/i, 'PRAGMA foreign_keys=OFF is forbidden');
  assert.match(cleanupScript, /ALLOWED_D1_NAME = 'airtrust-db-staging-baseline-20260701'/);
  assert.match(cleanupScript, /\/prod\|production\/i/, 'must reject production DB targets');

  // Ordering of deletes:
  const refreshTokensIdx = cleanupScript.indexOf("'refresh_tokens'");
  const usuariosIdx = cleanupScript.indexOf("'usuarios'");
  const usuariosEmpresasIdx = cleanupScript.indexOf("'usuarios_empresas'");
  const funcionariosIdx = cleanupScript.indexOf("'funcionarios'");
  const setoresIdx = cleanupScript.indexOf("'setores'");
  const empresasIdx = cleanupScript.indexOf("'empresas'");
  const cvVoosIdx = cleanupScript.indexOf("'cv_voos'");
  const cvEtapasIdx = cleanupScript.indexOf("'cv_voo_etapas'");

  assert.ok(refreshTokensIdx > 0, 'refresh_tokens must be cleaned');
  assert.ok(usuariosIdx > 0, 'usuarios must be cleaned');
  assert.ok(refreshTokensIdx < usuariosIdx, 'refresh_tokens must be deleted before usuarios to avoid FK error');
  assert.ok(usuariosEmpresasIdx < usuariosIdx, 'usuarios_empresas must be deleted before usuarios');
  assert.ok(usuariosIdx < funcionariosIdx, 'usuarios must be deleted before funcionarios because usuarios.funcionario_id references funcionarios');
  assert.ok(funcionariosIdx < setoresIdx, 'funcionarios must be deleted before setores because funcionarios.setor_id references setores');
  assert.ok(setoresIdx < empresasIdx, 'setores must be deleted before empresas');
  assert.ok(cvEtapasIdx < cvVoosIdx, 'cv_voo_etapas must be deleted before cv_voos');

  // Ensure scoped deletions: no generic deletions by name
  assert.doesNotMatch(cleanupScript, /LIKE '%Teste%'/i);
  assert.doesNotMatch(cleanupScript, /LIKE '%Fixture%'/i);
});

test('cleanup script rejects invalid target and preserves manifest on failure', () => {
  const tmp = mkdtempSync(resolve(tmpdir(), 'cleanup-guard-test-'));
  const manifestFile = resolve(tmp, 'manifest.json');
  try {
    writeFileSync(manifestFile, JSON.stringify({
      runId: 'test1234',
      dbName: 'airtrust-db-production',
      empresaA: { id: 101 },
      empresaB: { id: 102 },
      users: { adminA: { id: 201 } },
    }));

    const result = spawnSync(process.execPath, [resolve(root, 'scripts/staging/cleanup-controle-voos-e2e-fixtures.mjs'), manifestFile, '--apply'], {
      encoding: 'utf8',
    });

    assert.notEqual(result.status, 0, 'must exit non-zero for disallowed database');
    assert.match(result.stderr, /D1 alvo nao permitido/);
    assert.ok(existsSync(manifestFile), 'manifest file must still exist after failure');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cleanup script preserves manifest on D1 command execution failure and exits non-zero', () => {
  const tmp = mkdtempSync(resolve(tmpdir(), 'cleanup-fail-test-'));
  const manifestFile = resolve(tmp, 'manifest.json');
  const binDir = resolve(tmp, 'bin');
  mkdirSync(binDir);

  const mockNpx = resolve(binDir, 'npx');
  writeFileSync(mockNpx, '#!/bin/sh\necho "Simulated D1 failure" >&2\nexit 1\n', { mode: 0o755 });

  try {
    writeFileSync(manifestFile, JSON.stringify({
      runId: 'test1234',
      dbName: 'airtrust-db-staging-baseline-20260701',
      empresaA: { id: 101 },
      empresaB: { id: 102 },
      users: { adminA: { id: 201 } },
    }));

    const result = spawnSync(process.execPath, [resolve(root, 'scripts/staging/cleanup-controle-voos-e2e-fixtures.mjs'), manifestFile, '--apply'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.notEqual(result.status, 0, 'must exit non-zero when D1 command fails');
    assert.match(result.stderr, /D1 execute falhou/);
    assert.ok(existsSync(manifestFile), 'manifest file must be preserved when D1 execution fails');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('cleanup script removes manifest only when all delete statements and verification succeed', () => {
  const tmp = mkdtempSync(resolve(tmpdir(), 'cleanup-success-test-'));
  const manifestFile = resolve(tmp, 'manifest.json');
  const binDir = resolve(tmp, 'bin');
  mkdirSync(binDir);

  const mockNpx = resolve(binDir, 'npx');
  writeFileSync(
    mockNpx,
    '#!/bin/sh\necho \'[{"results":[{"empresas_restantes":0,"usuarios_restantes":0,"domain_events_restantes":0}]}]\'\nexit 0\n',
    { mode: 0o755 },
  );

  try {
    writeFileSync(manifestFile, JSON.stringify({
      runId: 'test1234',
      dbName: 'airtrust-db-staging-baseline-20260701',
      empresaA: { id: 101 },
      empresaB: { id: 102 },
      users: { adminA: { id: 201 } },
    }));

    const result = spawnSync(process.execPath, [resolve(root, 'scripts/staging/cleanup-controle-voos-e2e-fixtures.mjs'), manifestFile, '--apply'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH}` },
    });

    assert.equal(result.status, 0, `must exit 0 on complete success: ${result.stderr}`);
    assert.match(result.stderr, /Manifest removido/);
    assert.ok(!existsSync(manifestFile), 'manifest file must be removed when all deletes and verification pass');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
