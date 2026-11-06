import { describe, it, expect, vi } from 'vitest';
import { detectLmsEditionMismatch } from '../../services/lms-edition-mismatch';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

const cmi = (total: number) => JSON.stringify({
  'cmi.core.lesson_location': `${total}/${total}`,
  'airtrust.total_slides': total,
});
function bucket(total: number, malformed = false, version?: string, ids?: string[]): R2Bucket {
  return { get: vi.fn(async () => ({
    size: 900,
    text: async () => malformed
      ? '{invalid'
      : JSON.stringify({
        ...(version ? { packageVersion: version } : {}),
        content: { requiredSlides: ids ?? Array.from({ length: total }, (_, i) => `unit-${i + 1}`) },
      }),
  })) } as unknown as R2Bucket;
}
const base = {
  contentType: 'scorm',
  activePrefix: 'lms/scorm/6/119/_candidates/active/',
  empresaId: 6,
  cursoId: 119,
  cmiJson: cmi(41),
};
describe('published SCORM edition mismatch (CFIT 41 → 37)', () => {
  it('detects the verified older 41/41 state against the R2 37-slide manifest', async () => {
    const b = bucket(37);
    expect(await detectLmsEditionMismatch({ ...base, bucket: b })).toEqual({
      required: true, previous_total: 41, active_total: 37,
    });
    expect(b.get).toHaveBeenCalledWith(
      'lms/scorm/6/119/_candidates/active/airtrust-completion-manifest.json',
    );
  });
  it('never treats 41/41 of the same active 41-slide package as obsolete', async () => {
    expect(await detectLmsEditionMismatch({ ...base, bucket: bucket(41) })).toBeNull();
  });
  it('rejects missing or contradictory persisted position evidence', async () => {
    expect(await detectLmsEditionMismatch({ ...base, cmiJson: null, bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({
      ...base,
      cmiJson: JSON.stringify({ 'cmi.location': '41/41', 'airtrust.total_slides': 37 }),
      bucket: bucket(37),
    })).toBeNull();
  });
  it('fails closed when R2 is unavailable, manifest malformed or prefix suspicious', async () => {
    expect(await detectLmsEditionMismatch({ ...base, bucket: null })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, bucket: bucket(37, true) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, activePrefix: '../secrets', bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, empresaId: 99, bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, contentType: 'pdf', bucket: bucket(37) })).toBeNull();
  });
  it('recognizes MGO-like same-count replacement from native authored version instead of using 35/46 as proof', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'airtrust.total_slides': 46,
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'mgo-rev14', a: 34, d: [0, 1, 2] }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(46, false, 'mgo-rev15'),
    })).toEqual({
      required: true,
      previous_total: 46,
      active_total: 46,
      reason: 'PACKAGE_VERSION_CHANGED',
      previous_version: 'mgo-rev14',
      active_version: 'mgo-rev15',
    });
  });
  it('accepts a resumed active handoff even when engine and manifest version identifiers differ', async () => {
    const currentCmi = JSON.stringify({
      'cmi.core.lesson_location': '10/49',
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'v3.4-engine-2026-11-02', a: 9, d: [0, 1, 2] }),
    });
    const first = vi.fn(async (): Promise<{ id: number } | null> => ({ id: 13 }));
    const bind = vi.fn(() => ({ first }));
    const db = { prepare: vi.fn(() => ({ bind })) } as unknown as D1Database;
    const params = {
      ...base, matriculaId: 690, cmiJson: currentCmi,
      bucket: bucket(49, false, 'S76C_SOP_REV03_2026-11-02'), db,
    };
    expect(await detectLmsEditionMismatch(params)).toBeNull();
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('p.package_sha256=h.target_package_sha256'));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('cy.ciclo_atual=1'));
    expect(bind).toHaveBeenCalledWith(6, 119, 690, base.activePrefix, base.activePrefix);

    first.mockResolvedValueOnce(null);
    expect(await detectLmsEditionMismatch(params)).toMatchObject({
      required: true, reason: 'PACKAGE_VERSION_CHANGED',
    });
    expect(await detectLmsEditionMismatch({ ...params, matriculaId: undefined })).toMatchObject({
      required: true, reason: 'PACKAGE_VERSION_CHANGED',
    });
    first.mockRejectedValueOnce(new Error('ledger unavailable'));
    expect(await detectLmsEditionMismatch(params)).toMatchObject({
      required: true, reason: 'PACKAGE_VERSION_CHANGED',
    });
  });

  it('rejects A -> B -> rollback A when the latest in-cycle handoff belongs to B (SQLite)', async () => {
    const db = new SqliteD1Database();
    try {
      db.database.exec(`
        CREATE TABLE lms_cursos(id INTEGER PRIMARY KEY, empresa_id INTEGER,
          tipo_conteudo TEXT, deleted_at TEXT, scorm_package_r2_prefix TEXT);
        CREATE TABLE lms_matriculas(id INTEGER PRIMARY KEY, empresa_id INTEGER,
          curso_id INTEGER, deleted_at TEXT, status TEXT);
        CREATE TABLE lms_matricula_ciclos(id INTEGER PRIMARY KEY, empresa_id INTEGER,
          matricula_id INTEGER, curso_id INTEGER, ciclo_atual INTEGER, deleted_at TEXT);
        CREATE TABLE lms_scorm_package_versions(empresa_id INTEGER, course_unused TEXT,
          curso_id INTEGER, r2_prefix TEXT, status TEXT, package_sha256 TEXT);
        CREATE TABLE lms_progresso_scorm(empresa_id INTEGER, matricula_id INTEGER,
          last_commit_at TEXT);
        CREATE TABLE lms_scorm_edition_handoffs(id INTEGER PRIMARY KEY,
          empresa_id INTEGER, matricula_id INTEGER, curso_id INTEGER, ciclo_id INTEGER,
          target_package_sha256 TEXT, target_package_prefix TEXT, created_at TEXT);
      `);
      const aSha = 'a'.repeat(64), bSha = 'b'.repeat(64);
      const aPrefix = base.activePrefix;
      const bPrefix = 'lms/scorm/6/119/_candidates/rev-b/';
      db.database.prepare(`INSERT INTO lms_cursos VALUES(119,6,'scorm',NULL,?)`).run(aPrefix);
      db.database.exec(`
        INSERT INTO lms_matriculas VALUES(690,6,119,NULL,'EM_ANDAMENTO');
        INSERT INTO lms_matricula_ciclos VALUES(55,6,690,119,1,NULL);
        INSERT INTO lms_progresso_scorm VALUES(6,690,'2026-11-04 14:01:03');
      `);
      db.database.prepare(`INSERT INTO lms_scorm_package_versions
        (empresa_id,curso_id,r2_prefix,status,package_sha256) VALUES
        (6,119,?,'ACTIVE',?),(6,119,?,'ARCHIVED',?)`)
        .run(aPrefix,aSha,bPrefix,bSha);
      db.database.prepare(`INSERT INTO lms_scorm_edition_handoffs VALUES
        (1,6,690,119,55,?,?,'2026-11-01 09:00:00'),
        (2,6,690,119,55,?,?,'2026-11-02 09:00:00')`)
        .run(aSha,aPrefix,bSha,bPrefix);
      const params = {
        ...base, matriculaId: 690, db: db.asD1(),
        bucket: bucket(49, false, 'A-authored-v1'),
        cmiJson: JSON.stringify({
          'cmi.core.lesson_location': '10/49',
          'cmi.suspend_data': JSON.stringify({ v: 4, p: 'B-engine-v2', a: 9 }),
        }),
      };
      // The old A ledger entry must NOT authorize replaying current B CMI into A.
      expect(await detectLmsEditionMismatch(params)).toMatchObject({
        required: true, reason: 'PACKAGE_VERSION_CHANGED',
        previous_total: 49, active_total: 49,
      });
      // With only A's exact active handoff, version-label drift is harmless.
      db.database.exec('DELETE FROM lms_scorm_edition_handoffs WHERE id=2');
      expect(await detectLmsEditionMismatch(params)).toBeNull();
    } finally {
      db.close();
    }
  });

  it('uses separately persisted SCORM suspend_data when older CMI snapshots omit the field', async () => {
    const cmiWithoutSuspend = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'airtrust.total_slides': 46,
    });
    const storedSuspendData = JSON.stringify({
      v: 3, p: 'mgo-rev14', a: 34, d: [0, 1, 2],
    });
    expect(await detectLmsEditionMismatch({
      ...base,
      cmiJson: cmiWithoutSuspend,
      suspendData: storedSuspendData,
      bucket: bucket(46, false, 'mgo-rev15'),
    })).toMatchObject({
      required: true,
      reason: 'PACKAGE_VERSION_CHANGED',
      previous_total: 46,
      active_total: 46,
    });
  });

  it('proves a same-count legacy MGO replacement from distinct activation SHAs and enrollment start', async () => {
    const raw = JSON.stringify({
      'cmi.core.lesson_location': '46/46',
      'airtrust.total_slides': 46,
      'cmi.suspend_data': 'legacy cursor without a version',
    });
    const state = {
      previous_sha: 'a'.repeat(64), active_sha: 'b'.repeat(64),
      activated_at: '2026-10-09 19:30:00',
    };
    const first = vi.fn(async () => state);
    const db = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })),
    } as unknown as D1Database;
    const params = {
      ...base, bucket: bucket(46, false, 'mgo-rev15'),
      cmiJson: raw, db, enrollmentStartedAt: '2026-10-09 15:00:00',
    };
    expect(await detectLmsEditionMismatch(params)).toMatchObject({
      required: true, previous_total: 46, active_total: 46,
      reason: 'PACKAGE_SHA_CHANGED',
    });
    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(await detectLmsEditionMismatch({ ...params, enrollmentStartedAt: '2026-10-09 20:00:00' })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...params, enrollmentStartedAt: null })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...params, db: undefined })).toBeNull();
    state.previous_sha = state.active_sha;
    expect(await detectLmsEditionMismatch(params)).toBeNull();
  });

  it('retains an unchanged edition when packageVersion and totals match', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'mgo-rev15', a: 34 }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(46, false, 'mgo-rev15'),
    })).toBeNull();
  });
  it('detects different stable slide IDs even if total and packageVersion are unchanged', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '2/3',
      'cmi.suspend_data': JSON.stringify({ v: 5, p: 'same-name', ids: ['a', 'b', 'c'] }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(3, false, 'same-name', ['a', 'changed', 'c']),
    })).toEqual({
      required: true, previous_total: 3, active_total: 3, reason: 'SLIDE_IDS_CHANGED',
    });
  });
  it('does not treat a legacy cursor with no edition identity as proven changed', async () => {
    expect(await detectLmsEditionMismatch({
      ...base,
      cmiJson: JSON.stringify({ 'cmi.core.lesson_location': '35/46', 'cmi.suspend_data': '{bad' }),
      bucket: bucket(46, false, 'mgo-rev15'),
    })).toBeNull();
  });

});
