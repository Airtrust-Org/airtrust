export type GuiaRelinkEntry = {
  codigo_canonico: string;
  guia_id: number;
  aeronave: string;
  modelo_sessao_id_novo: number;
  vinculo_antigo_id: number | null;
  modelo_sessao_id_antigo: number | null;
  already_correct: boolean;
};

export function buildGuiaRelinkPlan(input: {
  empresaId: number;
  versaoMatriz: string;
  contract: {
    sessions: Array<{
      codigo_canonico: string;
      html_relpath: string;
      ciclo?: string | null;
      programa: string;
      aeronave: string;
    }>;
  };
  guides: Array<Record<string, unknown>>;
  currentModels: Array<Record<string, unknown>>;
  activeLinks: Array<Record<string, unknown>>;
}): { entries: GuiaRelinkEntry[]; byAircraft: Record<string, number> };

export function buildGuiaRelinkFingerprint(input: {
  empresaId: number;
  versaoMatriz: string;
  entries: GuiaRelinkEntry[];
}): { payload: unknown; fingerprint: string; canonical: string };

export function buildGuiaRelinkApplyStatements(input: {
  empresaId: number;
  versaoMatriz: string;
  importUuid: string;
  entries: GuiaRelinkEntry[];
  expectedHash: string;
  isNewRelink: boolean;
}): string[];

export function buildGuiaRelinkRollbackStatements(input: {
  empresaId: number;
  importUuid: string;
  compensationUuid: string;
  changes: Array<{
    guia_id: number;
    modelo_sessao_id: number | null;
    operacao: string;
    before_json: string | null;
    after_json: string | null;
  }>;
}): string[];
