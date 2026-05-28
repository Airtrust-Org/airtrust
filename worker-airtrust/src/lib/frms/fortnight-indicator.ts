export type FrmsFortnightDataSource =
  | 'REAL'
  | 'DERIVADO'
  | 'ESTIMADO'
  | 'AUSENTE'
  | 'INCOMPLETO';

export type FrmsFortnightStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';

export interface FrmsFortnightIndicator {
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_periodo: number | null;
  total_dias_periodo: number | null;
  dias_consecutivos_com_jornada: number | null;
  dias_com_checkin_pendente: number | null;
  dias_com_dado_estimado: number | null;
  duty_time_periodo_min: number | null;
  duty_time_168h_min: number | null;
  horas_voo_periodo_min: number | null;
  horas_voo_168h_min: number | null;
  jornadas_periodo: number | null;
  apresentacoes_antes_0600: number | null;
  apresentacoes_antes_0700: number | null;
  menor_descanso_entre_jornadas_min: number | null;
  setores_periodo: number | null;
  sit_periods_estimados: number | null;
  fonte_periodo: FrmsFortnightDataSource;
  status_quinzena: FrmsFortnightStatus;
  alertas_quinzena: string[];
  limitation_notes: string[];
}

export interface FrmsFortnightIndicatorItemSeed {
  data_operacional: string;
  funcionario_id: number;
  snapshot_status: 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';
  checkin_status: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  sleep_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  wake_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  jornada_data_source: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_minutos: number;
  horas_voo_minutos: number;
  teve_jornada: boolean;
  dia_periodo_embarcado: number | null;
  total_dias_periodo: number | null;
}

export interface BuildFrmsFortnightIndicatorInput {
  items: FrmsFortnightIndicatorItemSeed[];
  windowStart: string;
  windowEnd: string;
}

interface PeriodAnchor {
  funcionario_id: number;
  periodo_inicio: string;
  periodo_fim: string;
  dia_periodo: number;
  total_dias_periodo: number;
}

