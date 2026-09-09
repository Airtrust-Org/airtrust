import type { Env } from '../../types';
import { isEdbShadowPilotEnabledForTenant } from '../../lib/edb/edb-shadow-pilot-flag';
import {
  EdbShadowPreviewError,
  loadEdbShadowPreview,
} from '../edb/control-flight-shadow-preview';
import { loadEdbShadowPreliminaryAssessment } from '../edb/control-flight-shadow-assessment';

export const PILOT_OFFLINE_EDB_SHADOW_CONTRACT = 'airtrust-pilot-edb-shadow' as const;

export type PilotOfflineEdbShadowState =
  | 'DISABLED'
  | 'AVAILABLE'
  | 'AVAILABLE_PARTIAL'
  | 'UNAVAILABLE';

export interface PilotOfflineEdbShadowPackage {
  contract: {
    name: typeof PILOT_OFFLINE_EDB_SHADOW_CONTRACT;
    version: 1;
    classification: 'NON_OFFICIAL_SHADOW';
    official_logbook: false;
    replaces_paper: false;
    contains_signature: false;
    persists_regulated_record: false;
    authorizes_return_to_service: false;
  };
  state: PilotOfflineEdbShadowState;
  generated_at: string;
  reason: string | null;
  preview: null | {
    status: string;
    schema_version: string;
    draft: unknown;
    findings: Array<{ code: string; path: string }>;
    field_sources: unknown[];
  };
  assessment: null | {
    schema_version: string;
    classification: string;
    official_reference_compared: false;
    paper_reference_required: true;
    readiness: unknown;
    recommendation: string;
    max_severity: string;
    technical_status: unknown;
  };
}

function baseContract(): PilotOfflineEdbShadowPackage['contract'] {
  return {
    name: PILOT_OFFLINE_EDB_SHADOW_CONTRACT,
    version: 1,
    classification: 'NON_OFFICIAL_SHADOW',
    official_logbook: false,
    replaces_paper: false,
    contains_signature: false,
    persists_regulated_record: false,
    authorizes_return_to_service: false,
  };
}

function previewReason(error: unknown): string {
  if (error instanceof EdbShadowPreviewError) {
    return `SHADOW_PREVIEW_${error.code}`;
  }
  return 'SHADOW_PROJECTION_UNAVAILABLE';
}

/**
 * Builds an optional eDB shadow projection for the already-authorized Pilot
 * offline package.
 *
 * This adapter never changes eDB RBAC, never writes eDB state and never
 * creates signatures. The feature remains staging-only and tenant-allowlisted
 * through the canonical eDB shadow pilot flag.
 */
export async function loadPilotOfflineEdbShadow(options: {
  env: Env;
  tenantId: number;
  flightId: number;
  generatedAt: string;
}): Promise<PilotOfflineEdbShadowPackage> {
  const contract = baseContract();

  if (!isEdbShadowPilotEnabledForTenant(options.env, options.tenantId)) {
    return {
      contract,
      state: 'DISABLED',
      generated_at: options.generatedAt,
      reason: 'SHADOW_PILOT_DISABLED',
      preview: null,
      assessment: null,
    };
  }

  let preview;
  try {
    preview = await loadEdbShadowPreview(
      options.env.DB,
      options.tenantId,
      options.flightId,
      { createdAt: options.generatedAt },
    );
  } catch (error) {
    return {
      contract,
      state: 'UNAVAILABLE',
      generated_at: options.generatedAt,
      reason: previewReason(error),
      preview: null,
      assessment: null,
    };
  }

  const sanitizedPreview = {
    status: preview.draft.status,
    schema_version: preview.draft.schemaVersion,
    draft: preview.draft,
    findings: preview.findings.map((finding) => ({
      code: finding.code,
      path: finding.path,
    })),
    field_sources: preview.fieldSources,
  };

  try {
    const assessment = await loadEdbShadowPreliminaryAssessment(
      options.env.DB,
      options.tenantId,
      options.flightId,
    );
    return {
      contract,
      state: 'AVAILABLE',
      generated_at: options.generatedAt,
      reason: null,
      preview: sanitizedPreview,
      assessment: {
        schema_version: assessment.schemaVersion,
        classification: assessment.classification,
        official_reference_compared: assessment.officialReferenceCompared,
        paper_reference_required: assessment.paperReferenceRequired,
        readiness: assessment.divergence.readiness,
        recommendation: assessment.divergence.recommendation,
        max_severity: assessment.divergence.maxSeverity,
        technical_status: assessment.technicalStatus,
      },
    };
  } catch {
    return {
      contract,
      state: 'AVAILABLE_PARTIAL',
      generated_at: options.generatedAt,
      reason: 'SHADOW_ASSESSMENT_UNAVAILABLE',
      preview: sanitizedPreview,
      assessment: null,
    };
  }
}
