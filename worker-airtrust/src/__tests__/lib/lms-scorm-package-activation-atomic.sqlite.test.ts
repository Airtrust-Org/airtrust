import { afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { commitCertifiedScormActivation } from '../../lib/lms/lms-scorm-package-activation';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });

const sha = (c: string) => c.repeat(64);
const json = '{"certification":"sha-bound"}';
const prefix = (id: string) => `lms/scorm/6/41/${id}/`;

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_scorm_package_versions (
      id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER, package_sha256 TEXT,
      r2_prefix TEXT, status TEXT, validation_result_json TEXT,
      activated_at TEXT, activated_by INTEGER
    );
    CREATE TABLE lms_cursos (
      id INTEGER, empresa_id INTEGER, tipo_conteudo TEXT,
      scorm_package_r2_prefix TEXT, scorm_launch_file TEXT, scorm_versao TEXT,
      conteudo_arquivo_nome TEXT, updated_at TEXT,
      PRIMARY KEY(empresa_id,id)
    );
  `);
  const packageInsert = db.database.prepare(`INSERT INTO lms_scorm_package_versions
    (id,empresa_id,curso_id,package_sha256,r2_prefix,status,validation_result_json)
    VALUES(?,?,?,?,?,?,?)`);
  packageInsert.run('a', 6, 41, sha('a'), prefix('a'), 'ACTIVE', json);
  packageInsert.run('b', 6, 41, sha('b'), prefix('b'), 'VALIDATED', json);
  packageInsert.run('c', 6, 41, sha('c'), prefix('c'), 'VALIDATED', json);
  packageInsert.run('other-tenant', 7, 41, sha('d'), 'lms/scorm/7/41/a/', 'ACTIVE', json);
  const courseInsert = db.database.prepare(`INSERT INTO lms_cursos
    (id,empresa_id,tipo_conteudo,scorm_package_r2_prefix,scorm_launch_file,scorm_versao)
    VALUES(?,?,'scorm',?,'index.html','1.2')`);
  courseInsert.run(41, 6, prefix('a'));
  courseInsert.run(41, 7, 'lms/scorm/7/41/a/');
  return db;
}
function candidate(db: SqliteD1Database, id = 'b') {
  return {
    db: db.asD1(), empresaId: 6, cursoId: 41, packageId: id,
    packageSha256: sha(id), prefix: prefix(id), launchFile: 'index.html',
    originalFilename: `${id}.zip`, actorId: 10, validationJson: json,
  };
}
function states(db: SqliteD1Database) {
  return db.database.prepare(`SELECT id,status FROM lms_scorm_package_versions
    WHERE empresa_id=6 AND curso_id=41 ORDER BY id`).all();
}
function coursePrefix(db: SqliteD1Database, tenant = 6) {
  return (db.database.prepare('SELECT scorm_package_r2_prefix FROM lms_cursos WHERE empresa_id=? AND id=41')
    .get(tenant) as {scorm_package_r2_prefix:string}).scorm_package_r2_prefix;
}

describe('certified SCORM package activation — atomic SQLite/D1 transition', () => {
  it('activates exactly the certified candidate and keeps another tenant unchanged', async () => {
    const db = fixture();
    expect(await commitCertifiedScormActivation(candidate(db))).toBe(true);
    expect(states(db)).toEqual([
      {id:'a',status:'SUPERSEDED'}, {id:'b',status:'ACTIVE'}, {id:'c',status:'VALIDATED'},
    ]);
    expect(coursePrefix(db)).toBe(prefix('b'));
    expect(coursePrefix(db,7)).toBe('lms/scorm/7/41/a/');
    expect(db.database.prepare(`SELECT status FROM lms_scorm_package_versions
      WHERE id='other-tenant'`).get()).toEqual({status:'ACTIVE'});
  });

  it('rejects a delayed second activation of the same candidate without demoting it', async () => {
    const db = fixture(), preflight = candidate(db);
    // Both HTTP calls may read VALIDATED before either begins a D1 batch.
    expect(await commitCertifiedScormActivation(preflight)).toBe(true);
    expect(await commitCertifiedScormActivation(preflight)).toBe(false);
    expect(states(db)).toEqual([
      {id:'a',status:'SUPERSEDED'}, {id:'b',status:'ACTIVE'}, {id:'c',status:'VALIDATED'},
    ]);
    expect(coursePrefix(db)).toBe(prefix('b'));
  });

  it('preserves existing ACTIVE state if attestation JSON changes after preflight', async () => {
    const db = fixture(), preflight = candidate(db);
    db.database.prepare(`UPDATE lms_scorm_package_versions SET validation_result_json='{"revoked":true}'
      WHERE id='b'`).run();
    expect(await commitCertifiedScormActivation(preflight)).toBe(false);
    expect(states(db)[0]).toEqual({id:'a',status:'ACTIVE'});
    expect(coursePrefix(db)).toBe(prefix('a'));
  });

  it('preserves active course if candidate becomes REJECTED before its batch', async () => {
    const db = fixture(), preflight = candidate(db);
    db.database.prepare(`UPDATE lms_scorm_package_versions SET status='REJECTED' WHERE id='b'`).run();
    expect(await commitCertifiedScormActivation(preflight)).toBe(false);
    expect(states(db)[0]).toEqual({id:'a',status:'ACTIVE'});
    expect(coursePrefix(db)).toBe(prefix('a'));
  });

  it('keeps exactly the last successfully activated candidate when two compete', async () => {
    const db = fixture(), b = candidate(db,'b'), c = candidate(db,'c');
    expect(await commitCertifiedScormActivation(b)).toBe(true);
    expect(await commitCertifiedScormActivation(c)).toBe(true);
    expect(states(db)).toEqual([
      {id:'a',status:'SUPERSEDED'}, {id:'b',status:'SUPERSEDED'}, {id:'c',status:'ACTIVE'},
    ]);
    expect(coursePrefix(db)).toBe(prefix('c'));
  });

  it('rolls back the demotion if the candidate promotion fails inside the batch', async () => {
    const db = fixture();
    db.database.exec(`CREATE TRIGGER fail_promotion BEFORE UPDATE OF status
      ON lms_scorm_package_versions WHEN NEW.status='ACTIVE'
      BEGIN SELECT RAISE(ABORT,'SIMULATED_SCORM_ACTIVATION_FAILURE'); END;`);
    await expect(commitCertifiedScormActivation(candidate(db)))
      .rejects.toThrow('SIMULATED_SCORM_ACTIVATION_FAILURE');
    expect(states(db)[0]).toEqual({id:'a',status:'ACTIVE'});
    expect(coursePrefix(db)).toBe(prefix('a'));
  });
});