function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, days: number): string {
  const date = parseDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function dayDiff(startIso: string, endIso: string): number {
  const start = parseDate(startIso).getTime();
  const end = parseDate(endIso).getTime();
  return Math.floor((end - start) / 86400000);
}

function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isTimeBefore(value: string | null, threshold: string): boolean {
  const time = parseTimeToMinutes(value);
  const thresholdMinutes = parseTimeToMinutes(threshold);
  if (time == null || thresholdMinutes == null) return false;
  return time < thresholdMinutes;
}

function resolvePeriodAnchor(item: FrmsFortnightIndicatorItemSeed): PeriodAnchor | null {
  const dia = item.dia_periodo_embarcado;
  const total = item.total_dias_periodo;
  if (!dia || !total || dia <= 0 || total <= 0 || dia > total) return null;

  const periodo_inicio = addDays(item.data_operacional, -(dia - 1));
  const periodo_fim = addDays(periodo_inicio, total - 1);
  return {
    funcionario_id: item.funcionario_id,
    periodo_inicio,
    periodo_fim,
    dia_periodo: dia,
    total_dias_periodo: total,
  };
}

function countMaxConsecutiveDays(items: FrmsFortnightIndicatorItemSeed[]): number {
  const dias = items
    .filter((item) => item.teve_jornada)
    .map((item) => item.data_operacional)
    .sort();
  if (dias.length === 0) return 0;

  let max = 1;
  let current = 1;
  for (let i = 1; i < dias.length; i += 1) {
    const delta = dayDiff(dias[i - 1], dias[i]);
    if (delta === 1) {
      current += 1;
    } else if (delta > 1) {
      current = 1;
    }
    if (current > max) max = current;
  }
  return max;
}

function resolveMinRestBetweenJornadas(items: FrmsFortnightIndicatorItemSeed[]): number | null {
  const jornadas = items
    .filter((item) => item.teve_jornada)
    .sort((a, b) => (a.data_operacional < b.data_operacional ? -1 : a.data_operacional > b.data_operacional ? 1 : 0));

  let minRest: number | null = null;
  for (let i = 1; i < jornadas.length; i += 1) {
    const prev = jornadas[i - 1];
    const curr = jornadas[i];
    const prevEnd = parseTimeToMinutes(prev.hora_termino);
    const currStart = parseTimeToMinutes(curr.hora_apresentacao);
    if (prevEnd == null || currStart == null) continue;

    const deltaDays = dayDiff(prev.data_operacional, curr.data_operacional);
    if (deltaDays < 0) continue;
    let rest = deltaDays * 1440 + currStart - prevEnd;
    if (rest < 0) rest += 1440;
    if (minRest == null || rest < minRest) minRest = rest;
  }

  return minRest;
}

function buildEmptyIndicator(): FrmsFortnightIndicator {
  return {
    periodo_inicio: null,
    periodo_fim: null,
    dia_periodo: null,
    total_dias_periodo: null,
    dias_consecutivos_com_jornada: null,
    dias_com_checkin_pendente: null,
    dias_com_dado_estimado: null,
    duty_time_periodo_min: null,
    duty_time_168h_min: null,
    horas_voo_periodo_min: null,
    horas_voo_168h_min: null,
    jornadas_periodo: null,
    apresentacoes_antes_0600: null,
    apresentacoes_antes_0700: null,
    menor_descanso_entre_jornadas_min: null,
    setores_periodo: null,
    sit_periods_estimados: null,
    fonte_periodo: 'AUSENTE',
    status_quinzena: 'INCOMPLETO',
    alertas_quinzena: [],
    limitation_notes: [],
  };
}

function buildRolling168h(
  employeeItems: FrmsFortnightIndicatorItemSeed[],
  anchorDate: string,
): { dutyMin: number; vooMin: number } {
  const startDate = addDays(anchorDate, -6);
  const relevant = employeeItems.filter(
    (item) =>
      item.teve_jornada &&
      item.data_operacional >= startDate &&
      item.data_operacional <= anchorDate,
  );

  return {
    dutyMin: relevant.reduce((sum, item) => sum + Math.max(0, item.duracao_jornada_minutos || 0), 0),
    vooMin: relevant.reduce((sum, item) => sum + Math.max(0, item.horas_voo_minutos || 0), 0),
  };
}

export function buildFrmsFortnightIndicatorMap(
  input: BuildFrmsFortnightIndicatorInput,
): Map<string, FrmsFortnightIndicator> {
  const result = new Map<string, FrmsFortnightIndicator>();
  const employeeMap = new Map<number, FrmsFortnightIndicatorItemSeed[]>();

  for (const item of input.items) {
    if (!employeeMap.has(item.funcionario_id)) {
      employeeMap.set(item.funcionario_id, []);
    }
    employeeMap.get(item.funcionario_id)!.push(item);
  }

  const periodItems = new Map<string, FrmsFortnightIndicatorItemSeed[]>();
  const periodAnchorsByEmployee = new Map<number, PeriodAnchor[]>();

  for (const item of input.items) {
    const anchor = resolvePeriodAnchor(item);
    if (!anchor) continue;
    const periodKey = `${anchor.funcionario_id}::${anchor.periodo_inicio}::${anchor.periodo_fim}`;
    if (!periodItems.has(periodKey)) {
      periodItems.set(periodKey, []);
    }
    periodItems.get(periodKey)!.push(item);
    if (!periodAnchorsByEmployee.has(anchor.funcionario_id)) {
      periodAnchorsByEmployee.set(anchor.funcionario_id, []);
    }
    periodAnchorsByEmployee.get(anchor.funcionario_id)!.push(anchor);
  }

  for (const item of input.items) {
    const itemKey = `${item.data_operacional}::${item.funcionario_id}`;
    const directAnchor = resolvePeriodAnchor(item);
    const fallbackAnchor =
      directAnchor == null
        ? (periodAnchorsByEmployee.get(item.funcionario_id) || []).find(
            (candidate) =>
              item.data_operacional >= candidate.periodo_inicio &&
              item.data_operacional <= candidate.periodo_fim,
          ) ?? null
        : null;
    const anchor = directAnchor ?? fallbackAnchor;
    if (!anchor) {
      const empty = buildEmptyIndicator();
      empty.alertas_quinzena = ['PERIODO_QUINZENA_AUSENTE'];
      empty.limitation_notes = [
        'Dia/total de período embarcado ausente para esta jornada.',
        'Sem quinzena explícita não é possível acumular o período com segurança.',
      ];
      result.set(itemKey, empty);
      continue;
    }

    const periodKey = `${anchor.funcionario_id}::${anchor.periodo_inicio}::${anchor.periodo_fim}`;
    const scoped =
      periodItems.get(periodKey)?.filter(
        (entry) =>
          entry.data_operacional >= anchor.periodo_inicio &&
          entry.data_operacional <= anchor.periodo_fim,
      ) ?? [];

    const dutyTimePeriodoMin = scoped.reduce(
      (sum, entry) => sum + (entry.teve_jornada ? Math.max(0, entry.duracao_jornada_minutos || 0) : 0),
      0,
    );
    const horasVooPeriodoMin = scoped.reduce(
      (sum, entry) => sum + (entry.teve_jornada ? Math.max(0, entry.horas_voo_minutos || 0) : 0),
      0,
    );
    const jornadasPeriodo = scoped.filter((entry) => entry.teve_jornada).length;
    const diasComCheckinPendente = scoped.filter(
      (entry) => entry.checkin_status === 'PENDENTE' || entry.checkin_status === 'AUSENTE',
    ).length;
    const diasComDadoEstimado = scoped.filter(
      (entry) =>
        entry.sleep_data_source === 'ESTIMADO' ||
        entry.wake_data_source === 'ESTIMADO' ||
        entry.jornada_data_source === 'ESTIMADO' ||
        entry.jornada_data_source === 'INCONSISTENTE',
    ).length;
    const apresentacoesAntes0600 = scoped.filter((entry) => isTimeBefore(entry.hora_apresentacao, '06:00')).length;
    const apresentacoesAntes0700 = scoped.filter((entry) => isTimeBefore(entry.hora_apresentacao, '07:00')).length;
    const diasConsecutivosComJornada = countMaxConsecutiveDays(scoped);
    const menorDescansoEntreJornadasMin = resolveMinRestBetweenJornadas(scoped);

    const employeeItems = employeeMap.get(item.funcionario_id) ?? [];
    const rolling168h = buildRolling168h(employeeItems, item.data_operacional);

    const periodFullyCoveredByQuery =
      input.windowStart <= anchor.periodo_inicio && input.windowEnd >= anchor.periodo_fim;

    const periodHasCritical = scoped.some((entry) => entry.snapshot_status === 'CRITICO');
    const periodHasAttention = scoped.some(
      (entry) => entry.snapshot_status === 'ATENCAO' || entry.snapshot_status === 'INCOMPLETO',
    );

    const alertasQuinzena: string[] = [];
    if (!periodFullyCoveredByQuery) alertasQuinzena.push('PERIODO_PARCIAL_NA_CONSULTA');
    if (diasComCheckinPendente > 0) alertasQuinzena.push('CHECKIN_PENDENTE_NO_PERIODO');
    if (diasComDadoEstimado > 0) alertasQuinzena.push('DADOS_ESTIMADOS_NO_PERIODO');
    if (periodHasCritical) alertasQuinzena.push('RISCO_DIARIO_CRITICO_NO_PERIODO');

    const limitationNotes: string[] = [
      'Indicador descritivo operacional; não é diagnóstico de fadiga fisiológica.',
      'Setores/trechos e sit periods ainda não entram de forma robusta neste cálculo.',
    ];
    if (!directAnchor && fallbackAnchor) {
      limitationNotes.push(
        'Dia/total do período não veio na linha atual; período inferido por jornadas vizinhas do mesmo tripulante.',
      );
    }
    if (!periodFullyCoveredByQuery) {
      limitationNotes.push(
        'Janela consultada não cobre toda a quinzena; os acumulados refletem apenas os dados visíveis na consulta.',
      );
    }

    const fontePeriodo: FrmsFortnightDataSource = periodFullyCoveredByQuery
      ? 'DERIVADO'
      : 'INCOMPLETO';
    const statusQuinzena: FrmsFortnightStatus =
      fontePeriodo === 'INCOMPLETO'
        ? 'INCOMPLETO'
        : periodHasCritical
          ? 'CRITICO'
          : periodHasAttention || diasComCheckinPendente > 0 || diasComDadoEstimado > 0
            ? 'ATENCAO'
            : 'OK';

    result.set(itemKey, {
      periodo_inicio: anchor.periodo_inicio,
      periodo_fim: anchor.periodo_fim,
      dia_periodo: anchor.dia_periodo,
      total_dias_periodo: anchor.total_dias_periodo,
      dias_consecutivos_com_jornada: diasConsecutivosComJornada,
      dias_com_checkin_pendente: diasComCheckinPendente,
      dias_com_dado_estimado: diasComDadoEstimado,
      duty_time_periodo_min: dutyTimePeriodoMin,
      duty_time_168h_min: rolling168h.dutyMin,
      horas_voo_periodo_min: horasVooPeriodoMin,
      horas_voo_168h_min: rolling168h.vooMin,
      jornadas_periodo: jornadasPeriodo,
      apresentacoes_antes_0600: apresentacoesAntes0600,
      apresentacoes_antes_0700: apresentacoesAntes0700,
      menor_descanso_entre_jornadas_min: menorDescansoEntreJornadasMin,
      setores_periodo: null,
      sit_periods_estimados: null,
      fonte_periodo: fontePeriodo,
      status_quinzena: statusQuinzena,
      alertas_quinzena: alertasQuinzena,
      limitation_notes: limitationNotes,
    });
  }

  return result;
}
