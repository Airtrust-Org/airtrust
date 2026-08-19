import type { D1Database } from '@cloudflare/workers-types';
import {
  getQualificacoesAlertaDias,
  getQualificacoesVencimentoExpr,
} from '../utils/qualificacoes-alerta-config';

export type IntegratedMonthlyEventSource =
  | 'ESCALA'
  | 'TREINAMENTO'
  | 'SIMULADOR'
  | 'QUALIFICACAO'
  | 'FRMS'
  | 'INDISPONIBILIDADE'
  | 'OUTRO';

export type IntegratedMonthlyEventSeverity = 'INFO' | 'WARNING' | 'CONFLICT' | 'BLOCKING';

export type IntegratedMonthlyEvent = {
  id: string;
  source: IntegratedMonthlyEventSource;
  sourceId: string | number | null;
  sourceRoute?: string | null;
  employeeId: number | string;
  employeeName: string;
  date: string;
  startAt?: string | null;
  endAt?: string | null;
  allDay: boolean;
  type: string;
  title: string;
  description?: string | null;
  severity: IntegratedMonthlyEventSeverity;
  status: string;
  blocksAllocation: boolean;
  requiresAction: boolean;
  metadata?: Record<string, unknown>;
};

export type IntegratedEmployeeMonth = {
  employeeId: number | string;
  employeeName: string;
  role?: string | null;
  base?: string | null;
  summary: {
    scheduledDays: number;
    trainingEvents: number;
    simulatorEvents: number;
    qualificationWarnings: number;
    frmsWarnings: number;
    conflicts: number;
    blockingIssues: number;
  };
  days: Record<
    string,
    {
      operationalAssignments: IntegratedMonthlyEvent[];
      commitments: IntegratedMonthlyEvent[];
      alerts: IntegratedMonthlyEvent[];
      conflicts: IntegratedMonthlyEvent[];
    }
  >;
};

export type IntegratedMonthlyResponse = {
  month: string;
  timezone: string;
  generatedAt: string;
  summary: {
    employees: number;
    events: number;
    warnings: number;
    conflicts: number;
    blockingIssues: number;
  };
  employees: IntegratedEmployeeMonth[];
  diagnostics?: {
    partialSources?: string[];
    warnings?: string[];
  };
};

type EmployeeRef = {
  employeeId: string;
  employeeName: string;
  role: string | null;
  base: string | null;
};

export type IntegratedMonthlyFilters = {
  month: string;
  employeeId?: string | null;
  baseId?: string | null;
  funcaoId?: string | null;
  includeFrms?: boolean;
  severity?: IntegratedMonthlyEventSeverity | null;
};

export type BuildIntegratedMonthlyParams = IntegratedMonthlyFilters & {
  db: D1Database;
  empresaId: number;
  timezone?: string;
};

type MonthRange = {
  month: string;
  year: number;
  monthNumber: number;
  startDate: string;
  endDate: string;
  days: string[];
};

type SourceLoadResult = {
  events: IntegratedMonthlyEvent[];
  partialSources: string[];
  warnings: string[];
};

const TIMEZONE = 'America/Sao_Paulo';
const ACTIVE_EMPLOYEE_STATUS = "UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'";
const CANCELLED_STATUSES = new Set(['CANCELADO', 'CANCELADA', 'CANCELLED', 'REMOVIDO', 'REMOVIDA']);

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCancelledStatus(status: unknown): boolean {
  return CANCELLED_STATUSES.has(String(status || '').trim().toUpperCase());
}

function dateToIsoLocal(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;
}

export function parseIntegratedMonth(month: string): MonthRange {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('mes deve estar no formato YYYY-MM');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error('mes inválido');
  }

  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  const days: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    days.push(dateToIsoLocal(cursor));
  }

  return {
    month,
    year,
    monthNumber,
    startDate: days[0],
    endDate: days[days.length - 1],
    days,
  };
}

function parseDateTimeMs(date: string, time?: string | null, endOfDay = false): number {
  const normalizedTime = normalizeText(time);
  const timePart = normalizedTime && /^\d{2}:\d{2}/.test(normalizedTime)
    ? normalizedTime.slice(0, 5)
    : endOfDay
      ? '23:59'
      : '00:00';
  return Date.parse(`${date}T${timePart}:00-03:00`);
}

function eventRangeMs(event: Pick<IntegratedMonthlyEvent, 'date' | 'startAt' | 'endAt' | 'allDay'>): {
  start: number;
  end: number;
} {
  const startDate = event.startAt?.slice(0, 10) || event.date;
  const endDate = event.endAt?.slice(0, 10) || event.date;
  if (event.allDay) {
    return { start: parseDateTimeMs(startDate), end: parseDateTimeMs(endDate, null, true) };
  }
  const startTime = event.startAt?.includes('T') ? event.startAt.slice(11, 16) : event.startAt;
  const endTime = event.endAt?.includes('T') ? event.endAt.slice(11, 16) : event.endAt;
  const start = parseDateTimeMs(startDate, startTime);
  let end = parseDateTimeMs(endDate, endTime || startTime, Boolean(!endTime));
  if (end <= start && endDate === startDate) {
    end += 24 * 60 * 60 * 1000;
  }
  return { start, end };
}

