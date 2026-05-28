import type { Origem } from './types';

export type FrmsOperationalSnapshotAlertCode =
  | 'CHECKIN_PENDENTE'
  | 'CHECKIN_CRITICO'
  | 'SONO_ESTIMADO'
  | 'SONO_INSUFICIENTE'
  | 'KSS_ALTO'
  | 'EFETIVIDADE_BAIXA'
  | 'JORNADA_SEM_FATORIZACAO'
  | 'ESCALADO_SEM_JORNADA_FRMS'
  | 'JORNADA_FRMS_SEM_ESCALA'
  | 'DADO_INCONSISTENTE';

export type FrmsOperationalSnapshotStatus = 'OK' | 'ATENCAO' | 'CRITICO' | 'INCOMPLETO';

export interface FrmsOperationalSnapshotItem {
  empresa_id: number;
  data_operacional: string;
  funcionario_id: number;
  tripulante_id: number;
  nome: string | null;
  nome_guerra: string | null;
  funcao: string | null;
  base: string | null;
  aeronave: string | null;

  escalado: boolean;
  escala_source: 'SIGVOOS' | 'MANUAL' | 'EVD' | 'AUSENTE';
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  teve_jornada: boolean;

  checkin_status: 'RECEBIDO' | 'PENDENTE' | 'AUSENTE' | 'NAO_APLICAVEL';
  checkin_horario: string | null;
  kss_score: number | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  hora_acordar: string | null;
  fadiga_score: number | null;
  status_operacional_checkin: string | null;

  effectiveness_pct: number | null;
  nivel_fadiga_calculado: string | null;
  fatorizacao_status: 'CALCULADA' | 'AUSENTE';

  sleep_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  wake_data_source: 'REAL' | 'ESTIMADO' | 'AUSENTE';
  jornada_data_source: 'REAL' | 'MANUAL' | 'ESTIMADO' | 'AUSENTE' | 'INCONSISTENTE';
  jornada_origem: Origem | null;
  snapshot_status: FrmsOperationalSnapshotStatus;

  alertas: FrmsOperationalSnapshotAlertCode[];
}

export interface FrmsOperationalSnapshotSummary {
  total_tripulantes: number;
  total_escalados: number;
  checkins_recebidos: number;
  checkins_pendentes: number;
  alertas_criticos: number;
  alertas_atencao: number;
  dados_estimados: number;
  inconsistencias: number;
  sem_fatorizacao: number;
}

export interface FrmsOperationalSnapshotResult {
  items: FrmsOperationalSnapshotItem[];
  summary: FrmsOperationalSnapshotSummary;
}

export interface FrmsOperationalSnapshotFilters {
  funcionario_id?: number;
  base?: string;
  aeronave?: string;
  status?: string[];
  include_inconsistencies?: boolean;
}

export interface BuildOperationalSnapshotInput {
  empresaId: number;
  rows: {
    escalas: ScaleSnapshotRow[];
    jornadas: JornadaSnapshotRow[];
    checkins: CheckinSnapshotRow[];
    effectiveness: EffectivenessSnapshotRow[];
    funcionarios: FuncionarioSnapshotRow[];
  };
  filters?: FrmsOperationalSnapshotFilters;
}

interface ScaleSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
}

interface JornadaSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number;
  duracao_jornada_minutos: number;
  origem: string | null;
  has_operational_data: number;
  is_manual_empty: number;
}

interface CheckinSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  hora_checkin: string | null;
  kss_score: number | null;
  horas_sono: number | null;
  qualidade_sono: number | null;
  wake_time: string | null;
  score_fadiga: number | null;
  nivel_fadiga: string | null;
  status_operacional: string | null;
  computed_risk_level: string | null;
}

interface EffectivenessSnapshotRow {
  data_operacional: string;
  funcionario_id: number;
  effectiveness_pct: number | null;
  effectiveness_nivel: string | null;
}

