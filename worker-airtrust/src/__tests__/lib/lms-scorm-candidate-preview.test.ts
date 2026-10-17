import { describe, expect, it } from 'vitest';
import {
  assertCandidateQaScope,
  assertScormCandidateQaEnvironment,
  readScormQaCandidate,
  type ScormQaCandidate,
} from '../../lib/lms/lms-scorm-candidate-preview';

const id = 'a19345e1-314a-428b-9446-bafab7ccf112';
const sha = 'a'.repeat(64);
const prefix = `lms/scorm/6/15/_candidates/${id}/`;
const candidate: ScormQaCandidate = {
  id, empresa_id: 6, curso_id: 15, package_sha256: sha,
  r2_prefix: prefix, launch_file: 'index.html', scorm_versao: '1.2',
  status: 'VALIDATED', active_prefix: 'lms/scorm/6/15/_candidates/another/',
};
function fakeDb(row: ScormQaCandidate | null) {
  const bound: unknown[][] = [];
  return {
    bound,
    db: {
      prepare: (sql: string) => {
        expect(sql).toContain('p.empresa_id = ?');
        expect(sql).toContain('p.curso_id = ?');
        return { bind: (...args: unknown[]) => {
          bound.push(args);
          return { first: async () => row };
        } };
      },
    } as unknown as D1Database,
  };
}
describe('staging-only inactive SCORM candidate lookup', () => {
  it('accepts staging and development, refuses production and unknown', () => {
    expect(() => assertScormCandidateQaEnvironment('staging')).not.toThrow();
    expect(() => assertScormCandidateQaEnvironment('development')).not.toThrow();
    for (const env of ['production', undefined, 'preview', '']) {
      expect(() => assertScormCandidateQaEnvironment(env)).toThrow();
    }
  });
  it('binds tenant+course+candidate+exact SHA without modifying DB', async () => {
    const { db, bound } = fakeDb(candidate);
    const actual = await readScormQaCandidate(db, {
      empresaId: 6, cursoId: 15, packageId: id, expectedSha: sha,
    });
    expect(actual).toEqual(candidate);
    expect(bound).toEqual([[id,6,15]]);
  });
  it('rejects absent, active, rejected, prefix-invalid or hash-mismatched candidates', async () => {
    const args = { empresaId: 6, cursoId: 15, packageId: id, expectedSha: sha };
    for (const row of [
      null,
      { ...candidate, status:'REJECTED' },
      { ...candidate, status:'ACTIVE' },
      { ...candidate, active_prefix:prefix },
      { ...candidate, r2_prefix:'lms/scorm/5/15/_candidates/'+id+'/' },
      { ...candidate, package_sha256:'b'.repeat(64) },
      { ...candidate, launch_file:'../secret.html' },
    ]) {
      await expect(readScormQaCandidate(fakeDb(row).db, args)).rejects.toThrow();
    }
  });
  it('refuses unscoped/mismatched QA tokens and accepts only exact identity', () => {
    const args = { empresaId:6,cursoId:15,candidate };
    const valid = {
      token_type:'lms_asset', asset_scope:'course_assets',
      asset_preview:true, asset_curso_id:15,
      asset_qa_candidate_id:id, asset_qa_candidate_sha256:sha, empresa_id:6,
    };
    expect(() => assertCandidateQaScope(valid,args)).not.toThrow();
    for (const changed of [
      {token_type:'access'}, {asset_preview:false}, {asset_curso_id:41},
      {asset_qa_candidate_id:'different'}, {asset_qa_candidate_sha256:'b'.repeat(64)},
      {empresa_id:5}, {asset_scope:'pptx_viewer'},
    ]) {
      expect(() => assertCandidateQaScope({...valid,...changed},args)).toThrow();
    }
  });
  it('refuses invalid candidate ID and SHA without querying the backend', async () => {
    const db = fakeDb(candidate);
    await expect(readScormQaCandidate(db.db,{empresaId:6,cursoId:15,
      packageId:'../evil',expectedSha:sha})).rejects.toThrow();
    await expect(readScormQaCandidate(db.db,{empresaId:6,cursoId:15,
      packageId:id,expectedSha:'not-a-sha'})).rejects.toThrow();
    expect(db.bound).toHaveLength(0);
  });
});