export function eventsOverlap(
  a: Pick<IntegratedMonthlyEvent, 'date' | 'startAt' | 'endAt' | 'allDay' | 'status'>,
  b: Pick<IntegratedMonthlyEvent, 'date' | 'startAt' | 'endAt' | 'allDay' | 'status'>,
): boolean {
  if (isCancelledStatus(a.status) || isCancelledStatus(b.status)) return false;
  const ar = eventRangeMs(a);
  const br = eventRangeMs(b);
  return ar.start < br.end && br.start < ar.end;
}

function daysBetween(startDate: string, endDate: string, month: MonthRange): string[] {
  return month.days.filter((day) => day >= startDate && day <= endDate);
}

function sourceRank(source: IntegratedMonthlyEventSource): number {
  return {
    ESCALA: 1,
    TREINAMENTO: 2,
    SIMULADOR: 3,
    QUALIFICACAO: 4,
    INDISPONIBILIDADE: 5,
    FRMS: 6,
    OUTRO: 7,
  }[source];
}

function sourceBucket(event: IntegratedMonthlyEvent) {
  if (event.source === 'ESCALA') return 'operationalAssignments';
  if (event.severity === 'CONFLICT') return 'conflicts';
  if (event.source === 'QUALIFICACAO' || event.source === 'FRMS' || event.source === 'INDISPONIBILIDADE') {
    return 'alerts';
  }
  return 'commitments';
}

export function summarizeEvents(events: IntegratedMonthlyEvent[]) {
  return {
    events: events.length,
    warnings: events.filter((event) => event.severity === 'WARNING').length,
    conflicts: events.filter((event) => event.severity === 'CONFLICT').length,
    blockingIssues: events.filter((event) => event.severity === 'BLOCKING' || event.blocksAllocation).length,
  };
}

export function dedupeIntegratedEvents(events: IntegratedMonthlyEvent[]): IntegratedMonthlyEvent[] {
  const seen = new Map<string, IntegratedMonthlyEvent>();
  for (const event of events) {
    // B1/M6: quando o evento carrega uma chave canônica (turma↔sessão de simulador),
    // ela é a identidade do compromisso — colapsa duplicatas turma/simulador inclusive
    // para instrutores. Caso contrário, usa a chave composta tradicional.
    const canonicalKey =
      typeof event.metadata?.canonicalDedupKey === 'string' && event.metadata.canonicalDedupKey
        ? `CANON|${event.employeeId}|${event.metadata.canonicalDedupKey}`
        : null;
    const key =
      canonicalKey ||
      [
        event.source,
        event.sourceId ?? event.id,
        event.employeeId,
        event.date,
        event.startAt || '',
        event.endAt || '',
        event.type,
      ].join('|');
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, event);
      continue;
    }
    if (existing.severity !== 'BLOCKING' && event.severity === 'BLOCKING') {
      seen.set(key, event);
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (String(a.employeeName).localeCompare(String(b.employeeName), 'pt-BR') !== 0) {
      return String(a.employeeName).localeCompare(String(b.employeeName), 'pt-BR');
    }
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if ((a.startAt || '') !== (b.startAt || '')) return (a.startAt || '').localeCompare(b.startAt || '');
    return sourceRank(a.source) - sourceRank(b.source);
  });
}

export function buildConflictEvents(events: IntegratedMonthlyEvent[]): IntegratedMonthlyEvent[] {
  const conflicts: IntegratedMonthlyEvent[] = [];
  const byEmployee = new Map<string, IntegratedMonthlyEvent[]>();
  for (const event of events) {
    if (event.severity === 'CONFLICT' || event.source === 'QUALIFICACAO' || event.source === 'FRMS') continue;
    const key = String(event.employeeId);
    byEmployee.set(key, [...(byEmployee.get(key) || []), event]);
  }

  for (const employeeEvents of byEmployee.values()) {
    for (let i = 0; i < employeeEvents.length; i += 1) {
      for (let j = i + 1; j < employeeEvents.length; j += 1) {
        const a = employeeEvents[i];
        const b = employeeEvents[j];
        if (a.source === b.source && a.sourceId === b.sourceId) continue;
        // M7: duas linhas técnicas de ESCALA no mesmo dia (ex.: situação administrativa
        // + alocação operacional) são representações do mesmo compromisso, não conflito
        // real. A incompatibilidade interna de escala é tratada pelo módulo de escalas
        // (escalas-conflitos); aqui detectamos apenas conflitos CRUZADOS entre módulos.
        if (a.source === 'ESCALA' && b.source === 'ESCALA') continue;
        // M6/B1: dois eventos que compartilham a mesma chave canônica (ex.: um dia de
        // turma vinculado a uma sessão de simulador e o próprio evento da sessão, para
        // o mesmo tripulante/instrutor) são o MESMO compromisso — não devem conflitar
        // nem ser contados duas vezes.
        const aCanonical = typeof a.metadata?.canonicalDedupKey === 'string' ? a.metadata.canonicalDedupKey : null;
        const bCanonical = typeof b.metadata?.canonicalDedupKey === 'string' ? b.metadata.canonicalDedupKey : null;
        if (aCanonical && bCanonical && aCanonical === bCanonical) continue;
        if (!eventsOverlap(a, b)) continue;
        const hasOperational = a.source === 'ESCALA' || b.source === 'ESCALA';
        const hasBlockingSource =
          a.source === 'INDISPONIBILIDADE' ||
          b.source === 'INDISPONIBILIDADE' ||
          a.blocksAllocation ||
          b.blocksAllocation;
        conflicts.push({
          id: `CONFLITO:${a.id}:${b.id}`,
          source: 'OUTRO',
          sourceId: null,
          employeeId: a.employeeId,
          employeeName: a.employeeName,
          date: a.date <= b.date ? a.date : b.date,
          startAt: a.startAt || b.startAt || null,
          endAt: a.endAt || b.endAt || null,
          allDay: a.allDay || b.allDay,
          type: 'CONFLITO_SOBREPOSICAO',
          title: hasOperational ? 'Conflito com escala operacional' : 'Conflito entre compromissos',
          description: `${a.title} sobrepõe ${b.title}`,
          severity: hasBlockingSource ? 'BLOCKING' : 'CONFLICT',
          status: 'DETECTADO',
          blocksAllocation: hasBlockingSource,
          requiresAction: true,
          metadata: {
            rule: 'OVERLAP_SAME_EMPLOYEE',
            eventIds: [a.id, b.id],
            sources: [a.source, b.source],
          },
        });
      }
    }
  }
  return conflicts;
}

