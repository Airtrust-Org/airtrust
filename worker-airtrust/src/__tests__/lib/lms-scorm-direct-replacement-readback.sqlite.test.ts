import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { readAlreadyActiveFormativeReplacement } from '../../lib/lms/lms-scorm-direct-replacement';

const opened: SqliteD1Database[] = [];
afterEach(() => { for (const db of opened.splice(0)) db.close(); });
const SHA = 'a'.repeat(64);
const prefix = 'lms/scorm/6/61/_candidates/fod-new/';

function fixture() {
  const db = new SqliteD1Database();
  opened.push(db);
  db.database.exec(`
    CREATE TABLE lms_scorm_package_versions (
      id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_sha256 TEXT, r2_prefix TEXT, launch_file TEXT, status TEXT,
      assessment_policy TEXT, certification_profile TEXT
    );
    CREATE TABLE lms_cursos (
      id INTEGER, empresa_id INTEGER, deleted_at TEXT, tipo_conteudo TEXT,
      scorm_assessment_policy TEXT, scorm_package_r2_prefix TEXT,
      scorm_launch_file TEXT, PRIMARY KEY(empresa_id,id)
    );
    CREATE TABLE lms_scorm_package_audit_log (
      id TEXT PRIMARY KEY, empresa_id INTEGER, curso_id INTEGER,
      package_id TEXT, action TEXT, actor_id INTEGER, created_at TEXT
    );
  `);
  db.database.prepare(`INSERT INTO lms_scorm_package_versions VALUES
    (?,?,?,?,?,'index.html','ACTIVE','FORMATIVE','FORMATIVE_NO_EXAM_V1')`)
    .run('fod-new',6,61,SHA,prefix);
  db.database.prepare(`INSERT INTO lms_cursos
    VALUES(61,6,NULL,'scorm','FORMATIVE',?,'index.html')`).run(prefix);
  db.database.prepare(`INSERT INTO lms_scorm_package_audit_log
    VALUES('activation-receipt',6,61,'fod-new','ACTIVATED',1,'2026-10-31')`).run();
  // Real second tenant; an exact package ID cannot be borrowed across tenants.
  db.database.prepare(`INSERT INTO lms_cursos
    VALUES(61,7,NULL,'scorm','FORMATIVE','lms/scorm/7/61/other/','index.html')`).run();
  const head = vi.fn().mockResolvedValue({ key: prefix+'index.html' });
  const params = {
    db: db.asD1(), bucket: { head } as unknown as R2Bucket,
    empresaId: 6, cursoId: 61, packageId: 'fod-new', packageSha256: SHA,
  };
  return {db, head, params};
}

describe('SCORM direct replacement duplicate receipt — SQLite authoritative readback', () => {
  it('acknowledges only the exact ACTIVE edition after checking the R2 launch object', async () => {
    const { db, head, params } = fixture();
    const receipt = await readAlreadyActiveFormativeReplacement(params);
    expect(receipt).toEqual({
      packageId: 'fod-new', packageSha256: SHA, status: 'ACTIVE', cursoId: 61,
      assessmentPolicy: 'FORMATIVE', validationMode: 'SERVER_STATIC_GATE', alreadyActive: true,
    });
    expect(head).toHaveBeenCalledOnce();
    expect(head).toHaveBeenCalledWith(prefix+'index.html');
    // Readback must never create another ACTIVATE audit or mutate either table.
    expect(db.database.prepare('SELECT status FROM lms_scorm_package_versions WHERE id=?')
      .get('fod-new')).toEqual({status:'ACTIVE'});
  });

  it.each([
    ['tenant', {empresaId:7}, null],
    ['course', {cursoId:62}, null],
    ['package ID', {packageId:'another'}, null],
    ['SHA', {packageSha256:'b'.repeat(64)}, null],
    ['superseded package', {}, "UPDATE lms_scorm_package_versions SET status='SUPERSEDED' WHERE id='fod-new'"],
    ['scored candidate', {}, "UPDATE lms_scorm_package_versions SET assessment_policy='SCORED' WHERE id='fod-new'"],
    ['wrong profile', {}, "UPDATE lms_scorm_package_versions SET certification_profile='SCORED' WHERE id='fod-new'"],
    ['stale course pointer', {}, "UPDATE lms_cursos SET scorm_package_r2_prefix='lms/scorm/6/61/old/' WHERE empresa_id=6 AND id=61"],
    ['stale launch', {}, "UPDATE lms_cursos SET scorm_launch_file='other.html' WHERE empresa_id=6 AND id=61"],
    ['wrong course policy', {}, "UPDATE lms_cursos SET scorm_assessment_policy='SCORED' WHERE empresa_id=6 AND id=61"],
    ['deleted course', {}, "UPDATE lms_cursos SET deleted_at='2026-10-31' WHERE empresa_id=6 AND id=61"],
    ['missing activation audit', {}, "DELETE FROM lms_scorm_package_audit_log WHERE package_id='fod-new'"],
    ['non-activation audit', {}, "UPDATE lms_scorm_package_audit_log SET action='VALIDATION_PASSED' WHERE package_id='fod-new'"],
  ])('fails closed on %s mismatch', async (_label, overrides, sql) => {
    const { db, head, params } = fixture();
    if (sql) db.database.exec(sql);
    expect(await readAlreadyActiveFormativeReplacement({...params,...overrides})).toBeNull();
    expect(head).not.toHaveBeenCalled();
  });

  it('refuses a missing R2 launch file even if D1 shows matching active edition', async () => {
    const { head, params } = fixture();
    head.mockResolvedValue(null);
    expect(await readAlreadyActiveFormativeReplacement(params)).toBeNull();
    expect(head).toHaveBeenCalledOnce();
  });
});
