export interface ModeloPlano {
  codigo: string;
  programa: string;
  ciclo: string | null;
  titulo: string | null;
  aeronave: 'AW139' | 'SK76';
}

export interface CriteriosPlano {
  '1-2': string | null;
  '3-5': string | null;
  '6-8': string | null;
  '9-10': string | null;
}

export interface ItemMatrizPlano {
  modelo: string;
  ordem: number;
  codigo: string;
  nome: string;
  execucao_pf: string;
  categoria: string | null;
  fase_voo: string | null;
  tipo_conteudo: string | null;
  cenario: string | null;
  configuracao_ios: string | null;
  desempenho_esperado: string | null;
  foco_instrutor: string | null;
  como_observar: string | null;
  referencia_tecnica: string | null;
  rastreabilidade_interna: string | null;
  criterios: CriteriosPlano;
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