async function runSource(name: IntegratedMonthlyEventSource, fn: () => Promise<IntegratedMonthlyEvent[]>): Promise<SourceLoadResult> {
  try {
    return { events: await fn(), partialSources: [], warnings: [] };
  } catch (error) {
    return {
      events: [],
      partialSources: [name],
      warnings: [`${name}: ${(error as Error).message || 'fonte indisponível'}`],
    };
  }
}

function bindEmployeeFilters(base: unknown[], filters: IntegratedMonthlyFilters): unknown[] {
  const bindings = [...base];
  if (filters.employeeId) bindings.push(filters.employeeId);
  if (filters.baseId) bindings.push(filters.baseId);
  if (filters.funcaoId) bindings.push(filters.funcaoId);
  return bindings;
}

function employeeFilterSql(alias = 'f', filters: IntegratedMonthlyFilters): string {
  const parts: string[] = [];
  if (filters.employeeId) parts.push(`AND CAST(${alias}.id AS TEXT) = ?`);
  if (filters.baseId) parts.push(`AND COALESCE(${alias}.base, '') = ?`);
  // M1: a função é exposta no contrato e deve filtrar de fato (não pode ser no-op).
  // Compara contra função/cargo do funcionário; aceita id/código textual.
  if (filters.funcaoId) parts.push(`AND COALESCE(${alias}.funcao, ${alias}.cargo, '') = ?`);
  return parts.join('\n');
}

async function loadEmployeeRefs(db: D1Database, empresaId: number, filters: IntegratedMonthlyFilters): Promise<EmployeeRef[]> {
  const rows = await db
    .prepare(
      `
      SELECT
        CAST(f.id AS TEXT) AS employeeId,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS employeeName,
        COALESCE(f.funcao, f.cargo) AS role,
        f.base AS base
      FROM funcionarios f
      WHERE f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND ${ACTIVE_EMPLOYEE_STATUS}
        ${employeeFilterSql('f', filters)}
      ORDER BY employeeName
      `,
    )
    .bind(...bindEmployeeFilters([empresaId], filters))
    .all<EmployeeRef>();

  return rows.results || [];
}

async function loadEscalaEvents(db: D1Database, empresaId: number, month: MonthRange, filters: IntegratedMonthlyFilters) {
  const rows = await db
    .prepare(
      `
      SELECT
        ea.id,
        CAST(ea.funcionario_id AS TEXT) AS funcionario_id,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS funcionario_nome,
        COALESCE(ea.funcao, f.funcao, f.cargo) AS funcao,
        ea.data_inicio,
        ea.data_fim,
        ea.status,
        ea.situacao_tipo,
        ea.base,
        ea.observacoes,
        a.prefixo AS aeronave_prefixo,
        a.modelo AS aeronave_modelo,
        est.bloqueia_alocacao
      FROM escala_alocacoes ea
      INNER JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL AND em.empresa_id = ?
      INNER JOIN funcionarios f ON f.id = ea.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = em.empresa_id
      LEFT JOIN aeronaves a ON a.id = ea.aeronave_id AND a.deleted_at IS NULL
      LEFT JOIN escala_situacao_tipos est
        ON est.codigo = ea.situacao_tipo
       AND est.deleted_at IS NULL
      WHERE ea.deleted_at IS NULL
        AND ea.data_inicio <= ?
        AND ea.data_fim >= ?
        ${employeeFilterSql('f', filters)}
      ORDER BY f.nome, ea.data_inicio
      `,
    )
    .bind(...bindEmployeeFilters([empresaId, month.endDate, month.startDate], filters))
    .all<Record<string, unknown>>();

  const events: IntegratedMonthlyEvent[] = [];
  for (const row of rows.results || []) {
    const start = String(row.data_inicio);
    const end = String(row.data_fim);
    for (const day of daysBetween(start, end, month)) {
      const situation = normalizeText(row.situacao_tipo);
      const blocks = Number(row.bloqueia_alocacao || 0) === 1;
      events.push({
        id: `ESCALA:${row.id}:${day}`,
        source: 'ESCALA',
        sourceId: String(row.id),
        sourceRoute: `/escalas?alocacao_id=${row.id}`,
        employeeId: String(row.funcionario_id),
        employeeName: String(row.funcionario_nome || 'Tripulante'),
        date: day,
        allDay: true,
        type: situation ? 'SITUACAO_ESCALA' : 'ALOCACAO_OPERACIONAL',
        title: situation
          ? `Situação: ${situation}`
          : `Escala ${normalizeText(row.funcao) || 'operacional'}`,
        description:
          normalizeText(row.observacoes) ||
          [row.aeronave_prefixo, row.aeronave_modelo].filter(Boolean).join(' - ') ||
          null,
        severity: blocks ? 'BLOCKING' : situation ? 'WARNING' : 'INFO',
        status: String(row.status || situation || 'ATIVA'),
        blocksAllocation: blocks,
        requiresAction: blocks,
        metadata: {
          rangeStart: start,
          rangeEnd: end,
          role: row.funcao,
          base: row.base,
          aircraft: row.aeronave_prefixo,
          rule: blocks ? 'ESCALA_SITUACAO_TIPO_BLOQUEIA_ALOCACAO' : 'ESCALA_ALOCACAO_READ_MODEL',
        },
      });
    }
  }
  return events;
}

