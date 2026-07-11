import {
  calculateSharedSessionParticipantSummaries,
  createSharedAssignmentKey,
} from './simuladores-shared-session-logic';
import { allStatement, firstStatement } from './simuladores-shared-session-helpers';

export async function loadSharedDetail(db: D1Database, empresaId: number, sessaoId: number) {
  const sessao = await firstStatement<any>(
    db,
    `SELECT
         id,
         uuid,
         simulador_id,
         funcionario_id,
         data,
         hora_inicio,
         hora_fim,
         duracao_minutos,
         instrutor_id,
         tipo_sessao,
         template_id,
         status,
         observacoes,
         nome,
         empresa_id,
         modo_compartilhado,
         deleted_at
       FROM simulador_agendamentos
       WHERE id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
         AND COALESCE(modo_compartilhado, 0) = 1`,
    sessaoId,
    empresaId,
  );
  if (!sessao) {
    return null;
  }

  const participantes = await db
    .prepare(
      `SELECT sp.id,
              sp.funcionario_id,
              sp.funcao,
              f.nome AS funcionario_nome,
              f.guerra AS funcionario_guerra
       FROM sessoes_participantes sp
       INNER JOIN funcionarios f
         ON f.id = sp.funcionario_id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       WHERE sp.sessao_id = ?
         AND sp.deleted_at IS NULL
       ORDER BY sp.id`,
    )
    .bind(empresaId, sessaoId)
    .all<any>();

  const atribuicoes = await db
    .prepare(
      `SELECT sac.*,
              sp.funcionario_id,
              f.nome AS funcionario_nome,
              ms.codigo AS modelo_codigo,
              ms.nome AS modelo_nome
       FROM simulador_atribuicoes_curriculares sac
       INNER JOIN sessoes_participantes sp
         ON sp.id = sac.participante_id
        AND sp.deleted_at IS NULL
       INNER JOIN funcionarios f
         ON f.id = sp.funcionario_id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       LEFT JOIN modelos_sessao ms
         ON ms.id = sac.modelo_sessao_id
        AND ms.deleted_at IS NULL
        AND ms.empresa_id = ?
       WHERE sac.agendamento_id = ?
         AND sac.empresa_id = ?
         AND sac.deleted_at IS NULL
       ORDER BY sac.id`,
    )
    .bind(empresaId, empresaId, sessaoId, empresaId)
    .all<any>();

  const segmentos = await allStatement<any>(
    db,
    `SELECT
         id,
         uuid,
         empresa_id,
         agendamento_id,
         ordem,
         inicio,
         fim,
         duracao_minutos,
         atribuicao_curricular_id,
         finalidade_codigo,
         finalidade_titulo,
         status,
         created_at,
         updated_at,
         deleted_at
       FROM simulador_agendamento_segmentos
       WHERE agendamento_id = ?
         AND empresa_id = ?
         AND deleted_at IS NULL
       ORDER BY ordem ASC`,
    sessaoId,
    empresaId,
  );

  const segmentoAtribuicoes = await db
    .prepare(
      `SELECT ssa.*,
              sac.participante_id,
              sac.modelo_sessao_id,
              sac.treinamento_planejado_id,
              sp.funcionario_id
       FROM simulador_segmento_atribuicoes ssa
       INNER JOIN simulador_agendamento_segmentos seg
         ON seg.id = ssa.segmento_id
        AND seg.deleted_at IS NULL
        AND seg.empresa_id = ?
       INNER JOIN simulador_atribuicoes_curriculares sac
         ON sac.id = ssa.atribuicao_curricular_id
        AND sac.deleted_at IS NULL
        AND sac.empresa_id = ?
       INNER JOIN sessoes_participantes sp
         ON sp.id = sac.participante_id
        AND sp.deleted_at IS NULL
       WHERE seg.agendamento_id = ?
         AND ssa.empresa_id = ?
         AND ssa.deleted_at IS NULL
       ORDER BY ssa.segmento_id, ssa.id`,
    )
    .bind(empresaId, empresaId, sessaoId, empresaId)
    .all<any>();

  const segmentoParticipantes = await db
    .prepare(
      `SELECT ssp.*,
              sp.funcionario_id
       FROM simulador_segmento_participantes ssp
       INNER JOIN sessoes_participantes sp
         ON sp.id = ssp.participante_id
        AND sp.deleted_at IS NULL
       WHERE ssp.segmento_id IN (
         SELECT id
         FROM simulador_agendamento_segmentos
         WHERE agendamento_id = ?
           AND empresa_id = ?
           AND deleted_at IS NULL
       )
         AND ssp.empresa_id = ?
         AND ssp.deleted_at IS NULL
       ORDER BY ssp.segmento_id, ssp.id`,
    )
    .bind(sessaoId, empresaId, empresaId)
    .all<any>();

  const fichas = await db
    .prepare(
      `SELECT fs.*,
              f.nome AS aluno_nome
       FROM fichas_sessao fs
       INNER JOIN funcionarios f
         ON f.id = fs.colaborador_id_aluno
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
       WHERE fs.agendamento_slot_id = ?
         AND fs.empresa_id = ?
         AND fs.deleted_at IS NULL
       ORDER BY fs.id`,
    )
    .bind(empresaId, sessaoId, empresaId)
    .all<any>();

  const resevaDuracao = Number(sessao.duracao_minutos || 0);
  const rawSegmentos = segmentos.results || [];

  // Detecta segmentos inconsistentes com a reserva (split fora da janela,
  // durações que não somam ao total, etc.)
  let segmentosInconsistentes = false;
  if (rawSegmentos.length > 0 && resevaDuracao > 0) {
    const segmentDurationTotal = rawSegmentos.reduce(
      (sum, seg) => sum + Math.max(0, Number(seg.duracao_minutos || 0)),
      0,
    );
    if (segmentDurationTotal !== resevaDuracao) {
      segmentosInconsistentes = true;
    }
  }

  const summaries = calculateSharedSessionParticipantSummaries(
    (participantes.results || []).map((participante) => {
      const atribuicao = (atribuicoes.results || []).find(
        (item) => Number(item.funcionario_id) === Number(participante.funcionario_id),
      );
      return {
        funcionario_id: Number(participante.funcionario_id),
        cumpre_treinamento: Boolean(atribuicao),
        gera_ficha: Boolean(atribuicao?.gera_ficha),
      };
    }),
    rawSegmentos.map((segmento) => ({
      duracao_minutos: Number(segmento.duracao_minutos || 0),
      curricular_funcionario_ids: (segmentoAtribuicoes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => Number(item.funcionario_id)),
      atribuicao_funcionario_id:
        (atribuicoes.results || []).find((item) => Number(item.id) === Number(segmento.atribuicao_curricular_id))
          ?.funcionario_id ?? null,
      funcoes: (segmentoParticipantes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => ({
          funcionario_id: Number(item.funcionario_id),
          funcao: String(item.funcao || 'PF').toUpperCase() as 'PF' | 'PM',
        })),
    })),
  );

  // Se os segmentos estão inconsistentes, força os totais para
  // coincidirem com a duração real da reserva (defesa em leitura).
  if (segmentosInconsistentes) {
    for (const summary of summaries) {
      if (summary.total_minutos !== resevaDuracao) {
        summary.total_minutos = resevaDuracao;
      }
    }
  }

  return {
    sessao,
    participantes: participantes.results || [],
    atribuicoes: atribuicoes.results || [],
    segmentos: (segmentos.results || []).map((segmento) => ({
      ...segmento,
      modelo_sessao_id:
        (() => {
          const modelIds = Array.from(
            new Set(
              (segmentoAtribuicoes.results || [])
                .filter((item) => Number(item.segmento_id) === Number(segmento.id))
                .map((item) => Number(item.modelo_sessao_id || 0))
                .filter((item) => item > 0),
            ),
          );
          return modelIds.length === 1 ? modelIds[0] : null;
        })(),
      atribuicoes_curriculares: (segmentoAtribuicoes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => ({
          ...item,
          assignment_key: createSharedAssignmentKey(
            Number(item.funcionario_id),
            Number(item.modelo_sessao_id || 0),
          ),
        })),
      atribuicao_funcionario_ids: (segmentoAtribuicoes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => Number(item.funcionario_id)),
      funcoes: (segmentoParticipantes.results || []).filter(
        (item) => Number(item.segmento_id) === Number(segmento.id),
      ),
      participantes: (segmentoParticipantes.results || [])
        .filter((item) => Number(item.segmento_id) === Number(segmento.id))
        .map((item) => {
          const relation = (segmentoAtribuicoes.results || []).find(
            (ssa) =>
              Number(ssa.segmento_id) === Number(segmento.id) &&
              Number(ssa.funcionario_id) === Number(item.funcionario_id),
          );
          return {
            funcionario_id: Number(item.funcionario_id),
            funcao: String(item.funcao || 'PF').toUpperCase(),
            cumpre_treinamento: Boolean(relation),
            gera_ficha: relation ? Number(relation.gera_ficha ?? 1) === 1 : false,
            treinamento_planejado_id: relation?.treinamento_planejado_id || null,
            modelo_sessao_id: relation?.modelo_sessao_id || null,
            assignment_key: relation
              ? createSharedAssignmentKey(
                  Number(relation.funcionario_id),
                  Number(relation.modelo_sessao_id || 0),
                )
              : null,
          };
        }),
    })),
    fichas: fichas.results || [],
    resumo_participantes: summaries,
    segmentos_inconsistentes: segmentosInconsistentes || undefined,
  };
}

export type LoadedSharedDetail = NonNullable<Awaited<ReturnType<typeof loadSharedDetail>>>;
