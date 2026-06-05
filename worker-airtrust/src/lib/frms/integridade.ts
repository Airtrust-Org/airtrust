export type FrmsIntegridadeCodigo =
  | 'HV_MAIOR_QUE_JORNADA'
  | 'JORNADA_ZERO_COM_HV'
  | 'JORNADA_AUSENTE_COM_HV'
  | 'HORARIO_INCOMPLETO_COM_HV';

export type FrmsIntegridadeStatus = 'OK' | 'INCONSISTENTE';

export interface FrmsIntegridadeInput {
  duracao_jornada_minutos?: number | null;
  horas_voo_minutos?: number | null;
  hora_apresentacao?: string | null;
  hora_termino?: string | null;
}

export interface FrmsIntegridadeResultado {
  integridade_status: FrmsIntegridadeStatus;
  integridade_codigo: FrmsIntegridadeCodigo | null;
  integridade_codigos: FrmsIntegridadeCodigo[];
  integridade_mensagem: string | null;
  integridade_mensagens: string[];
  valores_brutos: {
    duracao_jornada_minutos: number | null;
    horas_voo_minutos: number | null;
    hora_apresentacao: string | null;
    hora_termino: string | null;
  };
}

function normalizeMinutes(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

export function mensagemIntegridadeFrms(codigo: FrmsIntegridadeCodigo): string {
  switch (codigo) {
    case 'JORNADA_ZERO_COM_HV':
      return 'Horas de voo positivas com jornada zerada; verificar origem FIRA/SIGVOOS.';
    case 'JORNADA_AUSENTE_COM_HV':
      return 'Horas de voo positivas sem duração de jornada informada; verificar origem FIRA/SIGVOOS.';
    case 'HORARIO_INCOMPLETO_COM_HV':
      return 'Horas de voo positivas com horário de apresentação ou término incompleto.';
    case 'HV_MAIOR_QUE_JORNADA':
      return 'Horas de voo excedem a duração de jornada registrada.';
  }
}

export function avaliarIntegridadeJornadaFrms(
  input: FrmsIntegridadeInput,
): FrmsIntegridadeResultado {
  const duracaoJornadaMin = normalizeMinutes(input.duracao_jornada_minutos);
  const horasVooMin = normalizeMinutes(input.horas_voo_minutos);
  const horaApresentacao = input.hora_apresentacao ?? null;
  const horaTermino = input.hora_termino ?? null;
  const codigos: FrmsIntegridadeCodigo[] = [];
  const hvPositiva = horasVooMin !== null && horasVooMin > 0;

  if (hvPositiva) {
    if (duracaoJornadaMin === null) {
      pushUnique(codigos, 'JORNADA_AUSENTE_COM_HV');
    } else if (duracaoJornadaMin === 0) {
      pushUnique(codigos, 'JORNADA_ZERO_COM_HV');
    }

    if (!horaApresentacao || !horaTermino) {
      pushUnique(codigos, 'HORARIO_INCOMPLETO_COM_HV');
    }
  }

  if (horasVooMin !== null && duracaoJornadaMin !== null && horasVooMin > duracaoJornadaMin) {
    pushUnique(codigos, 'HV_MAIOR_QUE_JORNADA');
  }

  const mensagens = codigos.map(mensagemIntegridadeFrms);

  return {
    integridade_status: codigos.length > 0 ? 'INCONSISTENTE' : 'OK',
    integridade_codigo: codigos[0] ?? null,
    integridade_codigos: codigos,
    integridade_mensagem: mensagens[0] ?? null,
    integridade_mensagens: mensagens,
    valores_brutos: {
      duracao_jornada_minutos: duracaoJornadaMin,
      horas_voo_minutos: horasVooMin,
      hora_apresentacao: horaApresentacao,
      hora_termino: horaTermino,
    },
  };
}
