export type FrmsActivityType = 'TREINAMENTO' | 'SIMULADOR';

export interface FrmsActivitySnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  activity_type: FrmsActivityType;
  hora_inicio: string | null;
  hora_fim: string | null;
  titulo: string | null;
  source_id: number | string | null;
}

export interface FrmsActivitySummary {
  activity_type: 'VOO' | 'TREINAMENTO' | 'SIMULADOR' | 'MISTA' | 'SEM_DADO';
  activity_minutes: number;
  training_minutes: number;
  simulator_minutes: number;
  start_time: string | null;
  end_time: string | null;
  labels: string[];
}

function normalizeClock(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : null;
}

function toMinutes(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addIsoDay(value: string): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function expandPlannedTrainingRows(
  rows: ActivityDbRow[],
  windowStart: string,
  windowEnd: string,
): ActivityDbRow[] {
  const expanded: ActivityDbRow[] = [];
  for (const row of rows) {
    const first = isIsoDate(row.range_start) ? row.range_start : row.data_operacional;
    const last = isIsoDate(row.range_end) ? row.range_end : row.data_operacional;
    if (!isIsoDate(first) || !isIsoDate(last)) continue;
    let current = first < windowStart ? windowStart : first;
    const end = last > windowEnd ? windowEnd : last;
    while (current <= end) {
      expanded.push({
        ...row,
        data_operacional: current,
        dedupe_key: row.dedupe_key ? `${row.dedupe_key}:${current}` : null,
      });
      current = addIsoDay(current);
    }
  }
  return expanded;
}

export function frmsActivityDurationMinutes(
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): number {
  const start = toMinutes(normalizeClock(startValue));
  const end = toMinutes(normalizeClock(endValue));
  if (start == null || end == null) return 0;
  let duration = end - start;
  if (duration < 0) duration += 24 * 60;
  return Math.max(0, Math.min(duration, 24 * 60));
}

export function summarizeFrmsActivities(
  rows: FrmsActivitySnapshotRow[],
  hasFlightDuty = false,
): FrmsActivitySummary {
  let trainingMinutes = 0;
  let simulatorMinutes = 0;
  const labels = new Set<string>();
  const starts: string[] = [];
  const ends: string[] = [];

  for (const row of rows) {
    const duration = frmsActivityDurationMinutes(row.hora_inicio, row.hora_fim);
    if (row.activity_type === 'SIMULADOR') simulatorMinutes += duration;
    else trainingMinutes += duration;
    if (row.titulo?.trim()) labels.add(row.titulo.trim());
    const start = normalizeClock(row.hora_inicio);
    const end = normalizeClock(row.hora_fim);
    if (start) starts.push(start);
    if (end) ends.push(end);
  }

  const hasTraining = trainingMinutes > 0 || rows.some((row) => row.activity_type === 'TREINAMENTO');
  const hasSimulator = simulatorMinutes > 0 || rows.some((row) => row.activity_type === 'SIMULADOR');
  const dimensions = Number(hasFlightDuty) + Number(hasTraining) + Number(hasSimulator);
  const activityType: FrmsActivitySummary['activity_type'] =
    dimensions === 0
      ? 'SEM_DADO'
      : dimensions > 1
        ? 'MISTA'
        : hasFlightDuty
          ? 'VOO'
          : hasSimulator
            ? 'SIMULADOR'
            : 'TREINAMENTO';

  return {
    activity_type: activityType,
    activity_minutes: trainingMinutes + simulatorMinutes,
    training_minutes: trainingMinutes,
    simulator_minutes: simulatorMinutes,
    start_time: starts.sort()[0] ?? null,
    end_time: ends.sort().slice(-1)[0] ?? null,
    labels: [...labels].slice(0, 5),
  };
}

type ActivityDbRow = FrmsActivitySnapshotRow & {
  dedupe_key: string | null;
  range_start?: string | null;
  range_end?: string | null;
};

const PEOPLE_SQL = `
  SELECT treinamento_id, funcionario_id FROM treinamentos_participantes
  UNION
  SELECT treinamento_id, funcionario_id FROM treinamentos_instrutores
  UNION
  SELECT id AS treinamento_id, instrutor_id AS funcionario_id
    FROM treinamentos_planejados
   WHERE deleted_at IS NULL AND instrutor_id IS NOT NULL
`;

export async function loadFrmsActivityRows(
  db: D1Database,
  empresaId: number,
  startDate: string,
  endDate: string,
): Promise<FrmsActivitySnapshotRow[]> {
  const trainingDays = await db.prepare(
    `SELECT td.data AS data_operacional,
            CAST(p.funcionario_id AS INTEGER) AS funcionario_id,
            CASE WHEN td.sessao_id IS NOT NULL OR td.simulador_id IS NOT NULL
                 THEN 'SIMULADOR' ELSE 'TREINAMENTO' END AS activity_type,
            td.hora_inicio, td.hora_fim,
            COALESCE(NULLIF(t.titulo, ''), NULLIF(t.codigo_turma, ''), 'Treinamento') AS titulo,
            td.id AS source_id,
            CASE WHEN td.sessao_id IS NOT NULL
                 THEN 'SIM:' || td.sessao_id || ':' || p.funcionario_id
                 ELSE 'TRN:' || td.id || ':' || p.funcionario_id END AS dedupe_key
       FROM treinamentos_dias td
       JOIN treinamentos_planejados t
         ON t.id = td.treinamento_id AND t.empresa_id = td.empresa_id AND t.deleted_at IS NULL
       JOIN (${PEOPLE_SQL}) p ON p.treinamento_id = td.treinamento_id
       JOIN funcionarios f ON f.id = p.funcionario_id AND f.empresa_id = td.empresa_id AND f.deleted_at IS NULL
      WHERE td.empresa_id = ?
        AND td.deleted_at IS NULL
        AND date(td.data) BETWEEN date(?) AND date(?)
        AND UPPER(COALESCE(td.status, 'ATIVO')) <> 'CANCELADO'
        AND UPPER(COALESCE(t.status, 'PLANEJADO')) <> 'CANCELADO'`,
  ).bind(empresaId, startDate, endDate).all<ActivityDbRow>();

  const plannedTraining = await db.prepare(
    `SELECT COALESCE(t.data_prevista, t.data_inicio, t.data_fim) AS data_operacional,
            CAST(p.funcionario_id AS INTEGER) AS funcionario_id,
            CASE WHEN t.sessao_id IS NOT NULL OR t.simulador_id IS NOT NULL
                 THEN 'SIMULADOR' ELSE 'TREINAMENTO' END AS activity_type,
            t.hora_inicio, t.hora_fim,
            COALESCE(NULLIF(t.titulo, ''), NULLIF(t.codigo_turma, ''), 'Treinamento') AS titulo,
            t.id AS source_id,
            COALESCE(t.data_inicio, t.data_prevista, t.data_fim) AS range_start,
            COALESCE(t.data_fim, t.data_prevista, t.data_inicio) AS range_end,
            CASE WHEN t.sessao_id IS NOT NULL
                 THEN 'SIM:' || t.sessao_id || ':' || p.funcionario_id
                 ELSE 'TRNPLAN:' || t.id || ':' || p.funcionario_id END AS dedupe_key
       FROM treinamentos_planejados t
       JOIN (${PEOPLE_SQL}) p ON p.treinamento_id = t.id
       JOIN funcionarios f ON f.id = p.funcionario_id AND f.empresa_id = t.empresa_id AND f.deleted_at IS NULL
      WHERE t.empresa_id = ?
        AND t.deleted_at IS NULL
        AND UPPER(COALESCE(t.status, 'PLANEJADO')) <> 'CANCELADO'
        AND date(COALESCE(t.data_fim, t.data_prevista, t.data_inicio)) >= date(?)
        AND date(COALESCE(t.data_inicio, t.data_prevista, t.data_fim)) <= date(?)
        AND NOT EXISTS (
          SELECT 1 FROM treinamentos_dias td
          WHERE td.empresa_id = t.empresa_id
            AND td.treinamento_id = t.id
            AND td.deleted_at IS NULL
        )`,
  ).bind(empresaId, startDate, endDate).all<ActivityDbRow>();

  const simulatorSessions = await db.prepare(
    `WITH simulator_people AS (
       SELECT id AS sessao_id, funcionario_id FROM simulador_agendamentos WHERE funcionario_id IS NOT NULL
       UNION
       SELECT id AS sessao_id, instrutor_id AS funcionario_id FROM simulador_agendamentos WHERE instrutor_id IS NOT NULL
       UNION
       SELECT id AS sessao_id, checador_id AS funcionario_id FROM simulador_agendamentos WHERE checador_id IS NOT NULL
       UNION
       SELECT id AS sessao_id, examinador_id AS funcionario_id FROM simulador_agendamentos WHERE examinador_id IS NOT NULL
       UNION
       SELECT sp.sessao_id, sp.funcionario_id
         FROM sessoes_participantes sp
        WHERE sp.deleted_at IS NULL
     )
     SELECT sa.data AS data_operacional,
            CAST(sp.funcionario_id AS INTEGER) AS funcionario_id,
            'SIMULADOR' AS activity_type,
            sa.hora_inicio, sa.hora_fim,
            COALESCE(NULLIF(sa.nome, ''), NULLIF(sa.tipo_sessao, ''), 'Sessão de simulador') AS titulo,
            sa.id AS source_id,
            'SIM:' || sa.id || ':' || sp.funcionario_id AS dedupe_key
       FROM simulador_agendamentos sa
       JOIN simulator_people sp ON sp.sessao_id = sa.id
       JOIN funcionarios f ON f.id = sp.funcionario_id AND f.empresa_id = sa.empresa_id AND f.deleted_at IS NULL
      WHERE sa.empresa_id = ?
        AND sa.deleted_at IS NULL
        AND date(sa.data) BETWEEN date(?) AND date(?)
        AND UPPER(COALESCE(sa.status, 'AGENDADO')) <> 'CANCELADO'`,
  ).bind(empresaId, startDate, endDate).all<ActivityDbRow>();

  const merged = [
    ...(trainingDays.results ?? []),
    ...expandPlannedTrainingRows(plannedTraining.results ?? [], startDate, endDate),
    ...(simulatorSessions.results ?? []),
  ];
  const deduped = new Map<string, FrmsActivitySnapshotRow>();

  for (const row of merged) {
    const key = row.dedupe_key || [
      row.activity_type,
      String(row.source_id ?? 'NA'),
      String(row.funcionario_id),
      String(row.data_operacional),
    ].join(':');
    if (deduped.has(key)) continue;
    deduped.set(key, {
      data_operacional: String(row.data_operacional),
      funcionario_id: Number(row.funcionario_id),
      activity_type: row.activity_type,
      hora_inicio: normalizeClock(row.hora_inicio),
      hora_fim: normalizeClock(row.hora_fim),
      titulo: row.titulo == null ? null : String(row.titulo),
      source_id: row.source_id,
    });
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.data_operacional !== b.data_operacional) {
      return a.data_operacional.localeCompare(b.data_operacional);
    }
    if (a.funcionario_id !== b.funcionario_id) return a.funcionario_id - b.funcionario_id;
    return String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''));
  });
}
