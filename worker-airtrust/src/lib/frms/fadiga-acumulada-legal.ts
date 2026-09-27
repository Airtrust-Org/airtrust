import {
  avaliarIntegridadeJornadaFrms,
  type FrmsIntegridadeCodigo,
} from './integridade';

export interface FadigaAcumuladaDiagnosticLimits {
  fdpDiarioHoras: number;
  hvDiariaHoras: number;
  hvMensalHoras: number;
}

const DIAGNOSTIC_FALLBACK_LIMITS: FadigaAcumuladaDiagnosticLimits = {
  fdpDiarioHoras: 11,
  hvDiariaHoras: 8,
  hvMensalHoras: 90,
};

export type FadigaIntegridadeCodigo = FrmsIntegridadeCodigo;

export interface JornadaFadigaAcumuladaInput {
  data: string;
  dia_ciclo_embarcado?: number | null;
  duracao_jornada_minutos: number | null;
  horas_voo_minutos: number | null;
  hora_apresentacao?: string | null;
  hora_termino?: string | null;
}

export interface JornadaFadigaAcumuladaOutput {
  data: string;
  dia_ciclo: number | null;
  jornada_diaria_min: number;
  voo_diario_min: number;
  jornada_horas: number;
  voo_horas: number;
  jornada_acumulada_min: number;
  voo_acumulado_min: number;
  jornada_acumulada_horas: number;
  voo_acumulado_horas: number;
  pct_jornada: number;
  pct_voo: number;
  pct_jornada_diaria: number;
  pct_voo_diaria: number;
  pct_jornada_mes: number;
  pct_voo_mes: number;
  integridade_status: 'OK' | 'INCONSISTENTE';
  integridade_codigo: FadigaIntegridadeCodigo | null;
  integridade_codigos: FadigaIntegridadeCodigo[];
  integridade_mensagem: string | null;
  integridade_mensagens: string[];
  inconsistencias: FadigaIntegridadeCodigo[];
  valores_brutos: {
    duracao_jornada_minutos: number | null;
    horas_voo_minutos: number | null;
    hora_apresentacao: string | null;
    hora_termino: string | null;
  };
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function pct(valorMin: number, limiteHoras: number): number {
  const limiteMin = limiteHoras * 60;
  return limiteMin > 0 ? (valorMin / limiteMin) * 100 : 0;
}

export function calcularLinhaFadigaAcumulada(params: {
  jornada: JornadaFadigaAcumuladaInput;
  acumuladoJornadaMinAnterior: number;
  acumuladoVooMinAnterior: number;
  limites?: FadigaAcumuladaDiagnosticLimits;
}): JornadaFadigaAcumuladaOutput {
  const jornadaDiariaMin = Math.max(0, params.jornada.duracao_jornada_minutos ?? 0);
  const vooDiarioMin = Math.max(0, params.jornada.horas_voo_minutos ?? 0);
  const jornadaAcumuladaMin = params.acumuladoJornadaMinAnterior + jornadaDiariaMin;
  const vooAcumuladoMin = params.acumuladoVooMinAnterior + vooDiarioMin;
  const integridade = avaliarIntegridadeJornadaFrms({
    duracao_jornada_minutos: params.jornada.duracao_jornada_minutos,
    horas_voo_minutos: params.jornada.horas_voo_minutos,
    hora_apresentacao: params.jornada.hora_apresentacao,
    hora_termino: params.jornada.hora_termino,
  });

  const limites = params.limites ?? DIAGNOSTIC_FALLBACK_LIMITS;
  const pctJornadaDiaria = pct(jornadaDiariaMin, limites.fdpDiarioHoras);
  const pctVooDiaria = pct(vooDiarioMin, limites.hvDiariaHoras);
  // Jornada acumulada no mês não equivale ao tempo legal de trabalho; o valor
  // percentual é deliberadamente neutro e não deve ser usado para compliance.
  const pctJornadaMes = 0;
  const pctVooMes = pct(vooAcumuladoMin, limites.hvMensalHoras);

  return {
    data: params.jornada.data,
    dia_ciclo: params.jornada.dia_ciclo_embarcado ?? null,
    jornada_diaria_min: jornadaDiariaMin,
    voo_diario_min: vooDiarioMin,
    jornada_horas: round1(jornadaDiariaMin / 60),
    voo_horas: round1(vooDiarioMin / 60),
    jornada_acumulada_min: jornadaAcumuladaMin,
    voo_acumulado_min: vooAcumuladoMin,
    jornada_acumulada_horas: round1(jornadaAcumuladaMin / 60),
    voo_acumulado_horas: round1(vooAcumuladoMin / 60),
    pct_jornada: round3(pctJornadaDiaria),
    pct_voo: round3(pctVooDiaria),
    pct_jornada_diaria: round3(pctJornadaDiaria),
    pct_voo_diaria: round3(pctVooDiaria),
    pct_jornada_mes: round3(pctJornadaMes),
    pct_voo_mes: round3(pctVooMes),
    integridade_status: integridade.integridade_status,
    integridade_codigo: integridade.integridade_codigo,
    integridade_codigos: integridade.integridade_codigos,
    integridade_mensagem: integridade.integridade_mensagem,
    integridade_mensagens: integridade.integridade_mensagens,
    inconsistencias: integridade.integridade_codigos,
    valores_brutos: integridade.valores_brutos,
  };
}

export function calcularEvolucaoFadigaAcumulada(
  jornadas: JornadaFadigaAcumuladaInput[],
  limites?: FadigaAcumuladaDiagnosticLimits,
): JornadaFadigaAcumuladaOutput[] {
  let acumuladoJornadaMin = 0;
  let acumuladoVooMin = 0;

  return jornadas.map((jornada) => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada,
      acumuladoJornadaMinAnterior: acumuladoJornadaMin,
      acumuladoVooMinAnterior: acumuladoVooMin,
      limites,
    });
    acumuladoJornadaMin = linha.jornada_acumulada_min;
    acumuladoVooMin = linha.voo_acumulado_min;
    return linha;
  });
}
