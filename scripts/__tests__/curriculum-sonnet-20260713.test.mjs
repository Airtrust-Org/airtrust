import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

import {
  applyCurriculum,
  createDisposableDatabase,
  deriveImplementationScope,
  loadCurriculumBundle,
  rollbackCurriculum,
} from '../simuladores/sonnet-curriculum-lib.mjs';

const tempDirs = [];

function makePaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-sonnet-test-'));
  tempDirs.push(dir);
  return {
    dir,
    dbPath: path.join(dir, 'curriculum.sqlite'),
    snapshotPath: path.join(dir, 'curriculum-before.sqlite'),
    outputDir: path.join(dir, 'reports'),
  };
}

function mutate(dbPath, sql) {
  const result = spawnSync('sqlite3', [dbPath], {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'sqlite_mutation_failed');
  }
}

function query(dbPath, sql) {
  const result = spawnSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'sqlite_query_failed');
  }
  return result.stdout.trim() ? JSON.parse(result.stdout.trim()) : [];
}

function cleanup() {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
}

function buildSingleImplementScope(scopeRows, targetCode) {
  return scopeRows.map((row) => {
    if (row.codigo_sessao === targetCode) {
      return { ...row, acao: 'IMPLEMENTAR' };
    }
    if (row.acao === 'EXCLUIR_DO_ESCOPO') return row;
    return { ...row, acao: 'PRESERVAR_SEM_ALTERACAO' };
  });
}

function getFirstInsert(plan) {
  for (const session of plan.sessions) {
    for (const op of session.operacoes || []) {
      if (op.type === 'insert_link') {
        return { session, op };
      }
    }
  }
  throw new Error('insert_op_not_found');
}

function readSessionCodes(dbPath, code) {
  return query(
    dbPath,
    `
      SELECT m.codigo AS codigo, msm.ordem AS ordem
      FROM modelos_sessao_manobras msm
      INNER JOIN modelos_sessao ms ON ms.id = msm.modelo_id
      INNER JOIN manobras m ON m.id = msm.manobra_id
      WHERE ms.codigo = '${code.replace(/'/g, "''")}'
        AND ms.empresa_id = 6
        AND ms.deleted_at IS NULL
        AND msm.deleted_at IS NULL
      ORDER BY msm.ordem, msm.id;
    `,
  );
}