interface FuncionarioSnapshotRow {
  id: number;
  nome: string | null;
  nome_guerra: string | null;
  funcao: string | null;
  cargo: string | null;
  base: string | null;
  aeronave: string | null;
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hmsDiffInMinutes(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const startMatch = /^(\d{2}):(\d{2})$/.exec(start);
  const endMatch = /^(\d{2}):(\d{2})$/.exec(end);
  if (!startMatch || !endMatch) return 0;

  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (endMinutes >= startMinutes) return endMinutes - startMinutes;
  return 24 * 60 - startMinutes + endMinutes;
}

function computeWakeFromPresentation(
  horaApresentacao: string | null,
  leadMinutes = 90,
): string | null {
  if (!horaApresentacao) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(horaApresentacao);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  const wake = ((total - leadMinutes) % 1440 + 1440) % 1440;
  const hh = String(Math.floor(wake / 60)).padStart(2, '0');
  const mm = String(wake % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function alertPriority(status: FrmsOperationalSnapshotStatus): number {
  if (status === 'CRITICO') return 0;
  if (status === 'INCOMPLETO') return 1;
  if (status === 'ATENCAO') return 2;
  return 3;
}

function dedupeAlerts(alerts: FrmsOperationalSnapshotAlertCode[]): FrmsOperationalSnapshotAlertCode[] {
  return [...new Set(alerts)];
}

function buildSummary(items: FrmsOperationalSnapshotItem[]): FrmsOperationalSnapshotSummary {
  return {
    total_tripulantes: items.length,
    total_escalados: items.filter((item) => item.escalado).length,
    checkins_recebidos: items.filter((item) => item.checkin_status === 'RECEBIDO').length,
    checkins_pendentes: items.filter(
      (item) => item.checkin_status === 'PENDENTE' || item.checkin_status === 'AUSENTE',
    ).length,
    alertas_criticos: items.filter((item) => item.snapshot_status === 'CRITICO').length,
    alertas_atencao: items.filter((item) => item.snapshot_status === 'ATENCAO').length,
    dados_estimados: items.filter(
      (item) =>
        item.sleep_data_source === 'ESTIMADO' ||
        item.wake_data_source === 'ESTIMADO' ||
        item.jornada_data_source === 'ESTIMADO',
    ).length,
    inconsistencias: items.filter((item) => item.alertas.includes('DADO_INCONSISTENTE')).length,
    sem_fatorizacao: items.filter((item) => item.alertas.includes('JORNADA_SEM_FATORIZACAO')).length,
  };
}

function isCriticalCheckin(checkin: CheckinSnapshotRow | null): boolean {
  if (!checkin) return false;
  const risk = String(checkin.computed_risk_level || '').toLowerCase();
  if (risk === 'critical' || risk === 'unfit_for_duty') return true;

  const nivel = String(checkin.nivel_fadiga || '').toUpperCase();
  if (nivel === 'LARANJA' || nivel === 'VERMELHO' || nivel === 'CRITICO') return true;

  const statusOperacional = String(checkin.status_operacional || '').toUpperCase();
  return statusOperacional.includes('NAO_APTO') || statusOperacional.includes('CRITICO');
}

function resolveJornadaSource(jornada: JornadaSnapshotRow | null): {
  source: FrmsOperationalSnapshotItem['jornada_data_source'];
  origem: Origem | null;
} {
  if (!jornada) {
    return { source: 'AUSENTE', origem: null };
  }

  const origem = normalizeText(jornada.origem) as Origem | null;
  if (asNumber(jornada.is_manual_empty) === 1) {
    return { source: 'INCONSISTENTE', origem: origem ?? 'MANUAL' };
  }

  if (origem === 'MANUAL') {
    return { source: 'MANUAL', origem };
  }

  if (asNumber(jornada.has_operational_data) === 1) {
    return { source: 'REAL', origem };
  }

  return { source: 'ESTIMADO', origem };
}

function includesStatusFilter(
  item: FrmsOperationalSnapshotItem,
  normalizedStatusFilter: Set<string> | null,
): boolean {
  if (!normalizedStatusFilter) return true;
  return normalizedStatusFilter.has(item.snapshot_status);
}

function includesBaseFilter(item: FrmsOperationalSnapshotItem, baseFilter: string | null): boolean {
  if (!baseFilter) return true;
  return String(item.base || '').trim().toUpperCase() === baseFilter;
}

function includesAeronaveFilter(
  item: FrmsOperationalSnapshotItem,
  aeronaveFilter: string | null,
): boolean {
  if (!aeronaveFilter) return true;
  const aeronave = `${item.aeronave || ''}`.trim().toUpperCase();
  return aeronave.includes(aeronaveFilter);
}

export function buildFrmsOperationalSnapshot(
  input: BuildOperationalSnapshotInput,
): FrmsOperationalSnapshotResult {
  const escalaMap = new Map<string, ScaleSnapshotRow>();
  const jornadaMap = new Map<string, JornadaSnapshotRow>();
  const checkinMap = new Map<string, CheckinSnapshotRow>();
  const effectivenessMap = new Map<string, EffectivenessSnapshotRow>();
  const funcionarioMap = new Map<number, FuncionarioSnapshotRow>();

  for (const funcionario of input.rows.funcionarios) {
    funcionarioMap.set(asNumber(funcionario.id), funcionario);
  }

  for (const row of input.rows.escalas) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = escalaMap.get(key);
    if (!current) {
      escalaMap.set(key, { ...row });
      continue;
    }

    escalaMap.set(key, {
      ...current,
      hora_apresentacao:
        [current.hora_apresentacao, row.hora_apresentacao].filter(Boolean).sort()[0] ??
        current.hora_apresentacao,
      hora_termino:
        [current.hora_termino, row.hora_termino].filter(Boolean).sort().slice(-1)[0] ??
        current.hora_termino,
      aeronave_prefixo: current.aeronave_prefixo ?? row.aeronave_prefixo,
      aeronave_modelo: current.aeronave_modelo ?? row.aeronave_modelo,
    });
  }

  for (const row of input.rows.jornadas) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = jornadaMap.get(key);

    if (!current) {
      jornadaMap.set(key, { ...row });
      continue;
    }

    jornadaMap.set(key, {
      ...current,
      hora_apresentacao:
        [current.hora_apresentacao, row.hora_apresentacao].filter(Boolean).sort()[0] ??
        current.hora_apresentacao,
      hora_termino:
        [current.hora_termino, row.hora_termino].filter(Boolean).sort().slice(-1)[0] ??
        current.hora_termino,
      horas_voo_minutos: asNumber(current.horas_voo_minutos) + asNumber(row.horas_voo_minutos),
      duracao_jornada_minutos:
        asNumber(current.duracao_jornada_minutos) + asNumber(row.duracao_jornada_minutos),
      origem: normalizeText(current.origem) ?? normalizeText(row.origem),
      has_operational_data:
        asNumber(current.has_operational_data) === 1 || asNumber(row.has_operational_data) === 1
          ? 1
          : 0,
      is_manual_empty:
        asNumber(current.is_manual_empty) === 1 || asNumber(row.is_manual_empty) === 1 ? 1 : 0,
    });
  }

  for (const row of input.rows.checkins) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    const current = checkinMap.get(key);
    if (!current) {
      checkinMap.set(key, { ...row });
      continue;
    }

    const currentTs = `${current.data_operacional} ${current.hora_checkin || '00:00:00'}`;
    const nextTs = `${row.data_operacional} ${row.hora_checkin || '00:00:00'}`;
    if (nextTs > currentTs) {
      checkinMap.set(key, { ...row });
    }
  }

