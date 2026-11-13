import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPtoRev10AtomicPostconditions } from '../lib/simuladores-pto-rev10-atomic-postconditions.mjs';

const sqliteAvailable = spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status === 0;
const tenant = 6;
const template = {
  empresa_id: tenant,
  versao_matriz: 'PTO-V18-CHECK',
  models: [{ codigo: 'A139-I-01/12' }],
  superseded_models: [],
  manobra_resolution: [{ codigo_canonico: 'TEST-001' }],
};

test('SQL de aceitação usa CHECK e segue dentro do BEGIN/COMMIT', () => {
  const sql = buildPtoRev10AtomicPostconditions(template);
  assert.match(sql, /CREATE TEMP TABLE __pto_rev10_atomic_check/);
  assert.match(sql, /CHECK\(ok=1\)/);
  assert.match(sql, /COUNT\(DISTINCT codigo_canonico\)/);
  assert.match(sql, /HAVING COUNT\(msm.id\)<>18/);
  assert.match(sql, /m.empresa_id<>6/);
});

test('rejeita tenant errado, modelo duplicado e ID legado inválido', () => {
  assert.throws(
    () => buildPtoRev10AtomicPostconditions({ ...template, empresa_id: 7 }),
    /parâmetros/,
  );
  assert.throws(
    () => buildPtoRev10AtomicPostconditions({
      ...template, models: [template.models[0], template.models[0]],
    }), /duplicados/,
  );
  assert.throws(
    () => buildPtoRev10AtomicPostconditions({
      ...template, superseded_models: [{ id: '1 OR 1=1' }],
    }), /IDs substituídos inválidos/,
  );
});

function runTransaction({ linkCount = 18, crossTenant = false }) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'pto-atomic-'));
  try {
    const db = path.join(directory, 'test.sqlite');
    const init = `
      CREATE TABLE modelos_sessao_versionamento (
        modelo_id INTEGER, empresa_id INTEGER, codigo_canonico TEXT, is_current INTEGER);
      CREATE TABLE modelos_sessao_manobras (
        id INTEGER, modelo_id INTEGER, deleted_at TEXT);
      CREATE TABLE modelos_sessao (
        id INTEGER, empresa_id INTEGER, ativo INTEGER, deleted_at TEXT);
      CREATE TABLE simuladores_matriz_manobra_resolution (
        empresa_id INTEGER, versao_matriz TEXT, manobra_id INTEGER);
      CREATE TABLE manobras (id INTEGER, empresa_id INTEGER);
    `;
    assert.equal(spawnSync('sqlite3', ['-bail', db], { input: init, encoding: 'utf8' }).status, 0);
    const sql = `
      BEGIN IMMEDIATE;
      INSERT INTO modelos_sessao_versionamento VALUES(10,6,'A139-I-01/12',1);
      ${Array.from({ length: linkCount }, (_, i) =>
        `INSERT INTO modelos_sessao_manobras VALUES(${i + 1},10,NULL);`).join('\n')}
      INSERT INTO manobras VALUES(200,${crossTenant ? 7 : 6});
      INSERT INTO simuladores_matriz_manobra_resolution VALUES(6,'PTO-V18-CHECK',200);
      ${buildPtoRev10AtomicPostconditions(template)}
      COMMIT;
    `;
    const result = spawnSync('sqlite3', ['-bail', db], { input: sql, encoding: 'utf8' });
    const readback = spawnSync('sqlite3', [db,
      'SELECT COUNT(*) FROM modelos_sessao_versionamento'], { encoding: 'utf8' });
    return { result, count: Number(readback.stdout.trim()) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('guarda atômica permite commit íntegro', { skip: !sqliteAvailable }, () => {
  const result = runTransaction({});
  assert.equal(result.result.status, 0, result.result.stderr);
  assert.equal(result.count, 1);
});

test('18 vínculos incompletos abortam a transação inteira', { skip: !sqliteAvailable }, () => {
  const result = runTransaction({ linkCount: 17 });
  assert.notEqual(result.result.status, 0);
  assert.match(result.result.stderr, /CHECK constraint failed/);
  assert.equal(result.count, 0);
});

test('manobra de outro tenant aborta a transação inteira', { skip: !sqliteAvailable }, () => {
  const result = runTransaction({ crossTenant: true });
  assert.notEqual(result.result.status, 0);
  assert.equal(result.count, 0);
});
