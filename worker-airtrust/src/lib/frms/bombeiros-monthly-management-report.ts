/**
 * BOA/CBMMG — monthly managerial/technical EVIDENCE PREVIEW, not an
 * official report, a validated fatigue index or a signed audit artefact.
 *
 * One employee source (funcionarios), one BOA event stream, independent
 * regulatory profile and tenant-scoped read-only SQL. No person identifiers,
 * raw KSS, sleep, PVT, medical records or arbitrary offshore thresholds.
 *
 * The month identifies the check-in cohort. Case states are evaluated as of
 * generation time, NOT as they stood at month-end.
 */
import {
  BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE, BOA_CASE_TREATMENT_TYPE,
  BOA_CASE_CLOSED_TYPE,
} from './bombeiros-operational-events';

export interface BoaMonthlyCaseMetrics {
  opened: number | null;
  awaiting_treatment: number | null;
  under_treatment: number | null;
  closed_with_efficacy: number | null;
  privacy: 'OBSERVED' | 'NO_RECEIPTS' | 'SMALL_PARTICIPATION' | 'SMALL_CELL_SUPPRESSED';
}

export interface BoaMonthlyEvidencePeriod {
  month: string;
  participants: number | null;
  checkin_receipts: number | null;
  cases: BoaMonthlyCaseMetrics;
}

export interface BoaMonthlyReportPreview {
  method_version: 'BOA_MONTHLY_EVIDENCE_PREVIEW_V1';
  source: 'FRMS_FADIGA_EVENTO_BOA_TENANT';
  state: 'UNSIGNED_UNVALIDATED_PREVIEW';
  coverage: 'NOT_DETERMINABLE_WITHOUT_ROSTER';
  basis: 'CHECKIN_MONTH_AND_CASE_STATUS_AT_GENERATION';
  current: BoaMonthlyEvidencePeriod;
  previous: BoaMonthlyEvidencePeriod;
  receipt_delta: number | null;
  managerial_recommendations: string[];
  technical_caveats: string[];
  provenance: {
    employee_source: 'FUNCIONARIOS';
    event_types: string[];
    scientific_score: 'NOT_VALIDATED';
    stored: false;
    signed: false;
    workforce_scope_size: null;
  };
}

interface RawPeriod {
  receipt_count: number;
  unique_person_days: number;
  participants: number;
  opened: number;
  untreated: number;
  treating: number;
  closed: number;
  invalid: number;
}

function nextMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}
function previousMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function nonnegative(raw: RawPeriod): void {
  if (Object.values(raw).some(x => !Number.isSafeInteger(x) || x < 0)
    || raw.participants > raw.receipt_count
    || raw.unique_person_days !== raw.receipt_count
    || raw.invalid !== 0
    || raw.opened !== raw.receipt_count
    || raw.untreated + raw.treating + raw.closed !== raw.opened) {
    throw new Error('BOA_MONTHLY_CASE_STREAM_INTEGRITY_ERROR');
  }
}
function safePeriod(month: string, raw: RawPeriod): BoaMonthlyEvidencePeriod {
  nonnegative(raw);
  const suppressed = (): BoaMonthlyCaseMetrics => ({
    opened: null, awaiting_treatment: null, under_treatment: null,
    closed_with_efficacy: null,
    privacy: 'SMALL_PARTICIPATION',
  });
  if (raw.participants > 0 && raw.participants < 5) {
    return { month, participants: null, checkin_receipts: null, cases: suppressed() };
  }
  if (raw.receipt_count === 0) {
    return { month, participants: 0, checkin_receipts: 0, cases: {
      opened: 0, awaiting_treatment: 0, under_treatment: 0,
      closed_with_efficacy: 0, privacy: 'NO_RECEIPTS',
    } };
  }
  // Suppress the COMPLETE case distribution when any nonzero bucket is 1–4.
  // This also prevents reconstruction by subtracting buckets from the total.
  const smallCaseCell = [raw.untreated, raw.treating, raw.closed]
    .some(x => x > 0 && x < 5);
  return {
    month,
    participants: raw.participants,
    checkin_receipts: raw.receipt_count,
    cases: smallCaseCell ? {
      opened: null, awaiting_treatment: null, under_treatment: null,
      closed_with_efficacy: null, privacy: 'SMALL_CELL_SUPPRESSED',
    } : {
      opened: raw.opened,
      awaiting_treatment: raw.untreated,
      under_treatment: raw.treating,
      closed_with_efficacy: raw.closed,
      privacy: 'OBSERVED',
    },
  };
}

