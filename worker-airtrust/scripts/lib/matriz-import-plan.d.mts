export interface ModeloPlano {
  codigo: string;
}

export interface ItemMatrizPlano {
  modelo: string;
  ordem: number;
  codigo: string;
  nome: string;
  execucao_pf: string;
}

export interface MatrizPlano {
  models: ModeloPlano[];
  items: ItemMatrizPlano[];
}

export interface PlanoDeterministico {
  schema_version: number;
  empresa_id: number;
  source_hashes: Record<string, string>;
  matrices: { AW139: MatrizPlano; SK76: MatrizPlano };
  totals: { modelos: number; vinculos: number; loft: number };
  plan_sha256: string;
}

export const PLAN_SCHEMA_VERSION: number;
export function stableJson(value: unknown): string;
export function sha256(value: string | Uint8Array | object): string;
export function validateModelItems(models: ModeloPlano[], items: ItemMatrizPlano[]): void;
export function createDeterministicPlan(input: {
  empresaId: number;
  sourceHashes: Record<string, string>;
  aw139: MatrizPlano;
  sk76: MatrizPlano;
  loft: number;
}): PlanoDeterministico;
