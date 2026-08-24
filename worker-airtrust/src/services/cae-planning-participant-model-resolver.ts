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

/**
 * Cadeia canônica de progressão individual, confirmada no schema:
 *
 * NORMAL: fichas_sessao.agendamento_slot_id -> simulador_agendamentos.id
 *         -> simulador_agendamentos.template_id (= modelos_sessao.id)
 * SHARED: fichas_sessao.atribuicao_curricular_id -> simulador_atribuicoes_curriculares.id
 *         -> simulador_atribuicoes_curriculares.modelo_sessao_id
 *
 * fs.aprovado = 1 é o único sinal de "conta como concluída" (mesma convenção
 * já usada em simuladores-fichas.ts). Reprovada ou PENDENTE não avança.
 *
 * O histórico é escopado ao ciclo atual (cycleStartDate = data_conclusao da
 * qualificacoes_historico corrente) para que sessões de um ciclo anterior
 * não sejam contadas como progresso do ciclo vigente.
 */
export async function resolveIndividualNextModel(params: {
  db: D1Database;
  empresaId: number;
  employeeId: number;
  cycleStartDate: string | null;
  models: SequenceModel[];
}): Promise<ResolvedParticipantModel | null> {
  const { db, empresaId, employeeId, cycleStartDate, models } = params;
  if (models.length === 0) return null;

  const sequence = [...models].sort(
    (a, b) => (a.ordem_no_treinamento ?? 999999) - (b.ordem_no_treinamento ?? 999999),
  );

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
    .all<{ modelo_id: number | null; origin: 'shared' | 'normal' }>();

  const sequenceIndexById = new Map(sequence.map((model, index) => [model.id, index]));
  let bestIndex = -1;
  let bestOrigin: 'shared' | 'normal' | null = null;
  for (const row of completed.results || []) {
    const modelId = Number(row.modelo_id);
    if (!Number.isInteger(modelId)) continue;
    const index = sequenceIndexById.get(modelId);
    if (index === undefined) continue;
    if (index > bestIndex) {
      bestIndex = index;
      bestOrigin = row.origin;
    }
  }

  if (bestIndex === -1) {
    return { modelId: sequence[0].id, ordem: sequence[0].ordem_no_treinamento, source: 'no_history' };
  }

  if (bestIndex >= sequence.length - 1) {
    const last = sequence[sequence.length - 1];
    return { modelId: last.id, ordem: last.ordem_no_treinamento, source: 'sequence_complete' };
  }

  const next = sequence[bestIndex + 1];
  return {
    modelId: next.id,
    ordem: next.ordem_no_treinamento,
    source: bestOrigin === 'shared' ? 'shared_history' : 'normal_history',
  };
}
