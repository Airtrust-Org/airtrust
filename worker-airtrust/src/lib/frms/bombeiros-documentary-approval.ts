/**
 * BOA QA documentary release guard. A persisted ACTIVE profile is never, by
 * itself, evidence of scientific review or permission to capture health data.
 * These are independent operator-held bindings, not a signature verifier.
 * This function never writes, fetches external data or approves dispatch.
 */
import type { FrmsRegulatoryProfileEvidence, FrmsConfigRevision } from './parameter-governance';

export interface BoaDocumentaryBindings {
  BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256?: string;
  BOA_FRMS_QA_REVIEWED_REVISION_ID?: string;
  BOA_FRMS_QA_REVIEWED_EXPIRES_AT?: string;
}
export function hasBoaQaDocumentaryReleaseBinding(
  evidence: FrmsRegulatoryProfileEvidence,
  revision: Readonly<FrmsConfigRevision>,
  env: BoaDocumentaryBindings,
): boolean {
  const approvedHash = env.BOA_FRMS_QA_REVIEWED_DOCUMENT_SHA256;
  const approvedRevision = env.BOA_FRMS_QA_REVIEWED_REVISION_ID;
  // The independent QA documentary grant must be short-lived and UTC-pinned.
  const expiry = env.BOA_FRMS_QA_REVIEWED_EXPIRES_AT;
  const expiresAt = typeof expiry === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(expiry)
    ? Date.parse(expiry) : NaN;
  const remainingMs = expiresAt - Date.now();
  const documentHash = evidence.sourceDocumentHash;
  const reference = evidence.approvalReference?.trim();
  const version = evidence.policyVersion?.trim();
  const category = evidence.serviceCategory?.trim();
  const sourceReference = revision.source_reference?.trim();
  return Boolean(
    Number.isFinite(remainingMs) && remainingMs > 0 && remainingMs <= 24 * 60 * 60 * 1000
    && evidence.empresaId > 0 && evidence.empresaId !== 6
    && evidence.profileCode === 'FIREFIGHTER_AVIATION'
    && revision.status === 'ACTIVE'
    && typeof approvedHash === 'string' && /^[a-f0-9]{64}$/.test(approvedHash)
    && typeof documentHash === 'string' && documentHash === approvedHash
    && typeof approvedRevision === 'string' && approvedRevision.length > 0
    && approvedRevision === revision.id
    && typeof reference === 'string' && reference.length >= 8
    && typeof category === 'string' && category.length >= 4
    && typeof version === 'string' && version.length > 0
    && version === revision.policy_version
    && revision.regulatory_profile_id === evidence.regulatoryProfileId
    && revision.profile_code === evidence.profileCode
    && revision.empresa_id === evidence.empresaId
    && revision.source_type === 'APPROVED_OPERATIONAL_POLICY'
    && typeof sourceReference === 'string' && sourceReference.length >= 8
  );
}