function run() {
  const bundle = loadCurriculumBundle();
  const scopeRows = deriveImplementationScope(bundle);

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const result = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'dry_run_ok');
    assert.ok(fs.existsSync(path.join(paths.outputDir, 'CURRICULUM_CHANGE_PLAN.json')));
    const impacted = new Map(result.plan.sessions.map((item) => [item.codigo, item]));
    assert.equal(impacted.get('S76-NOT-01').vinculos_removidos.includes('OPS-NOT-X1'), true);
    assert.equal(impacted.get('S76-NOT-01').vinculos_adicionados.includes('S76-LOFT-33'), true);
    assert.equal(impacted.get('S76-NOT-02').vinculos_removidos.includes('OPS-NOT-X1'), true);
    assert.equal(impacted.get('S76-NOT-02').vinculos_adicionados.includes('S76-LOFT-33'), true);
    assert.equal(impacted.get('SK76-S-01/02').vinculos_removidos.includes('OPS-NOT-X1'), true);
    assert.equal(
      impacted.get('SK76-S-01/02').estado_final.rows.some((row) => row.codigo === 'S76-ILS-00'),
      true,
    );
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const dryRun = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(dryRun.status, 'dry_run_ok');
    assert.ok(dryRun.plan.sessions.length > 0);
    assert.ok(fs.existsSync(path.join(paths.outputDir, 'CURRICULUM_CHANGE_PLAN.json')));

    const firstApply = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: false,
      outputDir: paths.outputDir,
    });
    assert.equal(firstApply.status, 'ok');
    assert.ok(firstApply.counts.inserts > 0);

    const s76Not01 = readSessionCodes(paths.dbPath, 'S76-NOT-01');
    assert.equal(s76Not01.length, 18);
    assert.equal(s76Not01[6].codigo, 'S76-LOFT-33');
    assert.equal(s76Not01.some((row) => row.codigo === 'OPS-NOT-X1'), false);
    assert.deepEqual(s76Not01.map((row) => row.ordem), Array.from({ length: 18 }, (_, index) => index + 1));

    const s76Not02 = readSessionCodes(paths.dbPath, 'S76-NOT-02');
    assert.equal(s76Not02.length, 18);
    assert.equal(s76Not02[5].codigo, 'S76-LOFT-33');
    assert.equal(s76Not02.some((row) => row.codigo === 'OPS-NOT-X1'), false);

    const sk76Sem = readSessionCodes(paths.dbPath, 'SK76-S-01/02');
    assert.equal(sk76Sem.length, 18);
    assert.equal(sk76Sem.some((row) => row.codigo === 'OPS-NOT-X1'), false);
    assert.equal(sk76Sem.some((row) => row.codigo === 'S76-ILS-00'), true);
    assert.equal(sk76Sem[13].codigo, 'S76-ILS-00');
    assert.deepEqual(sk76Sem.map((row) => row.ordem), Array.from({ length: 18 }, (_, index) => index + 1));
    assert.equal(new Set(sk76Sem.map((row) => row.codigo)).size, 18);

    const secondApply = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: false,
      outputDir: paths.outputDir,
    });
    assert.equal(secondApply.status, 'ok');
    assert.deepEqual(secondApply.counts, { inserts: 0, updates: 0, softDeletes: 0 });

    const rollback = rollbackCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      snapshotPath: paths.snapshotPath,
      dryRun: false,
      outputDir: paths.outputDir,
    });
    assert.equal(rollback.status, 'ok');
    assert.ok(rollback.counts.inserts > 0);
    const rolledBack = readSessionCodes(paths.dbPath, 'S76-NOT-01');
    assert.equal(rolledBack.some((row) => row.codigo === 'OPS-NOT-X1'), true);
    assert.equal(rolledBack.some((row) => row.codigo === 'S76-LOFT-33'), false);

    const rollbackIdempotent = rollbackCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      snapshotPath: paths.snapshotPath,
      dryRun: false,
      outputDir: paths.outputDir,
    });
    assert.equal(rollbackIdempotent.status, 'ok');
    assert.deepEqual(rollbackIdempotent.counts, { inserts: 0, updates: 0, softDeletes: 0 });
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    assert.throws(
      () =>
        applyCurriculum(bundle, scopeRows, {
          empresaId: 0,
          dbPath: paths.dbPath,
          dryRun: false,
          outputDir: paths.outputDir,
        }),
      /empresa_id_required/,
    );
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    mutate(paths.dbPath, `DELETE FROM modelos_sessao WHERE codigo = 'A139-I-05/12' AND empresa_id = 6;`);
    const result = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.includes('missing_model:A139-I-05/12'), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const preview = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    const { op } = getFirstInsert(preview.plan);
    mutate(
      paths.dbPath,
      `
        UPDATE manobras
        SET deleted_at = datetime('now')
        WHERE id = ${op.manobraId};
      `,
    );
    const result = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.some((item) => item.startsWith(`archived_maneuver:${op.manobraCode}`)), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const preview = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    const { op } = getFirstInsert(preview.plan);
    mutate(
      paths.dbPath,
      `
        INSERT INTO manobras (
          id, empresa_id, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, deleted_at, created_at, updated_at
        )
        SELECT 990001, 8, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, NULL, created_at, updated_at
        FROM manobras
        WHERE id = ${op.manobraId};

        DELETE FROM manobras
        WHERE id = ${op.manobraId};
      `,
    );
    const result = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.some((item) => item.startsWith(`cross_tenant_maneuver:${op.manobraCode}`)), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const preview = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    const { op } = getFirstInsert(preview.plan);
    mutate(
      paths.dbPath,
      `
        INSERT INTO manobras (
          id, empresa_id, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, deleted_at, created_at, updated_at
        )
        SELECT 990002, empresa_id, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, NULL, created_at, updated_at
        FROM manobras
        WHERE id = ${op.manobraId};

        DELETE FROM manobras
        WHERE id = ${op.manobraId};
      `,
    );
    const result = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.ok(result.status === 'dry_run_ok' || result.status === 'blocked');
    const reparsed = getFirstInsert(result.plan);
    assert.equal(reparsed.op.manobraId, 990002);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    mutate(
      paths.dbPath,
      `
        UPDATE modelos_sessao
        SET descricao = 'alterado indevidamente'
        WHERE codigo = 'TRE-INST' AND empresa_id = 6;
      `,
    );
    const rerun = applyCurriculum(bundle, scopeRows, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(rerun.status, 'blocked');
    assert.equal(rerun.errors.includes('blocked_session_changed:TRE-INST'), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const single = buildSingleImplementScope(scopeRows, 'S76-NOT-01');
    mutate(paths.dbPath, `DELETE FROM manobras WHERE codigo = 'S76-LOFT-33' AND empresa_id = 6;`);
    const result = applyCurriculum(bundle, single, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.includes('missing_maneuver:S76-LOFT-33:S76-NOT-01'), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const single = buildSingleImplementScope(scopeRows, 'S76-NOT-01');
    mutate(
      paths.dbPath,
      `
        INSERT INTO manobras (
          id, empresa_id, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, deleted_at, created_at, updated_at
        )
        SELECT 995001, empresa_id, codigo, nome, descricao, categoria, tipo_aeronave, referencias_json, NULL, created_at, updated_at
        FROM manobras
        WHERE codigo = 'S76-LOFT-33' AND empresa_id = 6
        LIMIT 1;
      `,
    );
    const result = applyCurriculum(bundle, single, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.includes('ambiguous_maneuver:S76-LOFT-33:S76-NOT-01'), true);
  }

  {
    const paths = makePaths();
    createDisposableDatabase(bundle, paths);
    const single = buildSingleImplementScope(scopeRows, 'SK76-S-01/02');
    mutate(paths.dbPath, `DELETE FROM manobras WHERE codigo = 'S76-ILS-00' AND empresa_id = 6;`);
    const result = applyCurriculum(bundle, single, {
      empresaId: 6,
      dbPath: paths.dbPath,
      dryRun: true,
      outputDir: paths.outputDir,
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.errors.includes('missing_maneuver:S76-ILS-00:SK76-S-01/02'), true);
  }

  cleanup();
  process.stdout.write('curriculum-sonnet-20260713 hardened: OK\n');
}

try {
  run();
} catch (error) {
  cleanup();
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
}
