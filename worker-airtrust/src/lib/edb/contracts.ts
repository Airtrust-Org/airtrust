export const EDB_CONTRACT_VERSION = 'edb.regulatory.v1' as const;

export type EdbContractVersion = typeof EDB_CONTRACT_VERSION;

export type EdbLifecycleStatus =
  | 'DRAFT'
  | 'READY_FOR_PIC_SIGNATURE'
  | 'PIC_SIGNED'
  | 'OPERATOR_SIGNED'
  | 'SUPERSEDED'
  | 'CANCELLED';

export type EdbOperatorRegulation = 'RBAC121' | 'RBAC135' | 'OTHER';

export type EdbCrewRole = 'PIC' | 'SIC' | 'COM' | 'MEC' | 'OTHER';

export type EdbSignatureType =
  | 'PIC_TECHNICAL_ACK'
  | 'PIC_FLIGHT_RECORD'
  | 'OPERATOR_RECORD';

export type EdbSignatureTargetType = 'TECHNICAL_SITUATION' | 'FINAL_RECORD_REVISION';

export type EdbSignatureMethod =
  | 'ASYMMETRIC_DIGITAL_SIGNATURE'
  | 'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE';

export interface EdbPersonIdentity {
  employeeId: number | null;
  fullName: string;
  anacCode: string | null;
}

export interface EdbCrewMember extends EdbPersonIdentity {
  operationalRole: EdbCrewRole;
  /**
   * Reserved for the function code required by the current ANAC DBE interface.
   * It must not be inferred from the AirTrust operational role until the
   * applicable ANAC contract is confirmed.
   */
  regulatoryFunctionCode: string | null;
}

export interface EdbAircraftIdentity {
  /** AirTrust/company master-data identifier. */
  aircraftId: number | null;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  /** Combined nationality/registration marks as controlled by the operator. */
  registrationMarks: string | null;
  owners: string[] | null;
  operators: string[] | null;
}

export interface EdbDiaryIdentity {
  operatorCompanyId: number;
  operatorRegulation: EdbOperatorRegulation;
  aircraft: EdbAircraftIdentity;
}

export interface EdbMaintenanceIntervention {
  type: string | null;
  date: string | null;
  returnToServiceApprovedBy: string | null;
}

export interface EdbNextMaintenanceIntervention {
  type: string | null;
  dueAtAirframeHours: number | null;
}

export interface EdbMaintenanceSnapshot {
  lastIntervention: EdbMaintenanceIntervention;
  nextIntervention: EdbNextMaintenanceIntervention;
}

export interface EdbTechnicalDiscrepancy {
  description: string;
  detectedBy: EdbPersonIdentity;
}

export interface EdbFlightTimes {
  engineStartAt: string | null;
  takeoffAt: string | null;
  landingAt: string | null;
  engineShutdownAt: string | null;
}

export interface EdbFlightDuration {
  dayMinutes: number | null;
  nightMinutes: number | null;
  totalMinutes: number | null;
  ifrActualMinutes: number | null;
  ifrSimulatedMinutes: number | null;
}

export interface EdbFlightData {
  date: string | null;
  origin: string | null;
  destination: string | null;
  times: EdbFlightTimes;
  landingsTotal: number | null;
  cycles: number | null;
  duration: EdbFlightDuration;
  fuelBeforeEngineStart: number | null;
  personsOnBoard: number | null;
  cargoKg: number | null;
  nature: string | null;
  /** null = not recorded yet; [] = explicitly no occurrence. */
  occurrences: string[] | null;
  /** null = not recorded yet; [] = explicitly no technical discrepancy. */
  technicalDiscrepancies: EdbTechnicalDiscrepancy[] | null;
  crew: EdbCrewMember[];
}

export interface EdbSignatureProof {
  signatureId: string;
  type: EdbSignatureType;
  /**
   * Exact immutable object selected during the signing ceremony. Ceremony-
   * produced and persisted proofs must carry both fields. They remain optional
   * temporarily so historical fixtures that predate target binding can still
   * be migrated without pretending they are production-grade evidence.
   */
  targetType?: EdbSignatureTargetType;
  targetId?: string;
  signer: EdbPersonIdentity;
  signedAt: string;
  canonicalPayloadHashSha256: string;
  method: EdbSignatureMethod;
  /** Reference to the cryptographic proof/certificate material, never a private key. */
  proofReference: string;
}

