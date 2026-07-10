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
  cumpre_treinamento: z.coerce.boolean().default(false),
  treinamento_planejado_id: z.coerce.number().int().positive().nullable().optional(),
  modelo_sessao_id: z.coerce.number().int().positive().nullable().optional(),
  gera_ficha: z.coerce.boolean().optional(),
});

export const sharedSessionSegmentRoleSchema = z.object({
  funcionario_id: z.coerce.number().int().positive(),
  funcao: z.enum(['PF', 'PM']),
});

export const sharedSessionSegmentSchema = z.object({
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fim: z.string().regex(/^\d{2}:\d{2}$/),
  atribuicao_funcionario_id: z.coerce.number().int().positive().nullable().optional(),
  atribuicao_funcionario_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
  finalidade_codigo: z.enum(SHARED_SEGMENT_PURPOSE_CODES).optional().default('OUTRO'),
  finalidade_titulo: z.string().trim().max(120).nullable().optional(),
  funcoes: z.array(sharedSessionSegmentRoleSchema).min(2),
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
      .map((participante) => {
        const atribuicao = atribuicoes.find(
          (item) => Number(item.funcionario_id) === Number(participante.funcionario_id),
        );
        return {
          funcionario_id: Number(participante.funcionario_id),
          cumpre_treinamento: Boolean(atribuicao),
          modelo_sessao_id: atribuicao?.modelo_sessao_id || null,
          gera_ficha: Boolean(atribuicao?.gera_ficha),
        };
      })
      .sort((left, right) => left.funcionario_id - right.funcionario_id),
  );
}

export type NormalizedSharedSessionRequest = Omit<
  SharedSessionRequest,
  'participantes' | 'segmentos'
> & {
  participantes: Array<
    SharedSessionRequest['participantes'][number] & {
      gera_ficha: boolean;
    }
  >;
  segmentos: Array<
    SharedSessionRequest['segmentos'][number] & {
      ordem: number;
      inicio_min: number;
      fim_min: number;
      duracao_minutos: number;
      atribuicao_funcionario_ids: number[];
      finalidade_codigo: SharedSegmentPurpose;
      finalidade_titulo: string | null;
    }
  >;
  resumo_participantes: SharedSessionSummary[];
};

function timeToMinutesStrict(value: string): number {
  const [hoursText, minutesText] = value.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return hours * 60 + minutes;
}

