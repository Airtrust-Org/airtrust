import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALLOWED_TARGETS,
  BackfillRefusedError,
  assertConfirmation,
  assertReleaseSha,
  buildSelectBatchSql,
  buildUpdateSql,
  classifyRows,
  generateCertificateValidationHashSync,
  resolveTarget,
  runBackfill,
} from '../backfill-certificado-validacao-hash-remote.mjs';

const VALID_SHA = 'a'.repeat(40);

test('resolves staging and production to their hardcoded D1 ids, never mixed', () => {
  const staging = resolveTarget('staging');
  const production = resolveTarget('production');
  assert.equal(staging.databaseName, 'airtrust-db-staging-baseline-20260701');
  assert.equal(staging.databaseId, 'bf9963f4-eb12-439b-a830-20bbf577ac22');
  assert.equal(production.databaseName, 'airtrust-db');
  assert.equal(production.databaseId, '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae');
  assert.notEqual(staging.databaseId, production.databaseId);
});

test('rejects any target other than the exact two allowlisted names', () => {
  assert.throws(() => resolveTarget('airtrust-db'), BackfillRefusedError);
  assert.throws(() => resolveTarget('bf9963f4-eb12-439b-a830-20bbf577ac22'), BackfillRefusedError);
  assert.throws(() => resolveTarget(''), BackfillRefusedError);
  assert.throws(() => resolveTarget(undefined), BackfillRefusedError);
});

test('requires a 40-hex-char release SHA', () => {
  assert.throws(() => assertReleaseSha(''), BackfillRefusedError);
  assert.throws(() => assertReleaseSha('deadbeef'), BackfillRefusedError);
  assert.throws(() => assertReleaseSha('g'.repeat(40)), BackfillRefusedError);
  assert.doesNotThrow(() => assertReleaseSha(VALID_SHA));
});

test('confirmation strings are distinct per target and cannot be swapped', () => {
  assert.notEqual(
    ALLOWED_TARGETS.staging.confirmPhrase,
    ALLOWED_TARGETS.production.confirmPhrase,
  );

  assert.throws(
    () =>
      assertConfirmation({
        targetName: 'staging',
        apply: true,
        confirm: ALLOWED_TARGETS.production.confirmPhrase,
      }),
    BackfillRefusedError,
  );
  assert.throws(
    () =>
      assertConfirmation({
        targetName: 'production',
        apply: true,
        confirm: ALLOWED_TARGETS.staging.confirmPhrase,
      }),
    BackfillRefusedError,
  );
  assert.doesNotThrow(() =>
    assertConfirmation({
      targetName: 'staging',
      apply: true,
      confirm: ALLOWED_TARGETS.staging.confirmPhrase,
    }),
  );
});

test('--apply without any confirm string is rejected', () => {
  assert.throws(
    () => assertConfirmation({ targetName: 'staging', apply: true, confirm: undefined }),
    BackfillRefusedError,
  );
});

