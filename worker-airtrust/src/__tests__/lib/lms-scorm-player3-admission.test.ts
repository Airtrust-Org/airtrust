import { describe, expect, it, vi } from 'vitest';
import { resolveScormPlayer3Admission } from '../../services/lms-scorm-player3-admission';
import type { Env } from '../../types';

const sha = 'a'.repeat(64), release = 'b'.repeat(40);
const prefix = 'lms/scorm/6/9/_candidates/edition-123/';
const manifest = {
  schemaVersion: 1, scormVersion: '1.2',
  courseId: 'airtrust-example', packageVersion: 'SCORE-V4',
  engineId: 'AIRTRUST_UNIFIED_SCORE_SCORM12_V1',
  content: { requiredSlides: ['one', 'two'] },
  assessment: { mode: 'EXTERNAL', scoringBySCORM: false, requiredInteractions: [] },
  completion: { passStatusFromSCORM: false, workerApprovalRequired: true },
};
const env = (extra: Record<string, unknown> = {}) => ({
  ENVIRONMENT: 'staging', AIRTRUST_SOURCE_SHA: release,
  SCORM_PLAYER3_STAGING_TENANTS: '6',
  SCORM_PLAYER3_STAGING_COURSES: '9',
  SCORM_PLAYER3_STAGING_PACKAGES: sha,
  SCORM_PLAYER3_STAGING_RELEASE_SHA: release,
  ...extra,
}) as unknown as Env;
const database = (row: unknown = {package_sha256: sha, r2_prefix: prefix}) =>
  ({prepare: vi.fn(() => ({bind: vi.fn(() => ({
    first: vi.fn(async () => row),
  }))}))}) as unknown as D1Database;
const bucket = (body: unknown = manifest) => ({
  get: vi.fn(async () => body == null ? null : { text: async () => JSON.stringify(body) }),
}) as unknown as R2Bucket;
const base = () => ({
  env: env(), db: database(), bucket: bucket(), tenant: 6, course: 9,
  scormVersion: '1.2', contentType: 'scorm',
  activePrefix: prefix, reviewedForProduction: false,
});

describe('Player 3 SCORM admission is separately scoped from Native or legacy', () => {
  it('admits an exact allowlisted ACTIVE Score edition solely for study', async () => {
    const result = await resolveScormPlayer3Admission(base());
    expect(result).toMatchObject({
      kind: 'SCORM_STUDY', packageSha256: sha, packageVersion: 'SCORE-V4',
      completionAuthorized: false, examAuthorized: false, certificateAuthorized: false,
    });
  });
  it('leaves existing noncandidate SCORM and SCORM 2004 on their prior route', async () => {
    const p = base();
    expect(await resolveScormPlayer3Admission({...p, activePrefix: null}))
      .toMatchObject({kind: 'LEGACY'});
    expect(await resolveScormPlayer3Admission({...p, scormVersion: '2004',activePrefix:null}))
      .toMatchObject({kind: 'LEGACY'});
    expect(vi.mocked(p.db.prepare)).not.toHaveBeenCalled();
  });
  it('rejects tenant/course mismatch, unknown active row and unavailable R2', async () => {
    const p = base();
    expect(await resolveScormPlayer3Admission({...p, tenant: 7}))
      .toMatchObject({kind: 'BLOCKED', reason: 'SCOPE_INVALID'});
    expect(await resolveScormPlayer3Admission({...p, scormVersion: null}))
      .toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
    expect(await resolveScormPlayer3Admission({...p, contentType: null}))
      .toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
    expect(await resolveScormPlayer3Admission({...p, scormVersion: '2004'}))
      .toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
    expect(await resolveScormPlayer3Admission({...p, db: database(null)}))
      .toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
    expect(await resolveScormPlayer3Admission({...p, bucket: bucket(null)}))
      .toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
  });
  it('does not silently admit a malformed or scored package as legacy', async () => {
    const p = base();
    expect(await resolveScormPlayer3Admission({...p,
      bucket: bucket({...manifest, assessment: {...manifest.assessment, mode: 'SCORED'}}),
    })).toMatchObject({kind: 'BLOCKED', reason: 'CANDIDATE_UNVERIFIED'});
  });
  it('respects default OFF and exact deployed-release/tenant/package flags', async () => {
    const p = base();
    for (const e of [
      env({SCORM_PLAYER3_STAGING_PACKAGES: undefined}),
      env({SCORM_PLAYER3_STAGING_TENANTS: '*'}),
      env({AIRTRUST_SOURCE_SHA: 'c'.repeat(40)}),
    ]) expect(await resolveScormPlayer3Admission({...p, env: e}))
      .toMatchObject({kind: 'BLOCKED', reason: 'PLAYER3_NOT_ENABLED'});
  });
  it('never enables an unreviewed production course', async () => {
    const p = base();
    const production = env({
      ENVIRONMENT: 'production',
      SCORM_PLAYER3_PRODUCTION_TENANTS: '6', SCORM_PLAYER3_PRODUCTION_COURSES: '9',
      SCORM_PLAYER3_PRODUCTION_PACKAGES: sha,
      SCORM_PLAYER3_PRODUCTION_RELEASE_SHA: release,
    });
    expect(await resolveScormPlayer3Admission({...p,env: production}))
      .toMatchObject({kind: 'BLOCKED',reason: 'PLAYER3_NOT_ENABLED'});
  });
});
