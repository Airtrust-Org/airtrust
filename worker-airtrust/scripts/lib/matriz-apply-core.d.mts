export const REUSE_RESOLUTION_TYPES: Set<string>;
export function physicalCode(canonical: string, versaoMatriz: string, versaoNumero: number): string;
export function resolveStructuredTipo(model: any, fail: (message: string) => never): string;
export function buildResolutionStatements(input: {
  plan: any;
  empresaId: number;
  versaoMatriz: string;
  importUuid: string;
  fail: (message: string) => never;
  existingResolutionByCode: Map<string, any>;
  manobraById: Map<number, any>;
}): string[];
export function buildModelAndLinkStatements(input: {
  plan: any;
  empresaId: number;
  versaoMatriz: string;
  importUuid: string;
  fail: (message: string) => never;
  models: any[];
  items: any[];
  maxVersionByCode: Map<string, any>;
}): string[];
