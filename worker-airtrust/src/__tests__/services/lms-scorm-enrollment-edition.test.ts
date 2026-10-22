import { describe, expect, it, vi } from 'vitest';
import { resolveScormEnrollmentEdition } from '../../services/lms-scorm-enrollment-edition';

const prefix = (version: string) => `lms/scorm/6/119/_candidates/${version}/`;
const row = (id: string, activated_at: string, status: string, suffix: string) => ({
  package_id: id, package_sha256: suffix.repeat(64).slice(0, 64),
  r2_prefix: prefix(id), launch_file: 'index.html', scorm_versao: '1.2',
  package_status: status, activated_at,
});

function dbWith(rows: ReturnType<typeof row>[], fail = false): D1Database {
  const all = vi.fn(async () => {
    if (fail) throw new Error('history unavailable');
    return { results: rows };
  });
  const bind = vi.fn(() => ({ all }));
  const prepare = vi.fn(() => ({ bind }));
  return { prepare } as unknown as D1Database;
}

const base = {
  empresaId: 6, cursoId: 119, db: dbWith([]),
  cycleStartedAt: '2026-10-08 10:00:00',
  currentPrefix: prefix('new'), currentLaunchFile: 'new.html', currentScormVersion: '1.2',
};

describe('SCORM edition bound to the enrollment cycle activation timeline', () => {
  it('keeps an existing cycle on its original package after a newer edition activates', async () => {
    const db = dbWith([
      row('new', '2026-10-10 12:00:00', 'ACTIVE', 'b'),
      row('old', '2026-10-01 09:00:00', 'SUPERSEDED', 'a'),
    ]);
    await expect(resolveScormEnrollmentEdition({ ...base, db })).resolves.toMatchObject({
      status: 'RESOLVED', packageId: 'old', r2Prefix: prefix('old'), launchFile: 'index.html',
    });
  });

  it('assigns a new cycle to the edition active at its start, not at first later login', async () => {
    const db = dbWith([
      row('new', '2026-10-10T12:00:00Z', 'ACTIVE', 'b'),
      row('old', '2026-10-01T09:00:00Z', 'SUPERSEDED', 'a'),
    ]);
    await expect(resolveScormEnrollmentEdition({
      ...base, db, cycleStartedAt: '2026-10-10T12:00:01Z',
    })).resolves.toMatchObject({ status: 'RESOLVED', packageId: 'new' });
  });

  it('fails closed when the cycle date or activation history cannot establish one edition', async () => {
    const db = dbWith([row('new', '2026-10-10 12:00:00', 'ACTIVE', 'b')]);
    await expect(resolveScormEnrollmentEdition({ ...base, db, cycleStartedAt: null }))
      .resolves.toEqual({ status: 'UNRESOLVED', reason: 'CYCLE_START_UNVERIFIED' });
    await expect(resolveScormEnrollmentEdition({ ...base, db, cycleStartedAt: '2026-09-30 00:00:00' }))
      .resolves.toEqual({ status: 'UNRESOLVED', reason: 'PACKAGE_NOT_ACTIVE_AT_CYCLE_START' });
    await expect(resolveScormEnrollmentEdition({
      ...base,
      db: dbWith([
        row('one', '2026-10-01 09:00:00', 'SUPERSEDED', 'a'),
        row('two', '2026-10-01 09:00:00', 'SUPERSEDED', 'b'),
      ]),
    })).resolves.toEqual({ status: 'UNRESOLVED', reason: 'PACKAGE_HISTORY_AMBIGUOUS' });
  });

  it('preserves flat legacy packages but never falls back from a versioned package without history', async () => {
    await expect(resolveScormEnrollmentEdition({
      ...base, db: dbWith([]), currentPrefix: 'lms/scorm/6/119/',
    })).resolves.toMatchObject({ status: 'LEGACY', r2Prefix: 'lms/scorm/6/119/' });
    await expect(resolveScormEnrollmentEdition({ ...base, db: dbWith([], true) }))
      .resolves.toEqual({ status: 'UNRESOLVED', reason: 'PACKAGE_HISTORY_UNAVAILABLE' });
  });

  it('does not read across tenant or course and accepts only a scoped package prefix', async () => {
    const db = dbWith([{
      ...row('foreign', '2026-10-01 09:00:00', 'ACTIVE', 'a'),
      r2_prefix: 'lms/scorm/7/119/_candidates/foreign/',
    }]);
    await expect(resolveScormEnrollmentEdition({ ...base, db })).resolves.toEqual({
      status: 'UNRESOLVED', reason: 'PACKAGE_METADATA_INVALID',
    });
  });
});