async function loadTreinamentoEvents(db: D1Database, empresaId: number, month: MonthRange, filters: IntegratedMonthlyFilters) {
  const rows = await db
    .prepare(
      `
      WITH training_days AS (
        SELECT
          td.id,
          td.empresa_id,
          td.treinamento_id,
          td.data,
          td.hora_inicio,
          td.hora_fim,
          td.local,
          td.instrutor_id,
          td.simulador_id,
          td.aeronave_id,
          td.sessao_id,
          td.status
        FROM treinamentos_dias td
        WHERE td.deleted_at IS NULL
        UNION ALL
        SELECT
          t.id * -1 AS id,
          t.empresa_id,
          t.id AS treinamento_id,
          COALESCE(t.data_prevista, t.data_inicio, t.data_fim) AS data,
          COALESCE(t.hora_inicio, '08:00') AS hora_inicio,
          COALESCE(t.hora_fim, '17:00') AS hora_fim,
          t.local,
          t.instrutor_id,
          t.simulador_id,
          t.aeronave_id,
          t.sessao_id,
          CASE
            WHEN UPPER(COALESCE(t.status, 'PLANEJADO')) = 'CANCELADO' THEN 'CANCELADO'
            ELSE 'ATIVO'
          END AS status
        FROM treinamentos_planejados t
        WHERE t.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1
              FROM treinamentos_dias existing_day
             WHERE existing_day.treinamento_id = t.id
               AND existing_day.empresa_id = t.empresa_id
               AND existing_day.deleted_at IS NULL
          )
      ),
      training_people AS (
        SELECT treinamento_id, funcionario_id, 0 AS is_instrutor
          FROM treinamentos_participantes
        UNION ALL
        SELECT treinamento_id, funcionario_id, 1 AS is_instrutor
          FROM treinamentos_instrutores
        UNION ALL
        SELECT t.id AS treinamento_id, t.instrutor_id AS funcionario_id, 1 AS is_instrutor
          FROM treinamentos_planejados t
         WHERE t.instrutor_id IS NOT NULL
           AND t.deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1
               FROM treinamentos_instrutores ti
              WHERE ti.treinamento_id = t.id
                AND ti.empresa_id = t.empresa_id
           )
      ),
      people AS (
        SELECT treinamento_id, funcionario_id, MAX(is_instrutor) AS is_instrutor
          FROM training_people
         GROUP BY treinamento_id, funcionario_id
      )
      SELECT
        t.id,
        t.titulo,
        t.codigo_turma,
        t.modalidade,
        td.id AS dia_id,
        td.data AS data_prevista,
        td.hora_inicio,
        td.hora_fim,
        td.sessao_id,
        t.status,
        COALESCE(td.local, t.local) AS local,
        EXISTS (
          SELECT 1
            FROM training_days other_day
            INNER JOIN treinamentos_planejados other_training
              ON other_training.id = other_day.treinamento_id
             AND other_training.empresa_id = t.empresa_id
             AND other_training.deleted_at IS NULL
             AND UPPER(COALESCE(other_training.status, 'PLANEJADO')) <> 'CANCELADO'
           WHERE other_day.empresa_id = td.empresa_id
             AND other_day.id <> td.id
             AND other_day.status = 'ATIVO'
             AND date(other_day.data) = date(td.data)
             AND COALESCE(other_day.hora_inicio, '00:00') < COALESCE(td.hora_fim, '23:59')
             AND COALESCE(td.hora_inicio, '00:00') < COALESCE(other_day.hora_fim, '23:59')
             AND (
               (td.simulador_id IS NOT NULL AND other_day.simulador_id = td.simulador_id)
               OR (td.aeronave_id IS NOT NULL AND other_day.aeronave_id = td.aeronave_id)
               OR (
                 NULLIF(UPPER(TRIM(COALESCE(td.local, t.local, t.sala, ''))), '') IS NOT NULL
                 AND UPPER(TRIM(COALESCE(other_day.local, other_training.local, other_training.sala, ''))) =
                     UPPER(TRIM(COALESCE(td.local, t.local, t.sala, '')))
               )
             )
        ) AS resource_conflict,
        qt.codigo AS qualificacao_codigo,
        qt.nome AS qualificacao_nome,
        CAST(tp.funcionario_id AS TEXT) AS funcionario_id,
        tp.is_instrutor,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS funcionario_nome
      FROM treinamentos_planejados t
      INNER JOIN training_days td
        ON td.treinamento_id = t.id
       AND td.empresa_id = t.empresa_id
       AND td.status = 'ATIVO'
      INNER JOIN people tp ON tp.treinamento_id = t.id
      INNER JOIN funcionarios f ON f.id = tp.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = t.empresa_id
      LEFT JOIN qualificacoes_tipos qt ON qt.id = t.qualificacao_tipo_id AND qt.deleted_at IS NULL
      WHERE t.deleted_at IS NULL
        AND t.empresa_id = ?
        AND UPPER(COALESCE(t.status, 'PLANEJADO')) <> 'CANCELADO'
        AND date(td.data) BETWEEN date(?) AND date(?)
        ${employeeFilterSql('f', filters)}
      ORDER BY td.data, td.hora_inicio
      `,
    )
    .bind(...bindEmployeeFilters([empresaId, month.startDate, month.endDate], filters))
    .all<Record<string, unknown>>();

  return (rows.results || []).map((row): IntegratedMonthlyEvent => ({
    id: `TREINAMENTO:${row.id}:${row.dia_id}:${row.funcionario_id}`,
    source: 'TREINAMENTO' as const,
    sourceId: Number(row.id),
    sourceRoute: `/treinamentos/planejados?id=${row.id}`,
    employeeId: String(row.funcionario_id),
    employeeName: String(row.funcionario_nome || 'Tripulante'),
    date: String(row.data_prevista),
    startAt: row.hora_inicio ? `${row.data_prevista}T${String(row.hora_inicio).slice(0, 5)}:00-03:00` : null,
    endAt: row.hora_fim ? `${row.data_prevista}T${String(row.hora_fim).slice(0, 5)}:00-03:00` : null,
    allDay: !row.hora_inicio && !row.hora_fim,
    type:
      String(row.status || 'PLANEJADO').toUpperCase() === 'CONCLUIDO'
        ? 'TREINAMENTO_CONCLUIDO'
        : 'TREINAMENTO_PLANEJADO',
    title: String(row.titulo || row.qualificacao_nome || 'Treinamento planejado'),
    description: normalizeText(row.local) || normalizeText(row.qualificacao_codigo),
    severity: Number(row.resource_conflict || 0) === 1 ? 'CONFLICT' : 'INFO',
    status: String(row.status || 'PLANEJADO'),
    blocksAllocation: false,
    requiresAction: Number(row.resource_conflict || 0) === 1,
    metadata: {
      qualificationCode: row.qualificacao_codigo,
      qualificationName: row.qualificacao_nome,
      trainingCode: row.codigo_turma,
      modality: row.modalidade,
      participationRole: Number(row.is_instrutor || 0) === 1 ? 'INSTRUTOR' : 'PARTICIPANTE',
      resourceConflict: Number(row.resource_conflict || 0) === 1,
      trainingDayId: row.dia_id,
      simulatorSessionId: row.sessao_id,
      canonicalDedupKey: row.sessao_id
        ? `simulador_agendamento:${row.sessao_id}:funcionario:${row.funcionario_id}`
        : `treinamento:${row.id}:dia:${row.dia_id}:funcionario:${row.funcionario_id}`,
      rule: 'TREINAMENTOS_DIAS_READ_MODEL',
    },
  }));
}

