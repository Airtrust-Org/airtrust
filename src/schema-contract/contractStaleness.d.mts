import type { ContractSeverity } from './checkSchemaContract.ts';

export const PROVENANCE_STATES: readonly [
  'REPO_EXPECTED',
  'STAGING_APPLIED',
  'PRODUCTION_CONFIRMED',
  'REMOTE_APPLY_PENDING',
];
export const GOVERNED_STATES: readonly string[];
export const APPLIED_STATES: readonly string[];
export const COVERAGE_CLASSES: readonly [
  'REFLECTED_IN_CONTRACT',
  'OUT_OF_CONTRACT_SCOPE',
  'RUNTIME_CRITICAL_UNCOVERED',
];

export interface StalenessIssue {
  severity: ContractSeverity;
  code: string;
  message: string;
  change_file?: string;
}

export interface StalenessResult {
  status: 'PASS' | 'FAIL';
  issues: StalenessIssue[];
}

export interface SchemaV2LedgerEntry {
  change_file: string;
  change_id: string | null;
  sha256: string;
  targets: string[];
  domain?: string;
  coverage: string;
  governance_state: string;
  reviewed_manifest?: string | null;
  evidence?: string;
  note?: string;
}

export interface StalenessContract {
  scoped_tables?: string[];
  provenance?: Record<string, unknown>;
  staleness_guard?: {
    schema_v2_changes_dir?: string;
    reviewed_manifests_dir?: string;
    schema_v2_digest?: string;
  };
  runtime_critical_uncovered?: unknown;
  schema_v2_since_baseline?: SchemaV2LedgerEntry[];
}

export function sha256(value: string): string;
export function isScratchTable(name: string): boolean;
export function extractDdlTargets(sqlText: string, options?: { includeScratch?: boolean }): string[];
export function computeSchemaV2Digest(entries: Array<{ change_file: string; sha256: string }>): string;
export function evaluateStaleness(input: { contract: StalenessContract; rootDir: string }): StalenessResult;