  for (const row of input.rows.effectiveness) {
    const key = `${row.data_operacional}::${asNumber(row.funcionario_id)}`;
    effectivenessMap.set(key, row);
  }

  const keys = new Set<string>([
    ...escalaMap.keys(),
    ...jornadaMap.keys(),
    ...checkinMap.keys(),
    ...effectivenessMap.keys(),
  ]);

  const items: FrmsOperationalSnapshotItem[] = [];

  for (const key of keys) {
    const [data_operacional, funcionarioIdRaw] = key.split('::');
    const funcionario_id = Number(funcionarioIdRaw);

    const escala = escalaMap.get(key) ?? null;
    const jornada = jornadaMap.get(key) ?? null;
    const checkin = checkinMap.get(key) ?? null;
    const efetividade = effectivenessMap.get(key) ?? null;
    const funcionario = funcionarioMap.get(funcionario_id) ?? null;

    const escalado = Boolean(escala);
    const teveJornada = Boolean(jornada);

    const horaApresentacao =
      normalizeText(escala?.hora_apresentacao) ?? normalizeText(jornada?.hora_apresentacao);
    const horaTermino = normalizeText(jornada?.hora_termino) ?? normalizeText(escala?.hora_termino);

    const horasVooMinutos = asNumber(jornada?.horas_voo_minutos);
    let duracaoJornadaMinutos = asNumber(jornada?.duracao_jornada_minutos);
    if (duracaoJornadaMinutos <= 0) {
      duracaoJornadaMinutos = hmsDiffInMinutes(horaApresentacao, horaTermino);
    }

    const { source: jornadaDataSource, origem: jornadaOrigem } = resolveJornadaSource(jornada);

    const checkinStatus: FrmsOperationalSnapshotItem['checkin_status'] = checkin
      ? 'RECEBIDO'
      : escalado || teveJornada
        ? 'PENDENTE'
        : 'NAO_APLICAVEL';

    const kss = checkin ? asNumber(checkin.kss_score, 0) : null;
    const horasSonoCheckin = checkin ? Number(checkin.horas_sono ?? 0) : null;

    const sleepDataSource: FrmsOperationalSnapshotItem['sleep_data_source'] = checkin
      ? 'REAL'
      : escalado || teveJornada
        ? 'ESTIMADO'
        : 'AUSENTE';

    const wakeDataSource: FrmsOperationalSnapshotItem['wake_data_source'] = checkin?.wake_time
      ? 'REAL'
      : horaApresentacao
        ? 'ESTIMADO'
        : 'AUSENTE';

    const horasSono =
      sleepDataSource === 'REAL'
        ? horasSonoCheckin
        : sleepDataSource === 'ESTIMADO'
          ? 8
          : null;

    const horaAcordar =
      wakeDataSource === 'REAL'
        ? normalizeText(checkin?.wake_time)
        : wakeDataSource === 'ESTIMADO'
          ? computeWakeFromPresentation(horaApresentacao)
          : null;

    const effectivenessPctRaw = efetividade?.effectiveness_pct;
    const effectivenessPct =
      effectivenessPctRaw == null ? null : Number(effectivenessPctRaw);
    const effectivenessPctNormalized =
      effectivenessPct != null && Number.isFinite(effectivenessPct)
        ? Number(effectivenessPct.toFixed(1))
        : null;

    const nivelFadigaCalculado =
      normalizeText(efetividade?.effectiveness_nivel) ?? normalizeText(checkin?.nivel_fadiga);

    const alertas: FrmsOperationalSnapshotAlertCode[] = [];

    if (escalado && !checkin) {
      alertas.push('CHECKIN_PENDENTE');
    }

    if (isCriticalCheckin(checkin)) {
      alertas.push('CHECKIN_CRITICO');
    }

    if (sleepDataSource === 'ESTIMADO') {
      alertas.push('SONO_ESTIMADO');
    }

    if ((horasSono ?? 0) > 0 && (horasSono ?? 0) < 6) {
      alertas.push('SONO_INSUFICIENTE');
    }

    if (kss != null && kss >= 7) {
      alertas.push('KSS_ALTO');
    }

    if (effectivenessPctNormalized != null && effectivenessPctNormalized < 70) {
      alertas.push('EFETIVIDADE_BAIXA');
    }

    if (teveJornada && effectivenessPctNormalized == null) {
      alertas.push('JORNADA_SEM_FATORIZACAO');
    }

    if (escalado && !teveJornada) {
      alertas.push('ESCALADO_SEM_JORNADA_FRMS');
    }

    if (!escalado && teveJornada) {
      alertas.push('JORNADA_FRMS_SEM_ESCALA');
    }

    if (jornadaDataSource === 'INCONSISTENTE') {
      alertas.push('DADO_INCONSISTENTE');
    }

    const alertasUnicos = dedupeAlerts(alertas);

    const snapshotStatus: FrmsOperationalSnapshotStatus = alertasUnicos.includes(
      'DADO_INCONSISTENTE',
    )
      ? 'INCOMPLETO'
      : alertasUnicos.some((code) => code === 'CHECKIN_CRITICO' || code === 'EFETIVIDADE_BAIXA')
        ? 'CRITICO'
        : alertasUnicos.length > 0
          ? 'ATENCAO'
          : 'OK';

    items.push({
      empresa_id: input.empresaId,
      data_operacional,
      funcionario_id,
      tripulante_id: funcionario_id,
      nome: normalizeText(funcionario?.nome),
      nome_guerra: normalizeText(funcionario?.nome_guerra),
      funcao: normalizeText(funcionario?.funcao) ?? normalizeText(funcionario?.cargo),
      base: normalizeText(funcionario?.base),
      aeronave:
        normalizeText(escala?.aeronave_modelo) ??
        normalizeText(escala?.aeronave_prefixo) ??
        normalizeText(funcionario?.aeronave),

      escalado,
      escala_source: escalado
        ? 'EVD'
        : jornadaOrigem === 'SIGVOOS'
          ? 'SIGVOOS'
          : jornadaOrigem === 'MANUAL'
            ? 'MANUAL'
            : 'AUSENTE',
      hora_apresentacao: horaApresentacao,
      hora_termino: horaTermino,
      horas_voo_minutos: horasVooMinutos,
      duracao_jornada_minutos: duracaoJornadaMinutos,
      teve_jornada: teveJornada,

      checkin_status: checkinStatus,
      checkin_horario: normalizeText(checkin?.hora_checkin),
      kss_score: kss,
      horas_sono: horasSono,
      qualidade_sono: checkin ? asNumber(checkin.qualidade_sono, 0) : null,
      hora_acordar: horaAcordar,
      fadiga_score: checkin ? asNumber(checkin.score_fadiga, 0) : null,
      status_operacional_checkin: normalizeText(checkin?.status_operacional),

      effectiveness_pct: effectivenessPctNormalized,
      nivel_fadiga_calculado: nivelFadigaCalculado,
      fatorizacao_status:
        teveJornada && effectivenessPctNormalized != null ? 'CALCULADA' : 'AUSENTE',

      sleep_data_source: sleepDataSource,
      wake_data_source: wakeDataSource,
      jornada_data_source: jornadaDataSource,
      jornada_origem: jornadaOrigem,
      snapshot_status: snapshotStatus,

      alertas: alertasUnicos,
    });
  }