export interface EdbSignatures {
  /**
   * Evidence imported from the independent preflight technical-awareness flow.
   * It is not created as a lifecycle state of the final postflight record.
   */
  picTechnicalAcknowledgement: EdbSignatureProof | null;
  picFlightRecord: EdbSignatureProof | null;
  operatorRecord: EdbSignatureProof | null;
}

export interface EdbSourceProvenance {
  sourceSystem: 'AIRTRUST';
  sourceType: 'CONTROLE_VOOS_RDV';
  sourceFlightId: number;
  sourceRdvId: number | null;
  sourceRdvVersion: number | null;
  sourceStageId: number | null;
  capturedAt: string;
}

export interface EdbCorrectionMetadata {
  revision: number;
  supersedesRevisionId: string | null;
  correctionReason: string | null;
}

/**
 * Regulatory record contract only. `logicalRecordId` identifies the same
 * flight/stage across corrections; `revisionId` identifies exactly one
 * immutable revision and is the target of final-record signatures.
 * Presence of this structure does not mean that a record is ANAC-authorized,
 * signed, transmitted or homologated.
 */
export interface EdbFlightRecord {
  contractVersion: EdbContractVersion;
  logicalRecordId: string | null;
  revisionId: string | null;
  status: EdbLifecycleStatus;
  identity: EdbDiaryIdentity;
  flight: EdbFlightData;
  maintenance: EdbMaintenanceSnapshot;
  signatures: EdbSignatures;
  correction: EdbCorrectionMetadata;
  source: EdbSourceProvenance;
}

export function createEmptyEdbFlightRecord(params: {
  operatorCompanyId: number;
  operatorRegulation: EdbOperatorRegulation;
  sourceFlightId: number;
  sourceRdvId?: number | null;
  sourceRdvVersion?: number | null;
  sourceStageId?: number | null;
  capturedAt: string;
  logicalRecordId?: string | null;
  revisionId?: string | null;
}): EdbFlightRecord {
  return {
    contractVersion: EDB_CONTRACT_VERSION,
    logicalRecordId: params.logicalRecordId ?? null,
    revisionId: params.revisionId ?? null,
    status: 'DRAFT',
    identity: {
      operatorCompanyId: params.operatorCompanyId,
      operatorRegulation: params.operatorRegulation,
      aircraft: {
        aircraftId: null,
        manufacturer: null,
        model: null,
        serialNumber: null,
        registrationMarks: null,
        owners: null,
        operators: null,
      },
    },
    flight: {
      date: null,
      origin: null,
      destination: null,
      times: {
        engineStartAt: null,
        takeoffAt: null,
        landingAt: null,
        engineShutdownAt: null,
      },
      landingsTotal: null,
      cycles: null,
      duration: {
        dayMinutes: null,
        nightMinutes: null,
        totalMinutes: null,
        ifrActualMinutes: null,
        ifrSimulatedMinutes: null,
      },
      fuelBeforeEngineStart: null,
      personsOnBoard: null,
      cargoKg: null,
      nature: null,
      occurrences: null,
      technicalDiscrepancies: null,
      crew: [],
    },
    maintenance: {
      lastIntervention: {
        type: null,
        date: null,
        returnToServiceApprovedBy: null,
      },
      nextIntervention: {
        type: null,
        dueAtAirframeHours: null,
      },
    },
    signatures: {
      picTechnicalAcknowledgement: null,
      picFlightRecord: null,
      operatorRecord: null,
    },
    correction: {
      revision: 1,
      supersedesRevisionId: null,
      correctionReason: null,
    },
    source: {
      sourceSystem: 'AIRTRUST',
      sourceType: 'CONTROLE_VOOS_RDV',
      sourceFlightId: params.sourceFlightId,
      sourceRdvId: params.sourceRdvId ?? null,
      sourceRdvVersion: params.sourceRdvVersion ?? null,
      sourceStageId: params.sourceStageId ?? null,
      capturedAt: params.capturedAt,
    },
  };
}
