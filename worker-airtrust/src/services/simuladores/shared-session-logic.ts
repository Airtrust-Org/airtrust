import { z } from 'zod';

type SharedRole = 'PF' | 'PM';

export const SHARED_SEGMENT_PURPOSE_CODES = [
  'SOP_NORMAL',
  'SOP_ANORMAL_EMERGENCIA',
  'ATUACAO_EXAMINADOR',
  'OUTRO',
] as const;

export type SharedSegmentPurpose = (typeof SHARED_SEGMENT_PURPOSE_CODES)[number];

export const sharedSessionParticipantSchema = z.object({
  funcionario_id: z.coerce.number().int().positive(),
  cumpre_treinamento: z.coerce.boolean().optional(),
  gera_ficha: z.coerce.boolean().optional(),
  treinamento_planejado_id: z.coerce.number().int().positive().nullable().optional(),
  modelo_sessao_id: z.coerce.number().int().positive().nullable().optional(),
});

export const sharedSessionSegmentParticipantSchema = z.object({
  funcionario_id: z.coerce.number().int().positive(),
  funcao: z.enum(['PF', 'PM']),
  cumpre_treinamento: z.coerce.boolean().default(false),
  gera_ficha: z.coerce.boolean().optional(),
  treinamento_planejado_id: z.coerce.number().int().positive().nullable().optional(),
  modelo_sessao_id: z.coerce.number().int().positive().nullable().optional(),
});

export const sharedSessionSegmentSchema = z.object({
  id: z.coerce.number().int().positive().nullable().optional(),
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fim: z.string().regex(/^\d{2}:\d{2}$/),
  modelo_sessao_id: z.coerce.number().int().positive().nullable().optional(),
  atribuicao_funcionario_id: z.coerce.number().int().positive().nullable().optional(),
  atribuicao_funcionario_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
  finalidade_codigo: z.enum(SHARED_SEGMENT_PURPOSE_CODES).optional().default('OUTRO'),
  finalidade_titulo: z.string().trim().max(120).nullable().optional(),
  participantes: z.array(sharedSessionSegmentParticipantSchema).min(2).optional(),
  funcoes: z.array(z.object({
    funcionario_id: z.coerce.number().int().positive(),
    funcao: z.enum(['PF', 'PM']),
  })).min(2).optional(),
});

export const sharedSessionRequestSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
  hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
  simulador_id: z.coerce.number().int().positive(),
  instrutor_id: z.coerce.number().int().positive(),
  tema_sessao: z.string().trim().max(200).optional().nullable(),
  observacoes: z.string().trim().max(4000).optional().nullable(),
  participantes: z.array(sharedSessionParticipantSchema).min(2),
  segmentos: z.array(sharedSessionSegmentSchema).min(1),
});

export type SharedSessionRequest = z.infer<typeof sharedSessionRequestSchema>;

export type SharedSessionSummary = {
  funcionario_id: number;
  total_minutos: number;
  pf_minutos: number;
  pm_minutos: number;
  curricular_minutos: number;
  cumpre_treinamento: boolean;
  gera_ficha: boolean;
};

export type SharedSessionAssignmentPlan = {
  assignment_key: string;
  funcionario_id: number;
  modelo_sessao_id: number;
  treinamento_planejado_id: number | null;
  carga_horaria_total_minutos: number;
  gera_ficha: boolean;
};

export type NormalizedSharedSessionRequest = Omit<
  SharedSessionRequest,
  'segmentos'
> & {
  participantes: Array<{ funcionario_id: number }>;
  segmentos: Array<
    Omit<SharedSessionRequest['segmentos'][number], 'participantes'> & {
      id?: number | null;
      ordem: number;
      inicio_min: number;
      fim_min: number;
      duracao_minutos: number;
      finalidade_codigo: SharedSegmentPurpose;
      finalidade_titulo: string | null;
      participantes: Array<{
        funcionario_id: number;
        funcao: SharedRole;
        cumpre_treinamento: boolean;
        gera_ficha: boolean;
        treinamento_planejado_id: number | null;
        modelo_sessao_id: number | null;
        assignment_key: string | null;
      }>;
      curricular_assignment_keys: string[];
      curricular_funcionario_ids: number[];
      modelo_sessao_id: number | null;
    }
  >;
  resumo_participantes: SharedSessionSummary[];
  atribuicoes_planejadas: SharedSessionAssignmentPlan[];
};

