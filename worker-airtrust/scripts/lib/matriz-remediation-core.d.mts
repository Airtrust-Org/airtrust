export type RemediationLinkRow = {
  id: number;
  modelo_id: number;
  manobra_id: number;
  ordem: number;
  obrigatoria?: number | boolean;
  tripulante?: string | null;
  observacoes?: string | null;
};

export type RemediationMapping = { codigo_canonico: string; correct_legacy_manobra_codigo: string };

export type RemediationMappingResolution = {
  codigo_canonico: string;
  wrong_manobra_id: number;
  wrong_manobra_codigo: string;
  correct_manobra_id: number;
  correct_manobra_codigo: string;
  original_resolution_id: number;
  original_resolution_type: string;
};

export type RemediationAffectedModel = {
  modelo_id: number;
  codigo_canonico: string;
  codigo_fisico: string;
  links: RemediationLinkRow[];
  affected_links: Array<RemediationLinkRow & { mapping: RemediationMappingResolution }>;
};

export function discoverRemediationTargets(input: {
  empresaId: number;
  versaoMatriz: string;
  mappings: RemediationMapping[];
  resolutionRows: Array<{ id: number; codigo_canonico: string; manobra_id: number; resolution_type: string }>;
  activeCorrectionCodes?: Set<string>;
  manobraByCode: Map<string, { id: number; empresa_id: number; deleted_at: string | null; codigo?: string }>;
  manobraById: Map<number, { id: number; empresa_id: number; deleted_at: string | null; codigo: string }>;
  currentModelsByCode: Map<string, { modelo_id: number; codigo_fisico: string }>;
  linkRows: RemediationLinkRow[];
}): {
  mappingResolutions: RemediationMappingResolution[];
  affectedModels: RemediationAffectedModel[];
  affectedLinks: Array<RemediationLinkRow & { mapping: RemediationMappingResolution }>;
};

export function buildRemediationApplyStatements(input: {
  empresaId: number;
  versaoMatriz: string;
  remediationUuid: string;
  guideRelinkUuid: string;
  guideRelinkExpectedHash: string;
  affectedModels: RemediationAffectedModel[];
  mappingResolutions: RemediationMappingResolution[];
  modelPhysicalMeta: Map<number, { versaoNumero: number }>;
  guideRelinkEntries?: Array<{
    codigo_canonico: string;
    guia_id: number;
    aeronave: string;
    modelo_sessao_id_novo: number | string;
    vinculo_antigo_id: number | null;
    modelo_sessao_id_antigo: number | null;
    already_correct: boolean;
  }>;
  startChangeOrder?: number;
}): { statements: string[]; lastChangeOrder: number };

export function buildRemediationRollbackStatements(input: {
  empresaId: number;
  versaoMatriz: string;
  remediationUuid: string;
  compensationUuid: string;
  affectedModels: Array<{
    codigo_canonico: string;
    remediated_modelo_id: number;
    remediated_versao_numero: number;
    original_links: RemediationLinkRow[];
  }>;
  correctionRows: Array<{ id: number; codigo_canonico: string; corrected_manobra_id: number; original_manobra_id: number }>;
  guideRelinkRollbackUuid: string;
  guideRelinkEntries: Array<{
    codigo_canonico: string;
    guia_id: number;
    aeronave: string;
    modelo_sessao_id_antigo: number | null;
    vinculo_antigo_id: number | null;
    already_correct: boolean;
  }>;
  guideRelinkExpectedHash: string;
  startChangeOrder?: number;
}): { statements: string[]; lastChangeOrder: number };
