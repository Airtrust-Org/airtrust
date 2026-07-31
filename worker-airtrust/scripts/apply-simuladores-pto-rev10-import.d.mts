export function loadPtoRev10Fingerprint(dbPath: string, empresaId: number): any;
export function classifyExistingPtoRev10Import(
  existingImport: any,
  planSha256: string,
): 'NEW' | 'IDEMPOTENT_APPLIED' | 'CONFLICT';
export function applyPtoRev10Plan(options: Record<string, any>): any;
export function runCli(argv?: string[]): any;