async function loadSimuladorEvents(db: D1Database, empresaId: number, month: MonthRange, filters: IntegratedMonthlyFilters) {
  const rows = await db
    .prepare(
      `
      SELECT
        sa.id,
        sa.data,
        sa.hora_inicio,
        sa.hora_fim,
        sa.status,
        sa.tipo_sessao,
        sa.nome,
        s.nome AS simulador_nome,
        s.modelo AS simulador_modelo,
        CAST(sp.funcionario_id AS TEXT) AS funcionario_id,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS funcionario_nome
      FROM simulador_agendamentos sa
      INNER JOIN sessoes_participantes sp ON sp.sessao_id = sa.id AND sp.deleted_at IS NULL
      INNER JOIN funcionarios f ON f.id = sp.funcionario_id AND f.deleted_at IS NULL AND f.empresa_id = sa.empresa_id
      LEFT JOIN simuladores s ON s.id = sa.simulador_id AND s.deleted_at IS NULL
      WHERE sa.deleted_at IS NULL
        AND sa.empresa_id = ?
        AND date(sa.data) BETWEEN date(?) AND date(?)
        AND NOT EXISTS (
          SELECT 1
            FROM (
              SELECT td.empresa_id, td.sessao_id, td.treinamento_id
                FROM treinamentos_dias td
               WHERE td.deleted_at IS NULL
                 AND td.status = 'ATIVO'
              UNION ALL
              SELECT t.empresa_id, t.sessao_id, t.id AS treinamento_id
                FROM treinamentos_planejados t
               WHERE t.deleted_at IS NULL
                 AND t.sessao_id IS NOT NULL
                 AND UPPER(COALESCE(t.status, 'PLANEJADO')) <> 'CANCELADO'
                 AND NOT EXISTS (
                   SELECT 1
                     FROM treinamentos_dias existing_day
                    WHERE existing_day.treinamento_id = t.id
                      AND existing_day.empresa_id = t.empresa_id
                      AND existing_day.deleted_at IS NULL
                 )
            ) td
            INNER JOIN treinamentos_participantes tp
              ON tp.treinamento_id = td.treinamento_id
             AND tp.funcionario_id = sp.funcionario_id
           WHERE td.empresa_id = sa.empresa_id
             AND td.sessao_id = sa.id
        )
        ${employeeFilterSql('f', filters)}
      ORDER BY sa.data, sa.hora_inicio
      `,
    )
    .bind(...bindEmployeeFilters([empresaId, month.startDate, month.endDate], filters))
    .all<Record<string, unknown>>();

  return (rows.results || []).map((row): IntegratedMonthlyEvent => {
    return {
      id: `SIMULADOR:${row.id}:${row.funcionario_id}`,
      source: 'SIMULADOR' as const,
      sourceId: Number(row.id),
      sourceRoute: `/simuladores/sessoes/${row.id}`,
      employeeId: String(row.funcionario_id),
      employeeName: String(row.funcionario_nome || 'Tripulante'),
      date: String(row.data),
      startAt: row.hora_inicio ? `${row.data}T${String(row.hora_inicio).slice(0, 5)}:00-03:00` : null,
      endAt: row.hora_fim ? `${row.data}T${String(row.hora_fim).slice(0, 5)}:00-03:00` : null,
      allDay: !row.hora_inicio && !row.hora_fim,
      type: 'SESSAO_SIMULADOR',
      title: String(row.nome || row.tipo_sessao || 'Sessão de simulador'),
      description: [row.simulador_nome, row.simulador_modelo].filter(Boolean).join(' - ') || null,
      severity: 'INFO',
      status: String(row.status || 'AGENDADO'),
      blocksAllocation: false,
      requiresAction: false,
      metadata: {
        simulatorName: row.simulador_nome,
        simulatorModel: row.simulador_modelo,
        canonicalDedupKey: `simulador_agendamento:${row.id}:funcionario:${row.funcionario_id}`,
        rule: 'SIMULADOR_AGENDAMENTO_CANONICO',
      },
    };
  });
}

