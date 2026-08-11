export const SK76_PERIODIC_CODE_RENAMES: ReadonlyArray<readonly [string, string]>;

export function canonicalSk76PeriodicCode(code: unknown): string;
export function legacySk76PeriodicCode(code: unknown): string | null;
export function canonicalSk76ArchitectureId(value: unknown): unknown;

export interface SessionContractLike {
  sessions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface MatrixLike {
  models?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function applySk76PeriodicSessionContractCorrections<T extends SessionContractLike>(
  contract: T,
): T;
export function applySk76PeriodicMatrixCodeCorrections<T extends MatrixLike>(matrix: T): T;
export function assertSk76PeriodicCodesCorrected(codes: unknown[]): true;
