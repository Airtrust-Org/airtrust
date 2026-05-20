import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
} from '../../hooks/queries/useEscalasQuery';

export function isAlocacaoOperacionalComAeronave(alocacao: EscalaAlocacao): boolean {
  if (alocacao.situacao_tipo) return false;

  return Boolean(
    alocacao.aeronave_id != null ||
    alocacao.aeronave_prefixo ||
    alocacao.aeronave?.prefixo ||
    alocacao.aeronave_modelo ||
    alocacao.aeronave?.modelo,
  );
}

function overlapsPeriodo(
  dataInicio: string,
  dataFim: string,
  intervaloInicio: string,
  intervaloFim: string,
) {
  return !(dataFim < intervaloInicio || dataInicio > intervaloFim);
}

function getAlocacaoVisualPrioridade(alocacao: EscalaAlocacao): number {
  const situacaoTipo = alocacao.situacao_tipo as string | null | undefined;

  if (situacaoTipo === 'FERIAS') return 0;
  if (
    situacaoTipo === 'SIM' ||
    situacaoTipo === 'CURSO' ||
    situacaoTipo === 'MED' ||
    situacaoTipo === 'AFT'
  ) {
    return 1;
  }
  if (isAlocacaoOperacionalComAeronave(alocacao)) return 2;
  if (situacaoTipo === 'STB') return 3;
  if (situacaoTipo === 'FOLGA') return 4;
  return 5;
}

export function chooseTripulanteDayAlocacao(
  alocacoes: EscalaAlocacao[],
  diaIso: string,
): EscalaAlocacao | null {
  return alocacoes.reduce<EscalaAlocacao | null>((melhor, atual) => {
    const ativaNoDia = atual.data_inicio <= diaIso && atual.data_fim >= diaIso;
    if (!ativaNoDia) return melhor;
    if (!melhor) return atual;

    const prioridadeAtual = getAlocacaoVisualPrioridade(atual);
    const prioridadeMelhor = getAlocacaoVisualPrioridade(melhor);
    if (prioridadeAtual !== prioridadeMelhor) {
      return prioridadeAtual < prioridadeMelhor ? atual : melhor;
    }

    const atualManual = !(atual.auto_gerado === 1 || atual.auto_gerado === true);
    const melhorManual = !(melhor.auto_gerado === 1 || melhor.auto_gerado === true);
    if (atualManual !== melhorManual) {
      return atualManual ? atual : melhor;
    }

    return atual.updated_at > melhor.updated_at ? atual : melhor;
  }, null);
}

export function isOppositeTripulanteQuinzenaDay(
  tripulanteQuinzena: number | null | undefined,
  quinzenaNumero: 1 | 2,
): boolean {
  if (tripulanteQuinzena !== 1 && tripulanteQuinzena !== 2) {
    return false;
  }

  return tripulanteQuinzena !== quinzenaNumero;
}

export function buildTripulanteAlocacoesMap(params: {
  tripulantes: EscalaCoberturaTripulante[];
  alocacoes: EscalaAlocacao[];
  intervaloInicio: string;
  intervaloFim: string;
}): Map<string, EscalaAlocacao[]> {
  const { tripulantes, alocacoes, intervaloInicio, intervaloFim } = params;
  const ids = new Set(tripulantes.map((tripulante) => tripulante.id));
  const mapa = new Map<string, EscalaAlocacao[]>();

  if (!intervaloInicio || !intervaloFim) {
    return mapa;
  }

  for (const alocacao of alocacoes) {
    if (!alocacao.funcionario_id || !ids.has(alocacao.funcionario_id)) continue;
    if (!overlapsPeriodo(alocacao.data_inicio, alocacao.data_fim, intervaloInicio, intervaloFim)) {
      continue;
    }

    const existentes = mapa.get(alocacao.funcionario_id) || [];
    existentes.push(alocacao);
    mapa.set(alocacao.funcionario_id, existentes);
  }

  return mapa;
}
