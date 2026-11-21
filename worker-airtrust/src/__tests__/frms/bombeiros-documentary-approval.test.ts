import { describe, expect, it } from 'vitest';
import { hasBoaQaDocumentaryReleaseBinding } from '../../lib/frms/bombeiros-documentary-approval';
import type { FrmsRegulatoryProfileEvidence, FrmsConfigRevision } from '../../lib/frms/parameter-governance';

const evidence: FrmsRegulatoryProfileEvidence = {
  empresaId: 130,
  profileCode: 'FIREFIGHTER_AVIATION',
  regulatoryProfileId: 'qa-profile-only',
  serviceCategory: 'QA_FIREFIGHTER_TEST',
  approvalReference: 'QA-SYNTHETIC-REVIEW-ONLY',
  policyVersion: 'QA-UNAPPROVED-V1',
  limitsJson: '{}',
  sourceDocumentHash: 'a'.repeat(64),
};
const revision: FrmsConfigRevision = {
  id: 'qa-revision-1',
  empresa_id: 130,
  profile_code: 'FIREFIGHTER_AVIATION',
  revision_number: 1,
  status: 'ACTIVE',
  source_type: 'APPROVED_OPERATIONAL_POLICY',
  source_reference: 'QA-SYNTHETIC-SOURCE-NOT-REAL',
  regulatory_profile_id: 'qa-profile-only',
  policy_version: 'QA-UNAPPROVED-V1',
  effective_from: '2020-01-01',
  effective_to: null,
  actor_user_id: null,
  reason: 'Fictitious unit test',
  supersedes_revision_id: null,
  created_at: '2020-01-01',
};
const binding = {
  BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256: 'a'.repeat(64),
  BOA_FRMS_QA_REVIEWED_REVISION_ID: 'qa-revision-1',
  BOA_FRMS_QA_REVIEWED_EXPIRES_AT: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};
describe('BOA documentary QA write binding — fail closed', () => {
  it('blocks when operator did not independently bind document + revision', () => {
    expect(hasBoaQaDocumentaryReleaseBinding(evidence, revision, {})).toBe(false);
    expect(hasBoaQaDocumentaryReleaseBinding(evidence, revision, {
      BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256: binding.BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256,
    })).toBe(false);
    expect(hasBoaQaDocumentaryReleaseBinding(evidence, revision, {
      BOA_FRMS_QA_REVIEWED_REVISION_ID: binding.BOA_FRMS_QA_REVIEWED_REVISION_ID,
    })).toBe(false);
  });
  it('requires binding to the exact full digest and current revision', () => {
    expect(hasBoaQaDocumentaryReleaseBinding(evidence,revision,{
      ...binding,BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256:'b'.repeat(64),
    })).toBe(false);
    expect(hasBoaQaDocumentaryReleaseBinding(evidence,revision,{
      ...binding,BOA_FRMS_QA_REVIEWED_REVISION_ID:'qa-other-revision',
    })).toBe(false);
    expect(hasBoaQaDocumentaryReleaseBinding({...evidence,sourceDocumentHash:'not-sha256'},revision,binding)).toBe(false);
  });
  it('blocks missing documentary reference, version, profile ownership or approved source type', () => {
    for (const candidate of [
      {...evidence,approvalReference:null},
      {...evidence,serviceCategory:null},
      {...evidence,policyVersion:null},
      {...evidence,policyVersion:'QA-OTHER'},
      {...evidence,empresaId:6},
      {...evidence,regulatoryProfileId:'other-profile'},
    ]) expect(hasBoaQaDocumentaryReleaseBinding(candidate,revision,binding)).toBe(false);
    for (const candidate of [
      {...revision,source_type:'QA_UNAPPROVED'},
      {...revision,source_reference:null},
      {...revision,regulatory_profile_id:'other-profile'},
      {...revision,empresa_id:null},
      {...revision,profile_code:'HELICOPTER_OFFSHORE'},
    ]) expect(hasBoaQaDocumentaryReleaseBinding(evidence,candidate,binding)).toBe(false);
  });
  it('requires a live UTC lease no longer than 24h and an ACTIVE BOA revision', () => {
    for (const expiresAt of [undefined, '', 'not-a-timestamp',
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
    ]) {
      expect(hasBoaQaDocumentaryReleaseBinding(evidence, revision, {
        ...binding, BOA_FRMS_QA_REVIEWED_EXPIRES_AT: expiresAt,
      })).toBe(false);
    }
    for (const status of ['DRAFT', 'SUPERSEDED', 'RETIRED'] as const) {
      expect(hasBoaQaDocumentaryReleaseBinding(evidence, { ...revision, status }, binding)).toBe(false);
    }
    expect(hasBoaQaDocumentaryReleaseBinding({ ...evidence, profileCode: 'HELICOPTER_OFFSHORE' }, revision, binding)).toBe(false);
    expect(hasBoaQaDocumentaryReleaseBinding(evidence, revision, binding)).toBe(true);
  });
  it('matching data is ONLY a technical grant check, not clinical certification', () => {
    expect(hasBoaQaDocumentaryReleaseBinding(evidence,revision,binding)).toBe(true);
    expect(evidence.approvalReference).toContain('SYNTHETIC');
    expect(revision.reason).toContain('Fictitious');
  });
});
