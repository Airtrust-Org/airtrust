export const FADIGA_ACUMULADA_LIMITES = {
  JORNADA_MENSAL_HORAS: 176,
  HV_MENSAL_HORAS: 90,
  JORNADA_DIARIA_HORAS: 11,
  HV_DIARIA_HORAS: 8,
} as const;

export type FadigaIntegridadeCodigo = 'HV_MAIOR_QUE_JORNADA';

export interface JornadaFadigaAcumuladaInput {
  data: string;
  dia_ciclo_embarcado?: number | null;
  duracao_jornada_minutos: number | null;
  horas_voo_minutos: number | null;
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
  inconsistencias: FadigaIntegridadeCodigo[];
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
}): JornadaFadigaAcumuladaOutput {
  const jornadaDiariaMin = Math.max(0, params.jornada.duracao_jornada_minutos ?? 0);
  const vooDiarioMin = Math.max(0, params.jornada.horas_voo_minutos ?? 0);
  const jornadaAcumuladaMin = params.acumuladoJornadaMinAnterior + jornadaDiariaMin;
  const vooAcumuladoMin = params.acumuladoVooMinAnterior + vooDiarioMin;
  const inconsistencias: FadigaIntegridadeCodigo[] = [];

  if (vooDiarioMin > jornadaDiariaMin) {
    inconsistencias.push('HV_MAIOR_QUE_JORNADA');
  }

  const pctJornadaDiaria = pct(jornadaDiariaMin, FADIGA_ACUMULADA_LIMITES.JORNADA_DIARIA_HORAS);
  const pctVooDiaria = pct(vooDiarioMin, FADIGA_ACUMULADA_LIMITES.HV_DIARIA_HORAS);
  const pctJornadaMes = pct(jornadaAcumuladaMin, FADIGA_ACUMULADA_LIMITES.JORNADA_MENSAL_HORAS);
  const pctVooMes = pct(vooAcumuladoMin, FADIGA_ACUMULADA_LIMITES.HV_MENSAL_HORAS);

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
    integridade_status: inconsistencias.length ? 'INCONSISTENTE' : 'OK',
    inconsistencias,
  };
}

export function calcularEvolucaoFadigaAcumulada(
  jornadas: JornadaFadigaAcumuladaInput[],
): JornadaFadigaAcumuladaOutput[] {
  let acumuladoJornadaMin = 0;
  let acumuladoVooMin = 0;

  return jornadas.map((jornada) => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada,
      acumuladoJornadaMinAnterior: acumuladoJornadaMin,
      acumuladoVooMinAnterior: acumuladoVooMin,
    });
    acumuladoJornadaMin = linha.jornada_acumulada_min;
    acumuladoVooMin = linha.voo_acumulado_min;
    return linha;
  });
}