async function loadQualificacaoEvents(db: D1Database, empresaId: number, month: MonthRange, filters: IntegratedMonthlyFilters) {
  const alertaDias = await getQualificacoesAlertaDias(db, empresaId);
  const vencimentoExpr = getQualificacoesVencimentoExpr('qh', 'qt');
  const rows = await db
    .prepare(
      `
      SELECT
        qh.id,
        qh.status,
        qh.qualificacao_codigo,
        qt.nome AS qualificacao_nome,
        ${vencimentoExpr} AS data_vencimento,
        CAST(f.id AS TEXT) AS funcionario_id,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS funcionario_nome,
        EXISTS (
          SELECT 1
          FROM treinamentos_planejados tp
          INNER JOIN treinamentos_participantes tpp ON tpp.treinamento_id = tp.id
          WHERE tp.deleted_at IS NULL
            AND tp.empresa_id = f.empresa_id
            AND tpp.funcionario_id = f.id
            AND tp.qualificacao_tipo_id = qt.id
            AND UPPER(COALESCE(tp.status, '')) IN ('PLANEJADO', 'CONFIRMADO', 'EM_ANDAMENTO')
            AND date(tp.data_prevista) >= date(?)
        ) AS renovacao_planejada
      FROM qualificacoes_historico qh
      INNER JOIN funcionarios f ON (f.cpf = qh.funcionario_cpf OR f.id = qh.funcionario_id)
      INNER JOIN qualificacoes_tipos qt ON (qt.codigo = qh.qualificacao_codigo OR qt.id = qh.qualificacao_id)
        AND qt.empresa_id = f.empresa_id
        AND qt.deleted_at IS NULL
      WHERE qh.deleted_at IS NULL
        AND qh.empresa_id = f.empresa_id
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND ${vencimentoExpr} IS NOT NULL
        AND date(${vencimentoExpr}) <= date(?, '+' || ? || ' days')
        AND qh.id IN (
          -- A2: a seleção do registro mais recente DEVE ser isolada por tenant.
          -- Sem o filtro/grouping por empresa_id, um registro mais novo de OUTRO
          -- tenant (mesmo CPF) suprimiria o alerta do tenant correto (falso negativo).
          SELECT MAX(id)
          FROM qualificacoes_historico
          WHERE deleted_at IS NULL
            AND empresa_id = ?
          GROUP BY empresa_id, COALESCE(funcionario_cpf, CAST(funcionario_id AS TEXT)), qualificacao_codigo
        )
        ${employeeFilterSql('f', filters)}
      ORDER BY date(data_vencimento), f.nome
      `,
    )
    .bind(...bindEmployeeFilters([month.startDate, empresaId, month.endDate, alertaDias, empresaId], filters))
    .all<Record<string, unknown>>();

  return (rows.results || []).map((row) => {
    const dataVencimento = String(row.data_vencimento).slice(0, 10);
    const vencida = dataVencimento < month.startDate;
    const vencendoNoMes = dataVencimento >= month.startDate && dataVencimento <= month.endDate;
    const hasRenewal = Number(row.renovacao_planejada || 0) === 1;
    const severity: IntegratedMonthlyEventSeverity = vencida && !hasRenewal ? 'BLOCKING' : 'WARNING';
    return {
      id: `QUALIFICACAO:${row.id}`,
      source: 'QUALIFICACAO' as const,
      sourceId: Number(row.id),
      sourceRoute: `/qualificacoes?id=${row.id}`,
      employeeId: String(row.funcionario_id),
      employeeName: String(row.funcionario_nome || 'Tripulante'),
      // Usa a data real de vencimento. Qualificações vencidas antes do mês
      // NÃO são clampadas para o primeiro dia do mês — isso poluía o
      // calendário com eventos all-day artificiais. O evento só aparece no
      // grid se a data real estiver dentro do mês corrente; no sumário do
      // tripulante ele ainda é contabilizado como alerta/bloqueio.
      date: dataVencimento,
      allDay: true,
      type: vencida
        ? hasRenewal
          ? 'QUALIFICACAO_VENCIDA_COM_RENOVACAO_PLANEJADA'
          : 'QUALIFICACAO_VENCIDA'
        : hasRenewal
          ? 'QUALIFICACAO_VENCENDO_COM_RENOVACAO_PLANEJADA'
          : vencendoNoMes
            ? 'QUALIFICACAO_VENCENDO'
            : 'QUALIFICACAO_ALERTA',
      title: String(row.qualificacao_nome || row.qualificacao_codigo || 'Qualificação'),
      description: hasRenewal
        ? 'Há renovação planejada; a qualificação ainda não deve ser tratada como renovada.'
        : vencida
          ? 'Qualificação vencida sem renovação planejada localizada.'
          : 'Qualificação dentro da janela de vencimento.',
      severity,
      status: vencida ? 'VENCIDA' : 'VENCENDO',
      blocksAllocation: vencida && !hasRenewal,
      requiresAction: vencida || !hasRenewal,
      metadata: {
        dueDate: dataVencimento,
        plannedRenewal: hasRenewal,
        alertWindowDays: alertaDias,
        rule: hasRenewal
          ? 'QUALIFICACAO_ALERTA_COM_RENOVACAO_PLANEJADA'
          : vencida
            ? 'QUALIFICACAO_VENCIDA_SEM_RENOVACAO'
            : 'QUALIFICACAO_VENCENDO_NA_JANELA',
      },
    };
  });
}