/**
 * Only an admin of the BOA tenant with effective FIREFIGHTER_AVIATION policy
 * may call this; the API resolves that guard and allowedCrewIds itself.
 */
export async function loadBoaMonthlyManagementPreview(
  db: D1Database,
  empresaId: number,
  month: string,
  allowedCrewIds: ReadonlySet<number>,
): Promise<BoaMonthlyReportPreview> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || empresaId === 6) {
    throw new Error('BOA_REPORT_TENANT_REQUIRED');
  }
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new Error('BOA_REPORT_MONTH_INVALID');
  }
  const ids = [...allowedCrewIds];
  if (ids.length < 5) throw new Error('BOA_REPORT_SMALL_AUTHORIZED_COHORT');
  if (ids.length > 10000 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
      || new Set(ids).size !== ids.length) {
    throw new Error('BOA_REPORT_INVALID_EMPLOYEE_SCOPE');
  }
  const placeholders = ids.map(() => '?').join(', ');
  const sql = `WITH receipts AS (
    SELECT e.id AS receipt_id, f.id AS employee_id,
      json_extract(e.payload_json, '$.reference_date') AS reference_date
      FROM frms_fadiga_evento e
      JOIN funcionarios f
        ON f.id = CAST(json_extract(e.payload_json, '$.funcionario_id') AS INTEGER)
       AND f.empresa_id = e.empresa_id
     WHERE e.empresa_id = ?
       AND f.empresa_id = ?
       AND f.deleted_at IS NULL AND f.ativo = 1
       AND e.tipo = ?
       AND json_extract(e.payload_json, '$.schema') = ?
       AND json_extract(e.payload_json, '$.submitted_at') IS NOT NULL
       AND TRIM(CAST(json_extract(e.payload_json, '$.submitted_at') AS TEXT)) <> ''
       AND LENGTH(CAST(json_extract(e.payload_json, '$.reference_date') AS TEXT)) = 10
       AND DATE(json_extract(e.payload_json, '$.reference_date')) = json_extract(e.payload_json, '$.reference_date')
       AND json_extract(e.payload_json, '$.reference_date') >= ?
       AND json_extract(e.payload_json, '$.reference_date') < ?
       AND f.id IN (${placeholders})
  ), states AS (
    SELECT r.receipt_id, r.employee_id, r.reference_date,
       COUNT(DISTINCT o.id) AS opens,
       COUNT(DISTINCT treatment.id) AS treatments,
       COUNT(DISTINCT closure.id) AS closures
      FROM receipts r
      LEFT JOIN frms_fadiga_evento o
        ON o.checkin_id = r.receipt_id AND o.empresa_id = ?
       AND o.tipo = ?
      LEFT JOIN frms_fadiga_evento treatment
        ON treatment.checkin_id = o.id AND treatment.empresa_id = o.empresa_id
       AND treatment.tipo = ?
      LEFT JOIN frms_fadiga_evento closure
        ON closure.checkin_id = o.id AND closure.empresa_id = o.empresa_id
       AND closure.tipo = ?
     GROUP BY r.receipt_id, r.employee_id, r.reference_date
  ) SELECT
      COUNT(*) AS receipt_count,
      COUNT(DISTINCT CAST(employee_id AS TEXT) || ':' || reference_date) AS unique_person_days,
      COUNT(DISTINCT employee_id) AS participants,
      COALESCE(SUM(opens), 0) AS opened,
      COALESCE(SUM(CASE WHEN opens = 1 AND treatments = 0 AND closures = 0
        THEN 1 ELSE 0 END), 0) AS untreated,
      COALESCE(SUM(CASE WHEN opens = 1 AND treatments = 1 AND closures = 0
        THEN 1 ELSE 0 END), 0) AS treating,
      COALESCE(SUM(CASE WHEN opens = 1 AND treatments = 1 AND closures = 1
        THEN 1 ELSE 0 END), 0) AS closed,
      COALESCE(SUM(CASE WHEN opens <> 1 OR treatments > 1
        OR closures > 1 OR closures > treatments
        THEN 1 ELSE 0 END), 0) AS invalid
      FROM states`;
  const load = async (referenceMonth: string): Promise<BoaMonthlyEvidencePeriod> => {
    const raw = await db.prepare(sql).bind(
      empresaId, empresaId, BOA_CHECKIN_TYPE, BOA_CHECKIN_TYPE,
      `${referenceMonth}-01`, `${nextMonth(referenceMonth)}-01`,
      ...ids, empresaId, BOA_CASE_OPEN_TYPE, BOA_CASE_TREATMENT_TYPE,
      BOA_CASE_CLOSED_TYPE,
    ).first<RawPeriod>();
    if (!raw) throw new Error('BOA_MONTHLY_REPORT_SOURCE_UNAVAILABLE');
    return safePeriod(referenceMonth, raw);
  };
  const [current, previous] = await Promise.all([load(month), load(previousMonth(month))]);
  return {
    method_version: 'BOA_MONTHLY_EVIDENCE_PREVIEW_V1',
    source: 'FRMS_FADIGA_EVENTO_BOA_TENANT',
    state: 'UNSIGNED_UNVALIDATED_PREVIEW',
    coverage: 'NOT_DETERMINABLE_WITHOUT_ROSTER',
    basis: 'CHECKIN_MONTH_AND_CASE_STATUS_AT_GENERATION',
    current, previous,
    receipt_delta: current.checkin_receipts == null || previous.checkin_receipts == null
      ? null : current.checkin_receipts - previous.checkin_receipts,
    managerial_recommendations: [
      'Conferir as escalas e missões planejadas/realizadas para conhecer a população exposta e identificar check-ins ausentes.',
      'Manter responsáveis e prazos das mitigações, com avaliação humana e evidência de eficácia antes de encerrar casos.',
      'Revisar acionamentos noturnos, sobreavisos, oportunidades de repouso e redistribuição de missões conforme protocolo BOA aprovado.',
    ],
    technical_caveats: [
      'Os registros representam recibos enviados, não taxa de adesão, incidência de fadiga ou liberação de serviço.',
      'Estados dos casos abertos no mês são consultados na geração; não representam necessariamente o estado ao fechar o mês.',
      'A avaliação científica, limiares, validade local KSS/PVT adaptado e critérios operacionais BOA ainda exigem homologação.',
      'A política exibida no envelope é a vigente na emissão, não necessariamente a revisão de todos os registros históricos.',
      'Este documento não é persistido, assinado nem auditado como relatório oficial e não serve isoladamente para comprovar o edital.',
      'Supressão de dados de grupos e células pequenas impede reconstruir participações individuais.',
    ],
    provenance: {
      employee_source: 'FUNCIONARIOS',
      event_types: [
        BOA_CHECKIN_TYPE, BOA_CASE_OPEN_TYPE,
        BOA_CASE_TREATMENT_TYPE, BOA_CASE_CLOSED_TYPE,
      ],
      scientific_score: 'NOT_VALIDATED',
      stored: false, signed: false, workforce_scope_size: null,
    },
  };
}
