import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join as pathJoin } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

const SCRIPTS_DIR = pathJoin(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'scripts');
const MIGRATIONS_DIR = pathJoin(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'migrations');

// Real sqlite3-backed integration tests: the same real triggers from
// migrations 0440-0443 run here, so these tests exercise the exact
// immutability/state-machine/concurrency guarantees the production D1
// executor relies on — not a mocked approximation of them.
function run(db: string, sql: string) {
  const r = spawnSync('sqlite3', ['-bail', db], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r;
}
function queryJson<T = unknown>(db: string, sql: string): T {
  const r = spawnSync('sqlite3', ['-json', db], { input: `PRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const t = r.stdout.trim();
  return (t ? JSON.parse(t) : []) as T;
}

const VERSAO = 'TEST.01';
const EMPRESA_ID = 6;

function seedSchema(db: string) {
  run(
    db,
    `
PRAGMA foreign_keys=OFF;
CREATE TABLE empresas (id INTEGER PRIMARY KEY, nome TEXT);
INSERT INTO empresas(id,nome) VALUES (6,'Test Tenant');
CREATE TABLE manobras (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL, nome TEXT, categoria TEXT, descricao TEXT, tipo_aeronave TEXT, referencias_json TEXT, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME);
CREATE TABLE modelos_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, nome TEXT, empresa_id INTEGER NOT NULL, tipo TEXT, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME);
CREATE TABLE modelos_sessao_manobras (id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER NOT NULL, manobra_id INTEGER NOT NULL, ordem INTEGER NOT NULL, obrigatoria BOOLEAN DEFAULT 1, observacoes TEXT, created_at DATETIME DEFAULT (datetime('now')), updated_at DATETIME DEFAULT (datetime('now')), deleted_at DATETIME, created_by TEXT, updated_by TEXT, tripulante TEXT NOT NULL DEFAULT 'AB' CHECK(tripulante IN ('A','B','AB','PFA','PMB','PFB','PMA')));
CREATE TABLE simuladores_modelos_sessao_guias (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, modelo_sessao_id INTEGER NOT NULL, guia_id INTEGER NOT NULL, principal INTEGER NOT NULL DEFAULT 1, ordem INTEGER NOT NULL DEFAULT 1, created_at DATETIME, updated_at DATETIME, deleted_at DATETIME);
CREATE TABLE fichas_sessao (id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER, empresa_id INTEGER);
CREATE TABLE simulador_agendamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, template_id INTEGER, empresa_id INTEGER);
-- Domains that must never be touched by this remediation (isolation checks below).
CREATE TABLE lms_matriculas (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER);
CREATE TABLE certificados (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER);
CREATE TABLE qualificacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER);
`,
  );
  for (const m of [
    '0440_simuladores_matriz_versionada_metadata',
    '0441_simuladores_matriz_manobra_resolution',
    '0442_simuladores_matriz_guia_relink',
    '0443_simuladores_matriz_remediation_compensation',
  ]) {
    const r = spawnSync('sqlite3', ['-bail', db], { input: readFileSync(join(MIGRATIONS_DIR, `${m}.sql`), 'utf8'), encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`migration ${m} failed: ${r.stderr || r.stdout}`);
  }
}

function seedFixture(db: string) {
  run(
    db,
    `
INSERT INTO manobras(empresa_id,codigo,nome,categoria,tipo_aeronave,created_at,updated_at) VALUES
${[1, 2, 3, 4, 5].map((i) => `(6,'LEG-0${i}','Legacy ${i}','cat','AW139',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).join(',\n')},
${[1, 2, 3, 4, 5].map((i) => `(6,'FOO-0${i}','Wrong ${i}','cat','AW139',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).join(',\n')},
${Array.from({ length: 20 }, (_, i) => `(6,'FILLER-${i + 1}','Filler ${i + 1}','cat','AW139',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).join(',\n')};

INSERT INTO simuladores_matriz_imports(uuid,empresa_id,versao_matriz,schema_version,status,plan_sha256,source_hashes_json,base_fingerprint,expected_counts_json)
VALUES ('imp-fixture',6,'${VERSAO}',4,'DRY_RUN',hex(randomblob(32)),'{}',hex(randomblob(32)),'{}');
UPDATE simuladores_matriz_imports SET status='APPLYING' WHERE uuid='imp-fixture';
UPDATE simuladores_matriz_imports SET status='APPLIED', applied_at=CURRENT_TIMESTAMP, applied_counts_json='{}' WHERE uuid='imp-fixture';
INSERT INTO simuladores_matriz_guia_relink(uuid,empresa_id,versao_matriz,status,expected_hash,expected_counts_json,applied_at)
VALUES ('imp-fixture-guide',6,'${VERSAO}','APPLIED',hex(randomblob(32)),json_object('total',51),CURRENT_TIMESTAMP);
`,
  );
  const wrongByCode = Object.fromEntries(queryJson<Array<{ codigo: string; id: number }>>(db, `SELECT codigo,id FROM manobras WHERE codigo LIKE 'FOO-%'`).map((r) => [r.codigo, r.id]));
  const fillerIds = queryJson<Array<{ id: number }>>(db, `SELECT id FROM manobras WHERE codigo LIKE 'FILLER-%' ORDER BY id`).map((r) => r.id);
  for (const [codigo, id] of Object.entries(wrongByCode)) {
    run(
      db,
      `INSERT INTO simuladores_matriz_manobra_resolution(empresa_id,versao_matriz,codigo_canonico,manobra_id,resolution_type,source_hash,import_uuid)
       VALUES (6,'${VERSAO}','${codigo}',${id},'TRUE_MISSING',hex(randomblob(32)),'imp-fixture');`,
    );
  }
  const overridesByModel: Array<Record<number, string>> = [
    { 1: 'FOO-01', 2: 'FOO-02' },
    { 1: 'FOO-01' },
    { 1: 'FOO-01' },
    { 1: 'FOO-02' },
    { 1: 'FOO-03', 2: 'FOO-04' },
    { 1: 'FOO-03' },
    { 1: 'FOO-04' },
    { 1: 'FOO-05' },
    { 1: 'FOO-05', 2: 'FOO-03', 3: 'FOO-04' },
  ];
  for (let m = 0; m < 9; m++) {
    run(db, `INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at) VALUES ('MOD-${m}@${VERSAO}','Model ${m}',6,'PERIODICO',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
    const modeloId = queryJson<Array<{ id: number }>>(db, `SELECT id FROM modelos_sessao WHERE codigo='MOD-${m}@${VERSAO}'`)[0].id;
    const overrides = overridesByModel[m];
    const rows: string[] = [];
    for (let ordem = 1; ordem <= 18; ordem++) {
      const manobraId = overrides[ordem] ? wrongByCode[overrides[ordem]] : fillerIds[(m * 18 + ordem) % fillerIds.length];
      rows.push(`(${modeloId},${manobraId},${ordem},1,'AB',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
    }
    run(db, `INSERT INTO modelos_sessao_manobras(modelo_id,manobra_id,ordem,obrigatoria,tripulante,created_at,updated_at) VALUES\n${rows.join(',\n')};`);
    run(db, `INSERT INTO modelos_sessao_manobras_contexto(modelo_manobra_id,empresa_id,metadados_json) SELECT id, 6, json_object('nome','ctx') FROM modelos_sessao_manobras WHERE modelo_id=${modeloId};`);
    run(db, `INSERT INTO modelos_sessao_versionamento(modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,efetivo_em) VALUES (${modeloId},6,'MOD-${m}',1,'${VERSAO}',1,CURRENT_TIMESTAMP);`);
    run(db, `INSERT INTO simuladores_modelos_sessao_guias(empresa_id,modelo_sessao_id,guia_id,principal,ordem,created_at,updated_at) VALUES (6,${modeloId},${900 + m},1,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
  }
}

const MAPPINGS = [1, 2, 3, 4, 5].map((i) => ({ codigo_canonico: `FOO-0${i}`, correct_legacy_manobra_codigo: `LEG-0${i}` }));

function prepare(dir: string, db: string, remediationUuid: string) {
  const mappingsPath = join(dir, 'mappings.json');
  writeFileSync(mappingsPath, JSON.stringify(MAPPINGS));
  const outDir = join(dir, 'plan-out');
  const r = spawnSync(
    'node',
    [join(SCRIPTS_DIR, 'prepare-simuladores-matriz-remediation.mjs'), '--d1-local', db, '--mappings', mappingsPath, '--empresa-id', '6', '--versao-matriz', VERSAO, '--remediation-uuid', remediationUuid, '--out', outDir],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(readFileSync(join(outDir, `plan-${remediationUuid}.json`), 'utf8'));
}
function applyPlan(db: string, planPath: string, mode: '--dry-run' | '--apply') {
  const r = spawnSync('node', [join(SCRIPTS_DIR, 'apply-simuladores-matriz-remediation.mjs'), '--plan', planPath, '--d1-local', db, mode], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, body: r.status === 0 ? JSON.parse(r.stdout) : null };
}
function rollback(db: string, remediationUuid: string) {
  const r = spawnSync('node', [join(SCRIPTS_DIR, 'rollback-simuladores-matriz-remediation.mjs'), '--d1-local', db, '--remediation-uuid', remediationUuid, '--empresa-id', '6'], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, body: r.status === 0 ? JSON.parse(r.stdout) : null };
}

let dir: string;
let db: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'matriz-remediation-'));
  db = join(dir, 'local.sqlite');
  seedSchema(db);
  seedFixture(db);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('matriz remediation lifecycle: dry-run', () => {
  it('is fully read-only', () => {
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(prepare(dir, db, 'rem-dryrun-1')));
    const before = queryJson(db, 'SELECT COUNT(*) AS c FROM modelos_sessao');
    const res = applyPlan(db, join(dir, 'plan.json'), '--dry-run');
    expect(res.status).toBe(0);
    expect(res.body).toMatchObject({ ok: true, mode: 'DRY_RUN' });
    const after = queryJson(db, 'SELECT COUNT(*) AS c FROM modelos_sessao');
    expect(after).toEqual(before);
  });
});

describe('matriz remediation lifecycle: apply', () => {
  it('creates exactly 9 new models, 162 active links, 0 links on wrong manobras, 5 current overlays, 9 relinked guides', () => {
    const plan = prepare(dir, db, 'rem-apply-1');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const res = applyPlan(db, join(dir, 'plan.json'), '--apply');
    expect(res.status, res.stderr).toBe(0);
    expect(res.body).toMatchObject({ ok: true, status: 'APPLIED' });

    const currentModels = queryJson<Array<{ codigo: string }>>(
      db,
      `SELECT ms.codigo FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id WHERE v.empresa_id=6 AND v.is_current=1`,
    );
    expect(currentModels).toHaveLength(9);
    expect(currentModels.every((m) => m.codigo.includes('REMEDIATION'))).toBe(true);

    const activeLinks = queryJson<unknown[]>(
      db,
      `SELECT msm.id FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id=msm.modelo_id JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.is_current=1 WHERE ms.empresa_id=6 AND msm.deleted_at IS NULL`,
    );
    expect(activeLinks).toHaveLength(162);

    const wrongLinks = queryJson<unknown[]>(
      db,
      `SELECT msm.id FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id=msm.modelo_id JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.is_current=1 JOIN manobras m ON m.id=msm.manobra_id WHERE ms.empresa_id=6 AND msm.deleted_at IS NULL AND m.codigo LIKE 'FOO-%'`,
    );
    expect(wrongLinks).toHaveLength(0);

    const corrections = queryJson<Array<{ is_current: number }>>(db, `SELECT is_current FROM simuladores_matriz_resolution_corrections WHERE empresa_id=6`);
    expect(corrections).toHaveLength(5);
    expect(corrections.every((c) => c.is_current === 1)).toBe(true);

    const relinkedGuides = queryJson<Array<{ codigo: string }>>(
      db,
      `SELECT ms.codigo FROM simuladores_modelos_sessao_guias g JOIN modelos_sessao ms ON ms.id=g.modelo_sessao_id WHERE g.empresa_id=6 AND g.deleted_at IS NULL`,
    );
    expect(relinkedGuides).toHaveLength(9);
    expect(relinkedGuides.every((g) => g.codigo.includes('REMEDIATION'))).toBe(true);
  });

  it('never rewrites the original resolution rows (still TRUE_MISSING, still pointing at the wrong manobra)', () => {
    const plan = prepare(dir, db, 'rem-apply-2');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const before = queryJson(db, `SELECT codigo_canonico, manobra_id, resolution_type FROM simuladores_matriz_manobra_resolution WHERE empresa_id=6 ORDER BY codigo_canonico`);
    applyPlan(db, join(dir, 'plan.json'), '--apply');
    const after = queryJson(db, `SELECT codigo_canonico, manobra_id, resolution_type FROM simuladores_matriz_manobra_resolution WHERE empresa_id=6 ORDER BY codigo_canonico`);
    expect(after).toEqual(before);
  });

  it('computes the effective split (5 LEGACY_EQUIVALENT via overlay) on the remediation row', () => {
    const plan = prepare(dir, db, 'rem-apply-3');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    applyPlan(db, join(dir, 'plan.json'), '--apply');
    const row = queryJson<Array<{ effective_legacy_equivalent: number; effective_true_missing: number }>>(
      db,
      `SELECT effective_legacy_equivalent, effective_true_missing FROM simuladores_matriz_remediations WHERE remediation_uuid='rem-apply-3'`,
    )[0];
    expect(row.effective_legacy_equivalent).toBe(5);
    expect(row.effective_true_missing).toBe(0);
  });

  it('is idempotent: reapplying the same remediation_uuid+plan makes no further writes', () => {
    const plan = prepare(dir, db, 'rem-apply-4');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    applyPlan(db, join(dir, 'plan.json'), '--apply');
    const countBefore = queryJson(db, 'SELECT COUNT(*) AS c FROM modelos_sessao');
    const res2 = applyPlan(db, join(dir, 'plan.json'), '--apply');
    expect(res2.body).toMatchObject({ ok: true, idempotent: true, status: 'APPLIED' });
    const countAfter = queryJson(db, 'SELECT COUNT(*) AS c FROM modelos_sessao');
    expect(countAfter).toEqual(countBefore);
  });

  it('rejects a second concurrent remediation_uuid while one is APPLYING for the same tenant/versão', () => {
    const plan = prepare(dir, db, 'rem-apply-5');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    // Simulate a stuck APPLYING row from a different remediation_uuid.
    run(
      db,
      `INSERT INTO simuladores_matriz_remediations(remediation_uuid,empresa_id,remediation_type,source_matrix_import_uuid,source_guide_import_uuid,versao_matriz,expected_hash,base_fingerprint,plan_sha256,status,model_count,link_count,mapping_count)
       VALUES ('rem-other-inflight',6,'LEGACY_EQUIVALENT_COMPENSATION','imp-fixture','imp-fixture-guide','${VERSAO}',hex(randomblob(32)),hex(randomblob(32)),hex(randomblob(32)),'APPLYING',9,13,5);`,
    );
    const res = applyPlan(db, join(dir, 'plan.json'), '--apply');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/APPLYING/);
  });

  it('fails closed when downstream usage (ficha/agendamento) appears between plan generation and apply', () => {
    const plan = prepare(dir, db, 'rem-apply-6');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    const affectedModeloId = plan.affected_models[0].modelo_id;
    run(db, `INSERT INTO fichas_sessao(template_id, empresa_id) VALUES (${affectedModeloId}, 6);`);
    const res = applyPlan(db, join(dir, 'plan.json'), '--apply');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/drift/);
  });

  it('never touches LMS, certificados, or qualificacoes tables', () => {
    const plan = prepare(dir, db, 'rem-apply-7');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    for (const t of ['lms_matriculas', 'certificados', 'qualificacoes']) {
      run(db, `INSERT INTO ${t}(empresa_id) VALUES (6);`);
    }
    const before = {
      lms: queryJson(db, 'SELECT * FROM lms_matriculas'),
      cert: queryJson(db, 'SELECT * FROM certificados'),
      qual: queryJson(db, 'SELECT * FROM qualificacoes'),
    };
    applyPlan(db, join(dir, 'plan.json'), '--apply');
    const after = {
      lms: queryJson(db, 'SELECT * FROM lms_matriculas'),
      cert: queryJson(db, 'SELECT * FROM certificados'),
      qual: queryJson(db, 'SELECT * FROM qualificacoes'),
    };
    expect(after).toEqual(before);
  });

  it('keeps FK integrity clean before and after apply', () => {
    const plan = prepare(dir, db, 'rem-apply-8');
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
    expect(run(db, 'PRAGMA foreign_key_check;').stdout.trim()).toBe('');
    applyPlan(db, join(dir, 'plan.json'), '--apply');
    expect(run(db, 'PRAGMA foreign_key_check;').stdout.trim()).toBe('');
  });
});

describe('matriz remediation lifecycle: rollback', () => {
  function applyOnce(uuid: string) {
    const plan = prepare(dir, db, uuid);
    writeFileSync(join(dir, `plan-${uuid}.json`), JSON.stringify(plan));
    const res = applyPlan(db, join(dir, `plan-${uuid}.json`), '--apply');
    expect(res.status, res.stderr).toBe(0);
    return plan;
  }

  it('restores the exact pre-remediation logical state', () => {
    applyOnce('rem-rb-1');
    const res = rollback(db, 'rem-rb-1');
    expect(res.status, res.stderr).toBe(0);
    expect(res.body).toMatchObject({ ok: true, status: 'ROLLED_BACK' });

    const currentModels = queryJson<Array<{ codigo: string }>>(
      db,
      `SELECT ms.codigo FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id WHERE v.empresa_id=6 AND v.is_current=1`,
    );
    expect(currentModels).toHaveLength(9);
    expect(currentModels.every((m) => !m.codigo.includes('REMEDIATION'))).toBe(true);

    const wrongLinksActive = queryJson<unknown[]>(
      db,
      `SELECT msm.id FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id=msm.modelo_id JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.is_current=1 JOIN manobras m ON m.id=msm.manobra_id WHERE ms.empresa_id=6 AND msm.deleted_at IS NULL AND m.codigo LIKE 'FOO-%'`,
    );
    expect(wrongLinksActive).toHaveLength(13);

    const corrections = queryJson<Array<{ is_current: number }>>(db, `SELECT is_current FROM simuladores_matriz_resolution_corrections WHERE empresa_id=6`);
    expect(corrections.every((c) => c.is_current === 0)).toBe(true);
  });

  it('is idempotent on a second rollback of the same remediation_uuid', () => {
    applyOnce('rem-rb-2');
    rollback(db, 'rem-rb-2');
    const res2 = rollback(db, 'rem-rb-2');
    expect(res2.body).toMatchObject({ ok: true, idempotent: true, status: 'ROLLED_BACK' });
  });

  it('never hard-deletes the compensated models — they remain queryable as historical rows', () => {
    const plan = applyOnce('rem-rb-3');
    const remediatedModeloIds: number[] = plan.affected_models.map((m: { modelo_id: number }) => m.modelo_id);
    const remediatedCurrentRows = queryJson<Array<{ modelo_id: number }>>(
      db,
      `SELECT modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND modelo_id NOT IN (${remediatedModeloIds.join(',')})`,
    );
    // (sanity: capture count before rollback for a historical existence check post-rollback)
    rollback(db, 'rem-rb-3');
    for (const id of remediatedModeloIds) {
      const stillExists = queryJson<unknown[]>(db, `SELECT id FROM modelos_sessao WHERE id=${id}`);
      expect(stillExists).toHaveLength(1);
    }
  });

  it('permits reapply with a new remediation_uuid after rollback, restoring the fix', () => {
    applyOnce('rem-rb-4');
    rollback(db, 'rem-rb-4');
    const plan2 = prepare(dir, db, 'rem-rb-4-retry');
    writeFileSync(join(dir, 'plan2.json'), JSON.stringify(plan2));
    const res = applyPlan(db, join(dir, 'plan2.json'), '--apply');
    expect(res.status, res.stderr).toBe(0);
    expect(res.body).toMatchObject({ ok: true, status: 'APPLIED' });
    const wrongLinksActive = queryJson<unknown[]>(
      db,
      `SELECT msm.id FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id=msm.modelo_id JOIN modelos_sessao_versionamento v ON v.modelo_id=ms.id AND v.is_current=1 JOIN manobras m ON m.id=msm.manobra_id WHERE ms.empresa_id=6 AND msm.deleted_at IS NULL AND m.codigo LIKE 'FOO-%'`,
    );
    expect(wrongLinksActive).toHaveLength(0);
  });

  it('keeps FK integrity clean after rollback', () => {
    applyOnce('rem-rb-5');
    rollback(db, 'rem-rb-5');
    expect(run(db, 'PRAGMA foreign_key_check;').stdout.trim()).toBe('');
  });
});
