export function buildPtoRev10AtomicPostconditions(args: {
  plan: {
    empresa_id: number;
    versao_matriz: string;
    models: Array<{ codigo: string }>;
    superseded_models: Array<{ id: number }>;
    manobra_resolution: Array<{ codigo_canonico: string }>;
  };
  empresaId: number;
}): string;