type SummarySeed = {
  funcionario_id: number;
  cumpre_treinamento: boolean;
  gera_ficha: boolean;
};

type SummarySegmentInput = {
  duracao_minutos: number;
  atribuicao_funcionario_id?: number | null;
  atribuicao_funcionario_ids?: number[] | null;
  curricular_funcionario_ids?: number[] | null;
  participantes?: Array<{
    funcionario_id: number;
    funcao: SharedRole;
    cumpre_treinamento?: boolean;
  }>;
  funcoes?: Array<{ funcionario_id: number; funcao: SharedRole }>;
};

function timeToMinutesStrict(value: string): number {
  const [hoursText, minutesText] = value.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours * 60 + minutes;
}

export function createSharedAssignmentKey(funcionarioId: number, modeloSessaoId: number): string {
  return `${funcionarioId}:${modeloSessaoId}`;
}

function dedupePositiveIds(values: Array<number | null | undefined>): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((left, right) => left - right);
}

function collectCurricularIds(segmento: SummarySegmentInput): number[] {
  if (Array.isArray(segmento.curricular_funcionario_ids) && segmento.curricular_funcionario_ids.length > 0) {
    return dedupePositiveIds(segmento.curricular_funcionario_ids);
  }

  if (Array.isArray(segmento.participantes) && segmento.participantes.length > 0) {
    return dedupePositiveIds(
      segmento.participantes
        .filter((participante) => Boolean(participante.cumpre_treinamento))
        .map((participante) => participante.funcionario_id),
    );
  }

  const explicitIds = dedupePositiveIds(segmento.atribuicao_funcionario_ids || []);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  if (segmento.atribuicao_funcionario_id) {
    return [Number(segmento.atribuicao_funcionario_id)];
  }

  return [];
}

function collectRoles(segmento: SummarySegmentInput): Array<{ funcionario_id: number; funcao: SharedRole }> {
  if (Array.isArray(segmento.participantes) && segmento.participantes.length > 0) {
    return segmento.participantes.map((participante) => ({
      funcionario_id: participante.funcionario_id,
      funcao: participante.funcao,
    }));
  }

  return Array.isArray(segmento.funcoes) ? segmento.funcoes : [];
}

export function calculateSharedSessionParticipantSummaries(
  participantes: SummarySeed[],
  segmentos: SummarySegmentInput[],
): SharedSessionSummary[] {
  const map = new Map<number, SharedSessionSummary>();

  for (const participante of participantes) {
    map.set(participante.funcionario_id, {
      funcionario_id: participante.funcionario_id,
      total_minutos: 0,
      pf_minutos: 0,
      pm_minutos: 0,
      curricular_minutos: 0,
      cumpre_treinamento: participante.cumpre_treinamento,
      gera_ficha: participante.gera_ficha,
    });
  }

  for (const segmento of segmentos) {
    for (const funcao of collectRoles(segmento)) {
      const summary = map.get(funcao.funcionario_id);
      if (!summary) {
        continue;
      }

      summary.total_minutos += segmento.duracao_minutos;
      if (funcao.funcao === 'PF') {
        summary.pf_minutos += segmento.duracao_minutos;
      } else {
        summary.pm_minutos += segmento.duracao_minutos;
      }
    }

    for (const funcionarioId of collectCurricularIds(segmento)) {
      const summary = map.get(funcionarioId);
      if (summary) {
        summary.curricular_minutos += segmento.duracao_minutos;
      }
    }
  }

  return Array.from(map.values()).sort((left, right) => left.funcionario_id - right.funcionario_id);
}

