import {
  parseCanonicalSessionIdentity,
  selectCurriculumCycle,
  type CurriculumCycleModel,
  type SelectedCurriculumCycle,
} from './simulator-curriculum-cycle';

export type QualificationCurriculumCatalogModel = CurriculumCycleModel & {
  equipment: string;
  training_type_code?: string | null;
};

export type QualificationCurriculumSelection = SelectedCurriculumCycle & {
  qualification_type_id: number;
  equipment: string;
  program: string;
  terminal_model_ids: number[];
};

function normalizeEquipment(value: string): string {
  const compact = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.includes('AW139') || compact === 'A139') return 'AW139';
  if (compact.includes('SK76') || compact === 'S76') return 'SK76';
  return compact;
}

/**
 * modelos_sessao.qualificacao_tipo_id identifica o(s) modelo(s) terminal(is)
 * que geram/renovam a qualificação. Ele NÃO é a lista completa das sessões do
 * treinamento. Esta função usa o modelo terminal como âncora e reconstrói o
 * programa/ciclo completo a partir do catálogo canônico corrente.
 */
export function selectCurriculumForQualification(params: {
  qualification_type_id: number;
  catalog: QualificationCurriculumCatalogModel[];
  cycle_hint?: number | null;
  last_completed_canonical_code?: string | null;
}): QualificationCurriculumSelection {
  const qualificationTypeId = Number(params.qualification_type_id);
  if (!Number.isInteger(qualificationTypeId) || qualificationTypeId <= 0) {
    throw new Error('qualification_type_id inválido');
  }

  const terminalModels = params.catalog.filter(
    (model) => Number(model.qualification_type_id) === qualificationTypeId,
  );
  if (terminalModels.length === 0) {
    throw new Error(`Qualificação ${qualificationTypeId} sem modelo terminal canônico`);
  }

  const terminalIdentities = terminalModels.map((model) => ({
    model,
    identity: parseCanonicalSessionIdentity(model.canonical_code),
    equipment: normalizeEquipment(model.equipment),
  }));
  const equipments = new Set(terminalIdentities.map((item) => item.equipment));
  const programs = new Set(
    terminalIdentities.map((item) => item.identity.program).filter((value): value is string => Boolean(value)),
  );
  if (equipments.size !== 1 || programs.size !== 1) {
    throw new Error(`Qualificação ${qualificationTypeId} possui terminais curriculares ambíguos`);
  }
  const equipment = [...equipments][0];
  const program = [...programs][0];

  const programCatalog = params.catalog.filter((model) => {
    const identity = parseCanonicalSessionIdentity(model.canonical_code);
    return normalizeEquipment(model.equipment) === equipment && identity.program === program;
  });
  if (programCatalog.length === 0) {
    throw new Error(`Programa curricular ${equipment}/${program} vazio`);
  }

  const selected = selectCurriculumCycle({
    models: programCatalog,
    cycle_hint: params.cycle_hint ?? null,
    last_completed_canonical_code: params.last_completed_canonical_code ?? null,
  });

  const selectedIds = new Set(selected.models.map((model) => model.id));
  const terminalInSelectedCycle = terminalModels.filter((model) => selectedIds.has(model.id));
  if (terminalInSelectedCycle.length !== 1) {
    throw new Error(
      `Ciclo selecionado da qualificação ${qualificationTypeId} deve conter exatamente um modelo terminal`,
    );
  }

  return {
    ...selected,
    qualification_type_id: qualificationTypeId,
    equipment,
    program,
    terminal_model_ids: terminalInSelectedCycle.map((model) => model.id),
  };
}