async function loadFrmsEvents(db: D1Database, empresaId: number, month: MonthRange, filters: IntegratedMonthlyFilters) {
  const rows = await db
    .prepare(
      `
      SELECT
        a.id,
        a.tripulante_id,
        a.jornada_id,
        a.tipo_limite,
        a.nivel,
        a.mensagem,
        a.percentual_atingido,
        a.resolvido,
        j.data AS jornada_data,
        COALESCE(j.data, a.created_at) AS data_ref,
        COALESCE(NULLIF(f.guerra, ''), f.nome) AS funcionario_nome
      FROM frms_alerta a
      LEFT JOIN frms_jornada j ON j.id = a.jornada_id AND j.deleted_at IS NULL
      INNER JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(a.tripulante_id AS TEXT)
      WHERE a.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.empresa_id = ?
        AND COALESCE(a.resolvido, 0) = 0
        AND date(COALESCE(j.data, a.created_at)) BETWEEN date(?) AND date(?)
        ${employeeFilterSql('f', filters)}
      ORDER BY date(data_ref), a.nivel DESC
      `,
    )
    .bind(...bindEmployeeFilters([empresaId, month.startDate, month.endDate], filters))
    .all<Record<string, unknown>>();

  return (rows.results || []).map((row) => {
    const nivel = String(row.nivel || '').toUpperCase();
    const severity: IntegratedMonthlyEventSeverity =
      nivel === 'VIOLACAO' || nivel === 'CRITICO' ? 'BLOCKING' : nivel === 'ATENCAO' ? 'WARNING' : 'INFO';
    // M10: a data operacional confiável é a da jornada. Quando ausente, caímos em
    // created_at apenas para não ocultar o alerta, mas sinalizamos a inconsistência
    // (dateReliable=false) para a UI poder marcar a fonte como parcial/aproximada.
    const dateReliable = Boolean(normalizeText(row.jornada_data));
    return {
      id: `FRMS:${row.id}`,
      source: 'FRMS' as const,
      sourceId: String(row.id),
      sourceRoute: `/frms/alertas?id=${row.id}`,
      employeeId: String(row.tripulante_id),
      employeeName: String(row.funcionario_nome || 'Tripulante'),
      date: String(row.data_ref).slice(0, 10),
      allDay: true,
      type: 'FRMS_ALERTA_OPERACIONAL',
      title: String(row.tipo_limite || 'Alerta FRMS'),
      description: normalizeText(row.mensagem) || null,
      severity,
      status: nivel || 'ABERTO',
      blocksAllocation: severity === 'BLOCKING',
      requiresAction: severity === 'BLOCKING' || severity === 'WARNING',
      metadata: {
        jornadaId: row.jornada_id,
        percent: row.percentual_atingido,
        sensitiveFieldsOmitted: true,
        dateSource: dateReliable ? 'jornada' : 'created_at',
        dateReliable,
        rule: 'FRMS_ALERTA_PERSISTIDO_SEM_IA',
      },
    };
  });
}