export function createSharedCurricularSignature(
  participantes: Array<{ funcionario_id: number }>,
  atribuicoes: Array<{
    funcionario_id: number;
    treinamento_planejado_id?: number | null;
    modelo_sessao_id?: number | null;
    gera_ficha?: boolean | number;
  }>,
): string {
  return JSON.stringify(
    participantes
      .map((participante) => ({
        funcionario_id: Number(participante.funcionario_id),
        atribuicoes: atribuicoes
          .filter((item) => Number(item.funcionario_id) === Number(participante.funcionario_id))
          .map((item) => ({
            modelo_sessao_id: Number(item.modelo_sessao_id || 0) || null,
            gera_ficha: Boolean(item.gera_ficha),
          }))
          .sort((left, right) => Number(left.modelo_sessao_id || 0) - Number(right.modelo_sessao_id || 0)),
      }))
      .sort((left, right) => left.funcionario_id - right.funcionario_id),
  );
}

export function validateAndNormalizeSharedSessionRequest(
  input: unknown,
): NormalizedSharedSessionRequest {
  const parsed = sharedSessionRequestSchema.parse(input);

  if (parsed.participantes.length !== 2) {
    throw new Error('Sessão compartilhada exige exatamente dois participantes físicos');
  }

  const participanteIds = new Set<number>();
  const participantes = parsed.participantes.map((participante) => {
    if (participanteIds.has(participante.funcionario_id)) {
      throw new Error(`Participante duplicado: ${participante.funcionario_id}`);
    }
    participanteIds.add(participante.funcionario_id);

    const legacyCumpreTreinamento = participante.cumpre_treinamento === true;
    const legacyGeraFicha =
      participante.gera_ficha !== undefined
        ? participante.gera_ficha
        : legacyCumpreTreinamento;

    if (legacyCumpreTreinamento && !participante.modelo_sessao_id) {
      throw new Error(
        `Participante ${participante.funcionario_id} precisa informar modelo_sessao_id`,
      );
    }

    if (!legacyCumpreTreinamento && participante.modelo_sessao_id) {
      throw new Error(
        `Participante ${participante.funcionario_id} não pode informar modelo_sessao_id como apoio`,
      );
    }

    if (!legacyCumpreTreinamento && legacyGeraFicha) {
      throw new Error(
        `Participante ${participante.funcionario_id} não pode gerar ficha sem atribuição curricular`,
      );
    }

    return { funcionario_id: participante.funcionario_id };
  });

  const reservaInicio = timeToMinutesStrict(parsed.hora_inicio);
  const reservaFim = timeToMinutesStrict(parsed.hora_fim);
  if (reservaFim <= reservaInicio) {
    throw new Error('A reserva compartilhada deve terminar após o horário inicial');
  }

  const assignmentState = new Map<
    string,
    {
      funcionario_id: number;
      modelo_sessao_id: number;
      treinamento_planejado_id: number | null;
      carga_horaria_total_minutos: number;
      gera_ficha: boolean;
    }
  >();

  const normalizedSegments = parsed.segmentos
    .map((segmento, index) => {
      const inicioMin = timeToMinutesStrict(segmento.inicio);
      const fimMin = timeToMinutesStrict(segmento.fim);
      if (fimMin <= inicioMin) {
        throw new Error(`Segmento ${index + 1} precisa terminar após o início`);
      }
      if (inicioMin < reservaInicio || fimMin > reservaFim) {
        throw new Error(`Segmento ${index + 1} está fora da janela da reserva`);
      }

      const funcaoPorParticipante = new Map<number, SharedRole>();
      let pfCount = 0;
      let pmCount = 0;

      const legacyCurricularIds = dedupePositiveIds([
        ...(segmento.atribuicao_funcionario_ids || []),
        segmento.atribuicao_funcionario_id || null,
      ]);
      const rawSegmentParticipants =
        segmento.participantes && segmento.participantes.length > 0
          ? segmento.participantes
          : (segmento.funcoes || []).map((funcao) => {
              const legacyParticipant = parsed.participantes.find(
                (item) => item.funcionario_id === funcao.funcionario_id,
              );
              const cumpreTreinamento = legacyCurricularIds.includes(funcao.funcionario_id);
              return {
                funcionario_id: funcao.funcionario_id,
                funcao: funcao.funcao,
                cumpre_treinamento: cumpreTreinamento,
                gera_ficha: cumpreTreinamento
                  ? (legacyParticipant?.gera_ficha ?? legacyParticipant?.cumpre_treinamento ?? true)
                  : false,
                treinamento_planejado_id: cumpreTreinamento
                  ? (legacyParticipant?.treinamento_planejado_id || null)
                  : null,
                modelo_sessao_id: cumpreTreinamento
                  ? (legacyParticipant?.modelo_sessao_id || null)
                  : null,
              };
            });

      if (rawSegmentParticipants.length === 0) {
        throw new Error(`Segmento ${index + 1} precisa informar participantes`);
      }

      const normalizedParticipants = rawSegmentParticipants.map((participante) => {
        if (!participanteIds.has(participante.funcionario_id)) {
          throw new Error(
            `Segmento ${index + 1} referencia participante fora da reserva: ${participante.funcionario_id}`,
          );
        }
        if (funcaoPorParticipante.has(participante.funcionario_id)) {
          throw new Error(
            `Participante ${participante.funcionario_id} possui função duplicada no segmento ${index + 1}`,
          );
        }

        funcaoPorParticipante.set(participante.funcionario_id, participante.funcao);
        if (participante.funcao === 'PF') pfCount += 1;
        if (participante.funcao === 'PM') pmCount += 1;

        const geraFicha =
          participante.gera_ficha !== undefined
            ? participante.gera_ficha
            : participante.cumpre_treinamento;

        if (!participante.cumpre_treinamento && geraFicha) {
          throw new Error(
            `Segmento ${index + 1}: participante ${participante.funcionario_id} não pode gerar ficha sem currículo`,
          );
        }

        if (!participante.cumpre_treinamento && participante.treinamento_planejado_id) {
          throw new Error(
            `Segmento ${index + 1}: participante ${participante.funcionario_id} não pode informar treinamento planejado como apoio`,
          );
        }

        return {
          funcionario_id: participante.funcionario_id,
          funcao: participante.funcao,
          cumpre_treinamento: participante.cumpre_treinamento,
          gera_ficha: geraFicha,
          treinamento_planejado_id: participante.treinamento_planejado_id || null,
          modelo_sessao_id: participante.modelo_sessao_id || null,
          assignment_key: null as string | null,
        };
      });

      if (normalizedParticipants.length !== participantes.length) {
        throw new Error(`Segmento ${index + 1} precisa cobrir todos os participantes da reserva`);
      }
      if (pfCount !== 1) {
        throw new Error(`Segmento ${index + 1} precisa ter exatamente um PF`);
      }
      if (pmCount !== 1) {
        throw new Error(`Segmento ${index + 1} precisa ter exatamente um PM`);
      }

      for (const participante of participantes) {
        if (!funcaoPorParticipante.has(participante.funcionario_id)) {
          throw new Error(
            `Segmento ${index + 1} precisa cobrir o participante ${participante.funcionario_id}`,
          );
        }
      }

      const curricularParticipants = normalizedParticipants.filter((participante) =>
        participante.cumpre_treinamento,
      );

      if (curricularParticipants.length === 0) {
        throw new Error(`Segmento ${index + 1} precisa atender ao menos um currículo`);
      }

      const effectiveModelIds = new Set<number>();

      for (const participante of curricularParticipants) {
        const modeloSessaoId =
          Number(participante.modelo_sessao_id || 0) ||
          Number(segmento.modelo_sessao_id || 0) ||
          null;
        if (!modeloSessaoId) {
          throw new Error(`Segmento ${index + 1} precisa informar modelo_sessao_id`);
        }
        participante.modelo_sessao_id = modeloSessaoId;
        effectiveModelIds.add(modeloSessaoId);

        const assignmentKey = createSharedAssignmentKey(
          participante.funcionario_id,
          modeloSessaoId,
        );
        participante.assignment_key = assignmentKey;

        const current = assignmentState.get(assignmentKey);
        if (!current) {
          assignmentState.set(assignmentKey, {
            funcionario_id: participante.funcionario_id,
            modelo_sessao_id: modeloSessaoId,
            treinamento_planejado_id: participante.treinamento_planejado_id,
            carga_horaria_total_minutos: fimMin - inicioMin,
            gera_ficha: participante.gera_ficha,
          });
        } else {
          if (
            current.treinamento_planejado_id &&
            participante.treinamento_planejado_id &&
            current.treinamento_planejado_id !== participante.treinamento_planejado_id
          ) {
            throw new Error(
              `Participante ${participante.funcionario_id} possui treinamento planejado conflitante para o modelo ${modeloSessaoId}`,
            );
          }

          if (!current.treinamento_planejado_id && participante.treinamento_planejado_id) {
            current.treinamento_planejado_id = participante.treinamento_planejado_id;
          }

          current.carga_horaria_total_minutos += fimMin - inicioMin;
          current.gera_ficha = current.gera_ficha || participante.gera_ficha;
        }
      }

      return {
        ...segmento,
        id: segmento.id || null,
        finalidade_codigo: segmento.finalidade_codigo || 'OUTRO',
        finalidade_titulo: segmento.finalidade_titulo || null,
        ordem: index + 1,
        inicio_min: inicioMin,
        fim_min: fimMin,
        duracao_minutos: fimMin - inicioMin,
        participantes: normalizedParticipants,
        curricular_assignment_keys: curricularParticipants
          .map((participante) => participante.assignment_key!)
          .sort(),
        curricular_funcionario_ids: curricularParticipants
          .map((participante) => participante.funcionario_id)
          .sort((left, right) => left - right),
        modelo_sessao_id: effectiveModelIds.size === 1 ? Array.from(effectiveModelIds)[0] : null,
      };
    })
    .sort((left, right) => left.inicio_min - right.inicio_min)
    .map((segmento, index) => ({
      ...segmento,
      ordem: index + 1,
    }));

  for (let index = 0; index < normalizedSegments.length; index += 1) {
    const current = normalizedSegments[index];
    const previous = normalizedSegments[index - 1];
    if (previous && current.inicio_min < previous.fim_min) {
      throw new Error('Segmentos não podem se sobrepor');
    }
    if (previous && current.inicio_min !== previous.fim_min) {
      throw new Error('A reserva compartilhada exige cobertura contínua entre segmentos');
    }
  }

  if (normalizedSegments[0]?.inicio_min !== reservaInicio) {
    throw new Error('Os segmentos precisam iniciar no começo da reserva');
  }
  if (normalizedSegments[normalizedSegments.length - 1]?.fim_min !== reservaFim) {
    throw new Error('Os segmentos precisam cobrir o final da reserva');
  }

  const assignmentPlans = Array.from(assignmentState.values()).sort((left, right) => {
    if (left.funcionario_id !== right.funcionario_id) {
      return left.funcionario_id - right.funcionario_id;
    }
    return left.modelo_sessao_id - right.modelo_sessao_id;
  }).map((assignment) => ({
    assignment_key: createSharedAssignmentKey(
      assignment.funcionario_id,
      assignment.modelo_sessao_id,
    ),
    funcionario_id: assignment.funcionario_id,
    modelo_sessao_id: assignment.modelo_sessao_id,
    treinamento_planejado_id: assignment.treinamento_planejado_id,
    carga_horaria_total_minutos: assignment.carga_horaria_total_minutos,
    gera_ficha: assignment.gera_ficha,
  }));

  if (assignmentPlans.length === 0) {
    throw new Error('A reserva compartilhada precisa atender ao menos um currículo');
  }

  const summarySeeds = participantes.map((participante) => {
    const participantAssignments = assignmentPlans.filter(
      (assignment) => assignment.funcionario_id === participante.funcionario_id,
    );
    return {
      funcionario_id: participante.funcionario_id,
      cumpre_treinamento: participantAssignments.length > 0,
      gera_ficha: participantAssignments.some((assignment) => assignment.gera_ficha),
    };
  });

  const summaries = calculateSharedSessionParticipantSummaries(
    summarySeeds,
    normalizedSegments,
  );

  for (const summary of summaries) {
    if (summary.total_minutos !== reservaFim - reservaInicio) {
      throw new Error(
        `Participante ${summary.funcionario_id} não cobre toda a reserva operacional`,
      );
    }
  }

  return {
    ...parsed,
    participantes,
    segmentos: normalizedSegments,
    resumo_participantes: summaries,
    atribuicoes_planejadas: assignmentPlans,
  };
}
