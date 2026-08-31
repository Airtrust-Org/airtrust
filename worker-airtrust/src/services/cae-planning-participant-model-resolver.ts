import type { D1Database } from '@cloudflare/workers-types';

export type SequenceModel = {
  id: number;
  ordem_no_treinamento: number | null;
};

export type ResolvedParticipantModel = {
  modelId: number;
  ordem: number | null;
  source: 'no_history' | 'normal_history' | 'shared_history' | 'sequence_complete';
};

export type ResolvedParticipantRemainingModels = {
  models: SequenceModel[];
  completedModelIds: number[];
  source: ResolvedParticipantModel['source'];
};

type CompletedModelRow = {
  modelo_id: number | null;
  origin: 'shared' | 'normal';
};

function orderedSequence(models: SequenceModel[]): SequenceModel[] {
  return [...models].sort(
    (a, b) =>
      (a.ordem_no_treinamento ?? 999999) - (b.ordem_no_treinamento ?? 999999) ||
      a.id - b.id,
  );
}

async function loadCompletedModels(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
}): Promise<CompletedModelRow[]> {
  const completed = await params.db
    .prepare(
      `SELECT
         COALESCE(sac.modelo_sessao_id, sa.template_id) AS modelo_id,
         CASE WHEN sac.modelo_sessao_id IS NOT NULL THEN 'shared' ELSE 'normal' END AS origin
       FROM fichas_sessao fs
       LEFT JOIN simulador_atribuicoes_curriculares sac
         ON sac.id = fs.atribuicao_curricular_id
        AND sac.deleted_at IS NULL
        AND sac.empresa_id = ?
       LEFT JOIN simulador_agendamentos sa
         ON sa.id = fs.agendamento_slot_id
        AND sa.deleted_at IS NULL
        AND sa.empresa_id = ?
       WHERE fs.deleted_at IS NULL
         AND fs.empresa_id = ?
         AND fs.aprovado = 1
         AND (fs.colaborador_id_aluno = ? OR sac.participante_id = ?)
         AND (? IS NULL OR fs.data_sessao IS NULL OR date(fs.data_sessao) >= date(?))`,
    )
    .bind(
      params.empresaId,
      params.empresaId,
      params.empresaId,
      params.employeeId,
      params.employeeId,
      params.cycleStartDate,
      params.cycleStartDate,
    )
    .all<CompletedModelRow>();
  return completed.results || [];
}

/**
 * Resolve todas as sessões ainda necessárias no ciclo atual.
 *
 * O planejamento precisa representar o treinamento inteiro restante, não
 * somente a próxima sessão. A progressão continua usando a mesma cadeia
 * canônica de evidência do resolver legado: somente fichas aprovadas e
 * escopadas ao tenant/ciclo avançam o currículo.
 */
export async function resolveIndividualRemainingModels(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
  models: SequenceModel[];
}): Promise<ResolvedParticipantRemainingModels> {
  const sequence = orderedSequence(params.models);
  if (sequence.length === 0) {
    return { models: [], completedModelIds: [], source: 'sequence_complete' };
  }

  const completedRows = await loadCompletedModels(params);
  const sequenceIndexById = new Map(sequence.map((model, index) => [model.id, index]));
  const completedIds = new Set<number>();
  let bestIndex = -1;
  let bestOrigin: 'shared' | 'normal' | null = null;

  for (const row of completedRows) {
    const modelId = Number(row.modelo_id);
    if (!Number.isInteger(modelId)) continue;
    const index = sequenceIndexById.get(modelId);
    if (index === undefined) continue;
    completedIds.add(modelId);
    if (index > bestIndex) {
      bestIndex = index;
      bestOrigin = row.origin;
    }
  }

  if (bestIndex === -1) {
    return {
      models: sequence,
      completedModelIds: [],
      source: 'no_history',
    };
  }

  if (bestIndex >= sequence.length - 1) {
    return {
      models: [],
      completedModelIds: sequence.filter((model) => completedIds.has(model.id)).map((model) => model.id),
      source: 'sequence_complete',
    };
  }

  return {
    models: sequence.slice(bestIndex + 1),
    completedModelIds: sequence.filter((model) => completedIds.has(model.id)).map((model) => model.id),
    source: bestOrigin === 'shared' ? 'shared_history' : 'normal_history',
  };
}

/**
 * Compatibilidade para os consumidores que ainda precisam apenas da próxima
 * sessão. Não reinicia silenciosamente um currículo já concluído.
 */
export async function resolveIndividualNextModel(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
  models: SequenceModel[];
}): Promise<ResolvedParticipantModel | null> {
  if (params.models.length === 0) return null;

  const sequence = orderedSequence(params.models);
  const remaining = await resolveIndividualRemainingModels(params);
  if (remaining.models.length > 0) {
    const next = remaining.models[0];
    return {
      modelId: next.id,
      ordem: next.ordem_no_treinamento,
      source: remaining.source,
    };
  }

  const last = sequence[sequence.length - 1];
  return {
    modelId: last.id,
    ordem: last.ordem_no_treinamento,
    source: 'sequence_complete',
  };
}
