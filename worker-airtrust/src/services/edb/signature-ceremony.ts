import type {
  EdbPersonIdentity,
  EdbSignatureMethod,
  EdbSignatureProof,
  EdbSignatureTargetType,
  EdbSignatureType,
} from './contracts';

export type EdbSignerAuthenticationMethod =
  | 'UNIQUE_CREDENTIALS_PLUS_MFA'
  | 'DIGITAL_CERTIFICATE'
  | 'EXTERNAL_IDENTITY_PROVIDER';

export interface EdbSignerAuthenticationEvidence {
  subjectId: string;
  method: EdbSignerAuthenticationMethod;
  authenticatedAt: string;
  evidenceReference: string;
}

export interface EdbSignatureCeremony {
  ceremonyId: string;
  targetType: EdbSignatureTargetType;
  targetId: string;
  signatureType: EdbSignatureType;
  signer: EdbPersonIdentity;
  payloadHashSha256: string;
  intentStatement: string;
  contentReviewedAt: string;
  authentication: EdbSignerAuthenticationEvidence;
  createdAt: string;
  expiresAt: string;
}

export interface EdbExternalSignatureResult {
  ceremonyId: string;
  signerSubjectId: string;
  payloadHashSha256: string;
  signedAt: string;
  method: EdbSignatureMethod;
  proofReference: string;
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function requireTimestamp(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new Error(`${field} must be a valid timestamp`);
  return normalized;
}

function requireHash(value: string, field: string): string {
  const normalized = requireText(value, field);
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${field} must be a lowercase SHA-256 hex digest`);
  return normalized;
}

function assertTargetMatchesSignatureType(
  signatureType: EdbSignatureType,
  targetType: EdbSignatureTargetType,
): void {
  if (signatureType === 'PIC_TECHNICAL_ACK' && targetType !== 'TECHNICAL_SITUATION') {
    throw new Error('PIC_TECHNICAL_ACK must target a technical situation');
  }
  if (signatureType !== 'PIC_TECHNICAL_ACK' && targetType !== 'FINAL_RECORD_REVISION') {
    throw new Error(`${signatureType} must target a final record revision`);
  }
}

/**
 * Creates only the evidence package for a deliberate signing ceremony.
 * Preflight acknowledgement targets a technical-situation snapshot; postflight
 * signatures target the immutable final-record revision. The ceremony does not
 * create a legal signature by itself.
 */
export function createEdbSignatureCeremony(params: {
  ceremonyId: string;
  targetType: EdbSignatureTargetType;
  targetId: string;
  signatureType: EdbSignatureType;
  signer: EdbPersonIdentity;
  payloadHashSha256: string;
  intentStatement: string;
  contentReviewedAt: string;
  authentication: EdbSignerAuthenticationEvidence;
  createdAt: string;
  expiresAt: string;
}): EdbSignatureCeremony {
  const createdAt = requireTimestamp(params.createdAt, 'createdAt');
  const expiresAt = requireTimestamp(params.expiresAt, 'expiresAt');
  const contentReviewedAt = requireTimestamp(params.contentReviewedAt, 'contentReviewedAt');
  const authenticatedAt = requireTimestamp(params.authentication.authenticatedAt, 'authentication.authenticatedAt');
  assertTargetMatchesSignatureType(params.signatureType, params.targetType);

  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error('expiresAt must be after createdAt');
  if (Date.parse(contentReviewedAt) > Date.parse(createdAt)) {
    throw new Error('contentReviewedAt cannot be after ceremony creation');
  }
  if (Date.parse(authenticatedAt) > Date.parse(createdAt)) {
    throw new Error('authentication cannot occur after ceremony creation');
  }

  return {
    ceremonyId: requireText(params.ceremonyId, 'ceremonyId'),
    targetType: params.targetType,
    targetId: requireText(params.targetId, 'targetId'),
    signatureType: params.signatureType,
    signer: {
      ...params.signer,
      fullName: requireText(params.signer.fullName, 'signer.fullName'),
    },
    payloadHashSha256: requireHash(params.payloadHashSha256, 'payloadHashSha256'),
    intentStatement: requireText(params.intentStatement, 'intentStatement'),
    contentReviewedAt,
    authentication: {
      ...params.authentication,
      subjectId: requireText(params.authentication.subjectId, 'authentication.subjectId'),
      authenticatedAt,
      evidenceReference: requireText(params.authentication.evidenceReference, 'authentication.evidenceReference'),
    },
    createdAt,
    expiresAt,
  };
}

/**
 * Converts an external cryptographic result into the AirTrust signature-proof
 * contract only when it is bound to the same ceremony, signer and payload.
 * The exact immutable target selected during the ceremony is retained in the
 * final proof and must be checked again by persistence.
 */
export function finalizeEdbSignatureCeremony(
  ceremony: EdbSignatureCeremony,
  result: EdbExternalSignatureResult,
  now = new Date(),
): EdbSignatureProof {
  if (now.getTime() > Date.parse(ceremony.expiresAt)) throw new Error('Signature ceremony expired');
  if (result.ceremonyId !== ceremony.ceremonyId) throw new Error('Signature result ceremony mismatch');
  if (result.signerSubjectId !== ceremony.authentication.subjectId) {
    throw new Error('Signature result signer mismatch');
  }
  if (requireHash(result.payloadHashSha256, 'result.payloadHashSha256') !== ceremony.payloadHashSha256) {
    throw new Error('Signature result payload hash mismatch');
  }

  const signedAt = requireTimestamp(result.signedAt, 'result.signedAt');
  if (Date.parse(signedAt) < Date.parse(ceremony.createdAt)) {
    throw new Error('Signature cannot predate ceremony creation');
  }
  if (Date.parse(signedAt) > Date.parse(ceremony.expiresAt)) {
    throw new Error('Signature cannot occur after ceremony expiration');
  }

  return {
    signatureId: `${ceremony.ceremonyId}:${ceremony.signatureType}`,
    type: ceremony.signatureType,
    targetType: ceremony.targetType,
    targetId: ceremony.targetId,
    signer: { ...ceremony.signer },
    signedAt,
    canonicalPayloadHashSha256: ceremony.payloadHashSha256,
    method: result.method,
    proofReference: requireText(result.proofReference, 'result.proofReference'),
  };
}

export function isEdbSignatureCeremonyFresh(
  ceremony: EdbSignatureCeremony,
  at = new Date(),
): boolean {
  const timestamp = at.getTime();
  return timestamp >= Date.parse(ceremony.createdAt) && timestamp <= Date.parse(ceremony.expiresAt);
}