export function calculateSharedSessionParticipantSummaries(
  participantes: Array<{ funcionario_id: number; cumpre_treinamento: boolean; gera_ficha: boolean }>,
  segmentos: Array<{
    duracao_minutos: number;
    atribuicao_funcionario_id?: number | null;
    atribuicao_funcionario_ids?: number[] | null;
    funcoes: Array<{ funcionario_id: number; funcao: SharedRole }>;
  }>,
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
    for (const funcao of segmento.funcoes) {
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

    const explicitCurricularIds = Array.from(
      new Set(
        (segmento.atribuicao_funcionario_ids || [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
    const curricularIds =
      explicitCurricularIds.length > 0
        ? explicitCurricularIds
        : segmento.atribuicao_funcionario_id
          ? [Number(segmento.atribuicao_funcionario_id)]
          : [];

    for (const funcionarioId of curricularIds) {
      const summary = map.get(funcionarioId);
      if (summary) {
        summary.curricular_minutos += segmento.duracao_minutos;
      }
    }
  }

  return Array.from(map.values()).sort((left, right) => left.funcionario_id - right.funcionario_id);
}

export function validateAndNormalizeSharedSessionRequest(
  input: unknown,
): NormalizedSharedSessionRequest {
  const parsed = sharedSessionRequestSchema.parse(input);
  const participanteIds = new Set<number>();
  const participantes = parsed.participantes.map((participante) => {
    if (participanteIds.has(participante.funcionario_id)) {
      throw new Error(`Participante duplicado: ${participante.funcionario_id}`);
    }
    participanteIds.add(participante.funcionario_id);

    const gera_ficha =
      participante.gera_ficha !== undefined
        ? participante.gera_ficha
        : participante.cumpre_treinamento;

    if (participante.cumpre_treinamento && !participante.modelo_sessao_id) {
      throw new Error(
        `Participante ${participante.funcionario_id} precisa informar modelo_sessao_id`,
      );
    }

    if (!participante.cumpre_treinamento && participante.modelo_sessao_id) {
      throw new Error(
        `Participante ${participante.funcionario_id} não pode informar modelo_sessao_id como apoio`,
      );
    }

    if (!participante.cumpre_treinamento && gera_ficha) {
      throw new Error(
        `Participante ${participante.funcionario_id} não pode gerar ficha sem atribuição curricular`,
      );
    }

    return {
      ...participante,
      gera_ficha,
    };
  });

  const reservaInicio = timeToMinutesStrict(parsed.hora_inicio);
  const reservaFim = timeToMinutesStrict(parsed.hora_fim);
  if (reservaFim <= reservaInicio) {
    throw new Error('A reserva compartilhada deve terminar após o horário inicial');
  }

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

      for (const funcao of segmento.funcoes) {
        if (!participanteIds.has(funcao.funcionario_id)) {
          throw new Error(`Função referencia participante fora da reserva: ${funcao.funcionario_id}`);
        }
        if (funcaoPorParticipante.has(funcao.funcionario_id)) {
          throw new Error(`Participante ${funcao.funcionario_id} possui função duplicada no segmento ${index + 1}`);
        }
        funcaoPorParticipante.set(funcao.funcionario_id, funcao.funcao);
        if (funcao.funcao === 'PF') pfCount += 1;
        if (funcao.funcao === 'PM') pmCount += 1;
      }

      if (pfCount !== 1) {
        throw new Error(`Segmento ${index + 1} precisa ter exatamente um PF`);
      }
      if (pmCount !== 1) {
        throw new Error(`Segmento ${index + 1} precisa ter exatamente um PM`);
      }

      const explicitCurricularIds = Array.from(
        new Set(
          (segmento.atribuicao_funcionario_ids || [])
            .map((id) => Number(id))
            .filter((id) => Number.isInteger(id) && id > 0),
        ),
      );
      const curricularIds =
        explicitCurricularIds.length > 0
          ? explicitCurricularIds
          : segmento.atribuicao_funcionario_id
            ? [Number(segmento.atribuicao_funcionario_id)]
            : [];

      if (curricularIds.length === 0) {
        throw new Error(`Segmento ${index + 1} precisa atender ao menos um currículo`);
      }

      for (const funcionarioId of curricularIds) {
        const participante = participantes.find(
          (item) => item.funcionario_id === funcionarioId,
        );
        if (!participante?.cumpre_treinamento) {
          throw new Error(
            `Segmento ${index + 1} referencia atribuição curricular inválida para ${funcionarioId}`,
          );
        }
      }

      return {
        ...segmento,
        atribuicao_funcionario_ids: curricularIds,
        finalidade_codigo: segmento.finalidade_codigo || 'OUTRO',
        finalidade_titulo: segmento.finalidade_titulo || null,
        ordem: index + 1,
        inicio_min: inicioMin,
        fim_min: fimMin,
        duracao_minutos: fimMin - inicioMin,
      };
    })
    .sort((left, right) => left.inicio_min - right.inicio_min);

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

  const summaries = calculateSharedSessionParticipantSummaries(participantes, normalizedSegments);

  for (const summary of summaries) {
    if (summary.total_minutos !== reservaFim - reservaInicio) {
      throw new Error(
        `Participante ${summary.funcionario_id} não cobre toda a reserva operacional`,
      );
    }
    if (summary.cumpre_treinamento && summary.curricular_minutos <= 0) {
      throw new Error(
        `Participante ${summary.funcionario_id} cumpre treinamento, mas não possui minutos curriculares`,
      );
    }
  }

  return {
    ...parsed,
    participantes,
    segmentos: normalizedSegments,
    resumo_participantes: summaries,
  };
}
