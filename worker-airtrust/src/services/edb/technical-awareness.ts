import { canonicalJson, sha256Hex } from './canonicalization';
import type {
  EdbAircraftIdentity,
  EdbMaintenanceSnapshot,
  EdbSignatureProof,
} from './contracts';

export interface EdbTechnicalSituationSnapshot {
  snapshotId: string;
  operatorCompanyId: number;
  sourceFlightId: number;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot;
  capturedAt: string;
  technicalContentSha256: string;
  canonicalSnapshotSha256: string;
}

export interface EdbPicTechnicalAcknowledgement {
  acknowledgementId: string;
  technicalSituationId: string;
  operatorCompanyId: number;
  sourceFlightId: number;
  signature: EdbSignatureProof;
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

function cloneAircraft(aircraft: EdbAircraftIdentity): EdbAircraftIdentity {
  return {
    ...aircraft,
    owners: aircraft.owners ? [...aircraft.owners] : null,
    operators: aircraft.operators ? [...aircraft.operators] : null,
  };
}

function cloneMaintenance(maintenance: EdbMaintenanceSnapshot): EdbMaintenanceSnapshot {
  return {
    lastIntervention: { ...maintenance.lastIntervention },
    nextIntervention: { ...maintenance.nextIntervention },
  };
}

export function buildTechnicalSituationContent(params: {
  operatorCompanyId: number;
  sourceFlightId: number;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot;
}): unknown {
  return {
    operatorCompanyId: params.operatorCompanyId,
    sourceFlightId: params.sourceFlightId,
    aircraft: params.aircraft,
    maintenance: params.maintenance,
  };
}

export async function hashTechnicalSituationContent(params: {
  operatorCompanyId: number;
  sourceFlightId: number;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot;
}): Promise<string> {
  return sha256Hex(canonicalJson(buildTechnicalSituationContent(params)));
}

export async function createTechnicalSituationSnapshot(params: {
  snapshotId: string;
  operatorCompanyId: number;
  sourceFlightId: number;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot;
  capturedAt: string;
}): Promise<EdbTechnicalSituationSnapshot> {
  const snapshotId = requireText(params.snapshotId, 'snapshotId');
  const capturedAt = requireTimestamp(params.capturedAt, 'capturedAt');
  const aircraft = cloneAircraft(params.aircraft);
  const maintenance = cloneMaintenance(params.maintenance);
  const technicalContentSha256 = await hashTechnicalSituationContent({
    operatorCompanyId: params.operatorCompanyId,
    sourceFlightId: params.sourceFlightId,
    aircraft,
    maintenance,
  });

  const signableSnapshot = {
    snapshotId,
    operatorCompanyId: params.operatorCompanyId,
    sourceFlightId: params.sourceFlightId,
    aircraft,
    maintenance,
    capturedAt,
    technicalContentSha256,
  };
  const canonicalSnapshotSha256 = await sha256Hex(canonicalJson(signableSnapshot));

  return {
    ...signableSnapshot,
    canonicalSnapshotSha256,
  };
}

export function bindPicTechnicalAcknowledgement(params: {
  acknowledgementId: string;
  snapshot: EdbTechnicalSituationSnapshot;
  signature: EdbSignatureProof;
}): EdbPicTechnicalAcknowledgement {
  if (params.signature.type !== 'PIC_TECHNICAL_ACK') {
    throw new Error('EDB_TECHNICAL_ACK_SIGNATURE_TYPE_INVALID');
  }
  if (params.signature.canonicalPayloadHashSha256 !== params.snapshot.canonicalSnapshotSha256) {
    throw new Error('EDB_TECHNICAL_ACK_HASH_MISMATCH');
  }
  if (Date.parse(params.signature.signedAt) < Date.parse(params.snapshot.capturedAt)) {
    throw new Error('EDB_TECHNICAL_ACK_PREDATES_SNAPSHOT');
  }

  return {
    acknowledgementId: requireText(params.acknowledgementId, 'acknowledgementId'),
    technicalSituationId: params.snapshot.snapshotId,
    operatorCompanyId: params.snapshot.operatorCompanyId,
    sourceFlightId: params.snapshot.sourceFlightId,
    signature: {
      ...params.signature,
      signer: { ...params.signature.signer },
    },
  };
}

export async function technicalSituationMatches(params: {
  snapshot: EdbTechnicalSituationSnapshot;
  operatorCompanyId: number;
  sourceFlightId: number;
  aircraft: EdbAircraftIdentity;
  maintenance: EdbMaintenanceSnapshot;
}): Promise<boolean> {
  if (
    params.snapshot.operatorCompanyId !== params.operatorCompanyId ||
    params.snapshot.sourceFlightId !== params.sourceFlightId
  ) {
    return false;
  }

  const currentHash = await hashTechnicalSituationContent({
    operatorCompanyId: params.operatorCompanyId,
    sourceFlightId: params.sourceFlightId,
    aircraft: params.aircraft,
    maintenance: params.maintenance,
  });
  return currentHash === params.snapshot.technicalContentSha256;
}