test('dry-run (no apply) performs zero writes even with eligible rows', async () => {
  const calls = [];
  const rows = [
    {
      id: 1,
      empresa_id: 10,
      qualificacao_codigo: 'EAD-CRM',
      data_conclusao: '2026-08-01',
      numero_certificado: 'CERT-1',
      cpf: '12345678901',
      validacao_hash: null,
    },
  ];
  const execRemote = ({ sql }) => {
    calls.push(sql);
    return /SELECT/i.test(sql) && calls.length === 1 ? rows : [];
  };

  const result = await runBackfill({
    targetName: 'staging',
    releaseSha: VALID_SHA,
    apply: false,
    execRemote,
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.toUpdate, 1);
  assert.ok(calls.every((sql) => /^SELECT/i.test(sql.trim())), 'no UPDATE should ever be issued');
});

test('--apply without the correct confirm is rejected before any remote call', async () => {
  let called = false;
  const execRemote = () => {
    called = true;
    return [];
  };
  await assert.rejects(
    () =>
      runBackfill({
        targetName: 'staging',
        releaseSha: VALID_SHA,
        apply: true,
        confirm: 'WRONG',
        recoveryPointConfirmed: true,
        execRemote,
      }),
    BackfillRefusedError,
  );
  assert.equal(called, false);
});

test('--apply requires a confirmed recovery point precondition', async () => {
  await assert.rejects(
    () =>
      runBackfill({
        targetName: 'staging',
        releaseSha: VALID_SHA,
        apply: true,
        confirm: ALLOWED_TARGETS.staging.confirmPhrase,
        recoveryPointConfirmed: false,
        execRemote: () => [],
      }),
    BackfillRefusedError,
  );
});

test('updates are scoped by both id and empresa_id, never a bare id', () => {
  const sql = buildUpdateSql({ id: 42, empresaId: 7, hash: 'ABCDEF0123456789' });
  assert.match(sql, /WHERE id = 42/);
  assert.match(sql, /AND empresa_id = 7/);
  assert.throws(() => buildUpdateSql({ id: 1, empresaId: undefined, hash: 'X'.repeat(16) }));
});

test('select batch SQL scopes by empresa_id and cursors by id', () => {
  const sql = buildSelectBatchSql({ empresaId: 9, afterId: 100, limit: 250 });
  assert.match(sql, /h\.empresa_id = 9/);
  assert.match(sql, /h\.id > 100/);
  assert.match(sql, /LIMIT 250/);
});

test('a row missing required fields is classified incomplete and never hashed', () => {
  const { incomplete, toUpdate, alreadyHashed, collisions } = classifyRows([
    {
      id: 1,
      empresa_id: 1,
      qualificacao_codigo: '',
      data_conclusao: '2026-01-01',
      numero_certificado: 'CERT-1',
      cpf: '12345678901',
      validacao_hash: null,
    },
  ]);
  assert.equal(incomplete.length, 1);
  assert.equal(toUpdate.length, 0);
  assert.equal(alreadyHashed.length, 0);
  assert.equal(collisions.length, 0);
});

test('two rows that hash identically are detected as a collision and fail closed', async () => {
  const rowA = {
    id: 1,
    empresa_id: 1,
    qualificacao_codigo: 'EAD-CRM',
    data_conclusao: '2026-08-01',
    numero_certificado: 'CERT-DUP',
    cpf: '12345678901',
    validacao_hash: null,
  };
  const rowB = { ...rowA, id: 2 };

  const { collisions, toUpdate } = classifyRows([rowA, rowB]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].rows.length, 2);

  const calls = [];
  const execRemote = ({ sql }) => {
    calls.push(sql);
    return calls.length === 1 ? [rowA, rowB] : [];
  };
  const result = await runBackfill({
    targetName: 'staging',
    releaseSha: VALID_SHA,
    apply: true,
    confirm: ALLOWED_TARGETS.staging.confirmPhrase,
    recoveryPointConfirmed: true,
    execRemote,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'COLLISIONS_DETECTED');
  assert.ok(calls.every((sql) => /^SELECT/i.test(sql.trim())), 'no UPDATE issued when collisions found');
  assert.ok(toUpdate.length >= 0);
});

test('re-running the same batch twice is idempotent: already-hashed rows produce zero writes', async () => {
  const hash = generateCertificateValidationHashSync({
    funcionarioCpf: '12345678901',
    qualificacaoCodigo: 'EAD-CRM',
    dataConclusao: '2026-08-01',
    numeroCertificado: 'CERT-1',
  });
  const row = {
    id: 1,
    empresa_id: 1,
    qualificacao_codigo: 'EAD-CRM',
    data_conclusao: '2026-08-01',
    numero_certificado: 'CERT-1',
    cpf: '12345678901',
    validacao_hash: hash,
  };
  const updateCalls = [];
  let selectCalls = 0;
  const execRemote = ({ sql }) => {
    if (/^SELECT/i.test(sql.trim())) {
      selectCalls += 1;
      return selectCalls === 1 ? [row] : [];
    }
    updateCalls.push(sql);
    return [];
  };
  const result = await runBackfill({
    targetName: 'staging',
    releaseSha: VALID_SHA,
    apply: true,
    confirm: ALLOWED_TARGETS.staging.confirmPhrase,
    recoveryPointConfirmed: true,
    execRemote,
  });
  assert.equal(result.alreadyHashed, 1);
  assert.equal(result.toUpdate, 0);
  assert.equal(updateCalls.length, 0);
});

test('matches the canonical 16-hex uppercase token used by production code', () => {
  const hash = generateCertificateValidationHashSync({
    funcionarioCpf: '123.456.789-01',
    qualificacaoCodigo: 'EAD-CRM',
    dataConclusao: '2026-08-25T15:30:00Z',
    numeroCertificado: 'CERT-001',
  });
  assert.match(hash, /^[A-F0-9]{16}$/);
  assert.equal(
    generateCertificateValidationHashSync({
      funcionarioCpf: '12345678901',
      qualificacaoCodigo: 'EAD-CRM',
      dataConclusao: '2026-08-25',
      numeroCertificado: 'CERT-001',
    }),
    hash,
  );
});