export function groupIntegratedEmployeeMonths(
  month: MonthRange,
  employees: EmployeeRef[],
  events: IntegratedMonthlyEvent[],
): IntegratedEmployeeMonth[] {
  const byEmployee = new Map<string, EmployeeRef>();
  for (const employee of employees) byEmployee.set(String(employee.employeeId), employee);
  for (const event of events) {
    const id = String(event.employeeId);
    if (!byEmployee.has(id)) {
      byEmployee.set(id, {
        employeeId: id,
        employeeName: event.employeeName,
        role: null,
        base: null,
      });
    }
  }

  const eventsByEmployee = new Map<string, IntegratedMonthlyEvent[]>();
  for (const event of events) {
    const key = String(event.employeeId);
    eventsByEmployee.set(key, [...(eventsByEmployee.get(key) || []), event]);
  }

  return [...byEmployee.values()]
    .map((employee) => {
      const employeeEvents = eventsByEmployee.get(String(employee.employeeId)) || [];
      const days = Object.fromEntries(
        month.days.map((day) => [
          day,
          {
            operationalAssignments: [] as IntegratedMonthlyEvent[],
            commitments: [] as IntegratedMonthlyEvent[],
            alerts: [] as IntegratedMonthlyEvent[],
            conflicts: [] as IntegratedMonthlyEvent[],
          },
        ]),
      );

      for (const event of employeeEvents) {
        if (!days[event.date]) continue;
        days[event.date][sourceBucket(event)].push(event);
      }

      const scheduledDays = new Set(
        employeeEvents.filter((event) => event.source === 'ESCALA').map((event) => event.date),
      ).size;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        role: employee.role,
        base: employee.base,
        summary: {
          scheduledDays,
          trainingEvents: employeeEvents.filter((event) => event.source === 'TREINAMENTO').length,
          simulatorEvents: employeeEvents.filter((event) => event.source === 'SIMULADOR').length,
          qualificationWarnings: employeeEvents.filter((event) => event.source === 'QUALIFICACAO').length,
          frmsWarnings: employeeEvents.filter((event) => event.source === 'FRMS').length,
          conflicts: employeeEvents.filter((event) => event.severity === 'CONFLICT').length,
          blockingIssues: employeeEvents.filter((event) => event.severity === 'BLOCKING' || event.blocksAllocation).length,
        },
        days,
      };
    })
    .filter((employee) => employee.summary.scheduledDays > 0 || (eventsByEmployee.get(String(employee.employeeId)) || []).length > 0)
    .sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName), 'pt-BR'));
}

export async function buildIntegratedMonthlyView(params: BuildIntegratedMonthlyParams): Promise<IntegratedMonthlyResponse> {
  const month = parseIntegratedMonth(params.month);
  const filters: IntegratedMonthlyFilters = {
    month: params.month,
    employeeId: params.employeeId || null,
    baseId: params.baseId || null,
    funcaoId: params.funcaoId || null,
    includeFrms: params.includeFrms !== false,
    severity: params.severity || null,
  };

  const employees = await loadEmployeeRefs(params.db, params.empresaId, filters);
  const sourceResults = await Promise.all([
    runSource('ESCALA', () => loadEscalaEvents(params.db, params.empresaId, month, filters)),
    runSource('TREINAMENTO', () => loadTreinamentoEvents(params.db, params.empresaId, month, filters)),
    runSource('SIMULADOR', () => loadSimuladorEvents(params.db, params.empresaId, month, filters)),
    runSource('QUALIFICACAO', () => loadQualificacaoEvents(params.db, params.empresaId, month, filters)),
    filters.includeFrms
      ? runSource('FRMS', () => loadFrmsEvents(params.db, params.empresaId, month, filters))
      : Promise.resolve({ events: [], partialSources: [], warnings: ['FRMS não incluído por parâmetro.'] }),
  ]);

  const baseEvents = sourceResults.flatMap((result) => result.events);
  const conflictEvents = buildConflictEvents(baseEvents);
  let events = dedupeIntegratedEvents([...baseEvents, ...conflictEvents]);
  if (filters.severity) {
    // B4: ao filtrar por severidade, preserva também os eventos referenciados por um
    // conflito que sobreviveu ao filtro, para não deixar conflitos órfãos apontando
    // para eventos removidos.
    const kept = events.filter((event) => event.severity === filters.severity);
    const referencedIds = new Set<string>();
    for (const event of kept) {
      const ids = event.metadata?.eventIds;
      if (Array.isArray(ids)) ids.forEach((id) => referencedIds.add(String(id)));
    }
    events = events.filter(
      (event) => event.severity === filters.severity || referencedIds.has(String(event.id)),
    );
  }

  const summary = summarizeEvents(events);
  const employeesGrouped = groupIntegratedEmployeeMonths(month, employees, events);
  const partialSources = [...new Set(sourceResults.flatMap((result) => result.partialSources))];
  const warnings = sourceResults.flatMap((result) => result.warnings);

  return {
    month: params.month,
    timezone: params.timezone || TIMEZONE,
    generatedAt: new Date().toISOString(),
    summary: {
      employees: employeesGrouped.length,
      ...summary,
    },
    employees: employeesGrouped,
    diagnostics:
      partialSources.length > 0 || warnings.length > 0
        ? {
            partialSources,
            warnings,
          }
        : undefined,
  };
}
