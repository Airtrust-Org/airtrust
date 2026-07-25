export const REMEDIATION_PLAN_SCHEMA_VERSION: number;
export const EXPECTED_MAPPING_COUNT: number;
export const EXPECTED_MODEL_COUNT: number;
export const EXPECTED_LINK_COUNT: number;
export const EXPECTED_LINKS_PER_MODEL: number;

export type RemediationMappingResolution = {
  codigo_canonico: string;
  wrong_manobra_id: number;
  correct_manobra_id: number;
};

export function buildRemediationFingerprint(input: {
  empresaId: number;
  versaoMatriz: string;
  mappingResolutions: RemediationMappingResolution[];
  affectedLinks: Array<{ id: number; modelo_id: number; ordem: number; manobra_id: number }>;
}): { payload: unknown; fingerprint: string; canonical: string };

export function sealRemediationPlan(planWithoutHash: Record<string, unknown>): Record<string, unknown> & { plan_sha256: string };

export function assertRemediationPlanIntegrity(
  plan: Record<string, unknown> & {
    plan_sha256?: string;
    schema_version?: number;
    remediation_uuid?: string;
    empresa_id?: number;
    mapping_count?: number;
    model_count?: number;
    link_count?: number;
    base_fingerprint?: string;
    expected_hash?: string;
  },
  options?: { baseFingerprint?: string; expectedHash?: string },
): boolean;
