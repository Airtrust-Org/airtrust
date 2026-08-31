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
  remaining: SequenceModel[];
  completed_model_ids: number[];
  last_completed_index: number;
  source: 'no_history' | 'normal_history' | 'shared_history' | 'sequence_complete';
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
  const { db, empresaId, employeeId, cycleStartDate } = params;
  const completed = await db
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
    .bind(empresaId, empresaId, empresaId, employeeId, employeeId, cycleStartDate, cycleStartDate)
    .all<CompletedModelRow>();
  return completed.results || [];
}

/**
 * Retorna TODAS as sessões ainda necessárias no ciclo atual. Esta é a fonte
 * para o planejamento V2: o sistema planeja o treinamento completo restante,
 * não apenas a próxima sessão isolada.
 */
export async function resolveIndividualRemainingModels(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
  models: SequenceModel[];
}): Promise<ResolvedParticipantRemainingModels> {
  const { db, empresaId, employeeId, cycleStartDate, models } = params;
  const sequence = orderedSequence(models);
  if (sequence.length === 0) {
    return {
      remaining: [],
      completed_model_ids: [],
      last_completed_index: -1,
      source: 'sequence_complete',
    };
  }

  const completed = await loadCompletedModels({ db, empresaId, employeeId, cycleStartDate });
  const sequenceIndexById = new Map(sequence.map((model, index) => [model.id, index]));
  const completedIds = new Set<number>();
  let bestIndex = -1;
  let bestOrigin: 'shared' | 'normal' | null = null;

  for (const row of completed) {
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
      remaining: sequence,
      completed_model_ids: [],
      last_completed_index: -1,
      source: 'no_history',
    };
  }

  if (bestIndex >= sequence.length - 1) {
    return {
      remaining: [],
      completed_model_ids: [...completedIds].sort((a, b) => a - b),
      last_completed_index: bestIndex,
      source: 'sequence_complete',
    };
  }

  return {
    remaining: sequence.slice(bestIndex + 1),
    completed_model_ids: [...completedIds].sort((a, b) => a - b),
    last_completed_index: bestIndex,
    source: bestOrigin === 'shared' ? 'shared_history' : 'normal_history',
  };
}

/**
 * Cadeia canônica de progressão individual, confirmada no schema:
 *
 * NORMAL: fichas_sessao.agendamento_slot_id -> simulador_agendamentos.id
 *         -> simulador_agendamentos.template_id (= modelos_sessao.id)
 * SHARED: fichas_sessao.atribuicao_curricular_id -> simulador_atribuicoes_curriculares.id
 *         -> simulador_atribuicoes_curriculares.modelo_sessao_id
 *
 * fs.aprovado = 1 é o único sinal de "conta como concluída". Reprovada ou
 * PENDENTE não avança. O histórico é escopado ao ciclo atual.
 *
 * Compatibilidade: esta função continua retornando somente a próxima sessão
 * para os fluxos V1 existentes. O V2 usa resolveIndividualRemainingModels.
 */
export async function resolveIndividualNextModel(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
  models: SequenceModel[];
}): Promise<ResolvedParticipantModel | null> {
  const sequence = orderedSequence(params.models);
  if (sequence.length === 0) return null;

  const progress = await resolveIndividualRemainingModels(params);
  if (progress.source === 'sequence_complete' || progress.remaining.length === 0) {
    const last = sequence[sequence.length - 1];
    return {
      modelId: last.id,
      ordem: last.ordem_no_treinamento,
      source: 'sequence_complete',
    };
  }

  const next = progress.remaining[0];
  return {
    modelId: next.id,
    ordem: next.ordem_no_treinamento,
    source: progress.source,
  };
}
