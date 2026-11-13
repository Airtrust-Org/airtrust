export function assertNewPtoV18ApplyReady(args: {
  plan: {
    schema_version: number;
    approved_source_sha256?: string;
    canonical_contract_sha256?: string;
    plan_sha256?: string;
  };
  existingState: 'NEW' | 'CONFLICT' | 'IDEMPOTENT_APPLIED';
  dryRun: boolean;
  technicalApproval?: {
    status?: string;
    pto_sha256?: string;
    contract_sha256?: string;
    plan_sha256?: string;
    guide_count?: number;
    technical_items_verified?: number;
    notechs_verified?: number;
    functional_guides_verified?: number;
    functional_technical_items_verified?: number;
    functional_notechs_links_verified?: number;
    reviewer?: string;
    evidence_ref?: string;
    reviewed_at?: string;
  } | null;
}): { mode: string };
