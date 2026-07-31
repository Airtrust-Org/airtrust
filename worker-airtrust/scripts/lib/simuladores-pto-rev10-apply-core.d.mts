export const PTO_REV10_ALLOWED_MUTATION_TABLES: readonly string[];
export const PTO_REV10_FORBIDDEN_HISTORICAL_TABLES: readonly string[];
export function physicalPtoRev10ModelCode(
  canonicalCode: unknown,
  matrixVersion: unknown,
  versionNumber: unknown,
): string;
export function getPtoRev10SessionType(type: unknown): {
  codigo: string;
  nome: string;
  ordem: number;
};
export function buildPtoRev10ModelAndLinkStatements(options: Record<string, any>): {
  statements: string[];
  modelRows: any[];
};