  const statusFilterSet =
    input.filters?.status && input.filters.status.length > 0
      ? new Set(input.filters.status.map((status) => status.trim().toUpperCase()).filter(Boolean))
      : null;

  const baseFilter = normalizeText(input.filters?.base)?.toUpperCase() ?? null;
  const aeronaveFilter = normalizeText(input.filters?.aeronave)?.toUpperCase() ?? null;

  const filtered = items
    .filter((item) => {
      if (
        typeof input.filters?.funcionario_id === 'number' &&
        item.funcionario_id !== input.filters.funcionario_id
      ) {
        return false;
      }

      if (!includesStatusFilter(item, statusFilterSet)) return false;
      if (!includesBaseFilter(item, baseFilter)) return false;
      if (!includesAeronaveFilter(item, aeronaveFilter)) return false;

      if (
        input.filters?.include_inconsistencies === false &&
        item.alertas.includes('DADO_INCONSISTENTE')
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (a.data_operacional !== b.data_operacional) {
        return a.data_operacional < b.data_operacional ? -1 : 1;
      }

      const statusDiff = alertPriority(a.snapshot_status) - alertPriority(b.snapshot_status);
      if (statusDiff !== 0) return statusDiff;

      const nomeA = String(a.nome || '').toUpperCase();
      const nomeB = String(b.nome || '').toUpperCase();
      if (nomeA !== nomeB) return nomeA < nomeB ? -1 : 1;
      return a.funcionario_id - b.funcionario_id;
    });

  return {
    items: filtered,
    summary: buildSummary(filtered),
  };
}

export interface ListFrmsOperationalSnapshotParams {
  empresaId: number;
  dataInicio: string;
  dataFim: string;
  filters?: FrmsOperationalSnapshotFilters;
}

function buildPlaceholders(length: number): string {
  return Array.from({ length }, () => '?').join(', ');
}

export async function listFrmsOperationalSnapshot(
  db: D1Database,
  params: ListFrmsOperationalSnapshotParams,
): Promise<FrmsOperationalSnapshotResult> {
  const [escalasResult, jornadasResult, checkinsResult, effectivenessResult] = await Promise.all([
    db
      .prepare(
        `WITH escala_crew AS (
           SELECT
             e.data AS data_operacional,
             CAST(e.pic_id AS INTEGER) AS funcionario_id,
             e.hora_apresentacao,
             COALESCE(e.hora_corte_motor, e.hora_pouso_real, e.hora_pouso_previsto) AS hora_termino,
             e.aeronave_prefixo,
             e.aeronave_modelo
           FROM escala_voo_diaria e
           WHERE e.deleted_at IS NULL
             AND e.empresa_id = ?
             AND e.data >= ?
             AND e.data <= ?
             AND e.pic_id IS NOT NULL

           UNION ALL

           SELECT
             e.data AS data_operacional,
             CAST(e.sic_id AS INTEGER) AS funcionario_id,
             e.hora_apresentacao,
             COALESCE(e.hora_corte_motor, e.hora_pouso_real, e.hora_pouso_previsto) AS hora_termino,
             e.aeronave_prefixo,
             e.aeronave_modelo
           FROM escala_voo_diaria e
           WHERE e.deleted_at IS NULL
             AND e.empresa_id = ?
             AND e.data >= ?
             AND e.data <= ?
             AND e.sic_id IS NOT NULL
         )
         SELECT data_operacional, funcionario_id, hora_apresentacao, hora_termino, aeronave_prefixo, aeronave_modelo
         FROM escala_crew`,
      )
      .bind(
        params.empresaId,
        params.dataInicio,
        params.dataFim,
        params.empresaId,
        params.dataInicio,
        params.dataFim,
      )
      .all<ScaleSnapshotRow>(),

    db
      .prepare(
        `SELECT
           j.data AS data_operacional,
           CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
           j.hora_apresentacao,
           COALESCE(j.hora_termino, j.hora_corte_motor, j.hora_ultimo_pouso) AS hora_termino,
           COALESCE(j.horas_voo_minutos, 0) AS horas_voo_minutos,
           COALESCE(j.duracao_jornada_minutos, 0) AS duracao_jornada_minutos,
           j.origem,
           CASE
             WHEN j.hora_apresentacao IS NOT NULL
               OR COALESCE(j.horas_voo_minutos, 0) > 0
               OR COALESCE(j.duracao_jornada_minutos, 0) > 0
               OR j.hora_termino IS NOT NULL
             THEN 1 ELSE 0
           END AS has_operational_data,
           CASE
             WHEN UPPER(COALESCE(j.origem, 'MANUAL')) = 'MANUAL'
              AND j.hora_apresentacao IS NULL
              AND j.hora_termino IS NULL
              AND COALESCE(j.horas_voo_minutos, 0) = 0
              AND COALESCE(j.duracao_jornada_minutos, 0) = 0
             THEN 1 ELSE 0
           END AS is_manual_empty
         FROM frms_jornada j
         JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
         WHERE j.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.empresa_id = ?
           AND j.data >= ?
           AND j.data <= ?`,
      )
      .bind(params.empresaId, params.dataInicio, params.dataFim)
      .all<JornadaSnapshotRow>(),

    db
      .prepare(
        `SELECT
           ch.data_checkin AS data_operacional,
           CAST(ch.funcionario_id AS INTEGER) AS funcionario_id,
           ch.hora_checkin,
           ch.kss_score,
           ch.horas_sono,
           ch.qualidade_sono,
           ch.wake_time,
           ch.score_fadiga,
           ch.nivel_fadiga,
           ch.status_operacional,
           ch.computed_risk_level
         FROM frms_fadiga_checkin ch
         WHERE ch.deleted_at IS NULL
           AND ch.empresa_id = ?
           AND ch.data_checkin >= ?
           AND ch.data_checkin <= ?`,
      )
      .bind(params.empresaId, params.dataInicio, params.dataFim)
      .all<CheckinSnapshotRow>(),

    db
      .prepare(
        `WITH ranked AS (
           SELECT
             j.data AS data_operacional,
             CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
             fj.effectiveness_pct,
             fj.effectiveness_nivel,
             ROW_NUMBER() OVER (
               PARTITION BY j.data, j.tripulante_id
               ORDER BY fj.created_at DESC, fj.id DESC
             ) AS rn
           FROM frms_fatorizacao_jornada fj
           JOIN frms_jornada j ON j.id = fj.jornada_id
           JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
           WHERE fj.deleted_at IS NULL
             AND j.deleted_at IS NULL
             AND f.deleted_at IS NULL
             AND f.empresa_id = ?
             AND j.data >= ?
             AND j.data <= ?
         )
         SELECT data_operacional, funcionario_id, effectiveness_pct, effectiveness_nivel
         FROM ranked
         WHERE rn = 1`,
      )
      .bind(params.empresaId, params.dataInicio, params.dataFim)
      .all<EffectivenessSnapshotRow>(),
  ]);

  const candidateIds = new Set<number>();
  for (const row of escalasResult.results || []) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of jornadasResult.results || []) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of checkinsResult.results || []) candidateIds.add(asNumber(row.funcionario_id));
  for (const row of effectivenessResult.results || []) candidateIds.add(asNumber(row.funcionario_id));

  let funcionarios: FuncionarioSnapshotRow[] = [];
  const ids = Array.from(candidateIds).filter((id) => id > 0);

  if (ids.length > 0) {
    const placeholders = buildPlaceholders(ids.length);
    const result = await db
      .prepare(
        `SELECT
           id,
           nome,
           guerra AS nome_guerra,
           funcao,
           cargo,
           base,
           aeronave
         FROM funcionarios
         WHERE deleted_at IS NULL
           AND empresa_id = ?
           AND id IN (${placeholders})`,
      )
      .bind(params.empresaId, ...ids)
      .all<FuncionarioSnapshotRow>();

    funcionarios = result.results || [];
  }

  return buildFrmsOperationalSnapshot({
    empresaId: params.empresaId,
    rows: {
      escalas: escalasResult.results || [],
      jornadas: jornadasResult.results || [],
      checkins: checkinsResult.results || [],
      effectiveness: effectivenessResult.results || [],
      funcionarios,
    },
    filters: params.filters,
  });
}
