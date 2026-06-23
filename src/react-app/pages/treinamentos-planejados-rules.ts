import type { TreinamentoPlanejado, TreinamentoPlanejadoStatus } from '@/react-app/hooks/useTreinamentosPlanejados';

type DiaEfetivo = {
  data: string;
};

type ConclusaoEligibilityInput = Pick<
  TreinamentoPlanejado,
  'status' | 'data_prevista' | 'data_fim' | 'read_only'
> & {
  participantes?: Array<unknown>;
};

export function validateTreinamentoDateRange(
  dataInicial: string,
  dataFinal: string,
): string | null {
  if (!dataInicial) {
    return 'Informe a data inicial do treinamento.';
  }
  if (!dataFinal) {
    return 'Informe a data final do treinamento.';
  }
  if (dataInicial > dataFinal) {
    return 'Data inicial não pode ser posterior à data final.';
  }
  return null;
}

export function validateTreinamentoDiasEfetivos(
  dataInicial: string,
  dataFinal: string,
  dias: DiaEfetivo[],
): string | null {
  if (dias.some((dia) => dia.data < dataInicial || dia.data > dataFinal)) {
    return 'Dias efetivos devem estar dentro do período da turma.';
  }
  return null;
}

export function validateTreinamentoConclusaoState(params: {
  status: TreinamentoPlanejadoStatus;
  dataFinal: string;
  participantesCount: number;
  today: string;
}): string | null {
  const { status, dataFinal, participantesCount, today } = params;
  if (status !== 'CONCLUIDO') {
    return null;
  }
  if (participantesCount === 0) {
    return 'Não é permitido concluir turma sem participantes vinculados.';
  }
  if (dataFinal > today) {
    return 'Turma concluída não pode ter período futuro.';
  }
  return null;
}

export function getTreinamentoConclusaoEligibility(
  treinamento: ConclusaoEligibilityInput,
  today: string,
): { eligible: boolean; reason: string | null } {
  if (treinamento.read_only) {
    return { eligible: false, reason: 'Origem somente leitura.' };
  }

  if (treinamento.status === 'CONCLUIDO') {
    return { eligible: false, reason: 'Turma já concluída.' };
  }

  if (treinamento.status === 'CANCELADO') {
    return { eligible: false, reason: 'Turma cancelada.' };
  }

  if ((treinamento.participantes || []).length === 0) {
    return { eligible: false, reason: 'Turma sem participantes vinculados.' };
  }

  const dataFinal = treinamento.data_fim || treinamento.data_prevista || '';
  if (!dataFinal || dataFinal > today) {
    return { eligible: false, reason: 'Turma ainda não está apta para conclusão.' };
  }

  return { eligible: true, reason: null };
}
