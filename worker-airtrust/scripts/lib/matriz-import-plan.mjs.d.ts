export const PLAN_SCHEMA_VERSION: number;
export function stableJson(value: unknown): string;
export function sha256(value: unknown): string;
export function validateModelItems(
  models: Array<{ codigo: string }>,
  items: Array<{ modelo: string; ordem: number; codigo: string; nome: string; execucao_pf: string }>,
): void;
export function createDeterministicPlan(input: {
  empresaId: number;
  sourceHashes: Record<string, string>;
  aw139: { models: Array<{ codigo: string }>; items: Array<Record<string, unknown>> };
  sk76: { models: Array<{ codigo: string }>; items: Array<Record<string, unknown>> };
  loft: number;
}): Record<string, unknown> & { plan_sha256: string };
