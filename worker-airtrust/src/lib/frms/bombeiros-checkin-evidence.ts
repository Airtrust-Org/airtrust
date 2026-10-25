/**
 * BOA — evidence-only monthly check-in receipts.
 *
 * No Costa do Sol operational snapshot, offshore regulatory thresholds,
 * KSS/PVT scores, health answers or inferred duty fitness.
 * A receipt is an existing submitted record, NOT a complete check-in.
 */
export interface BombeirosCheckinMonthTotals {
  receipt_person_days: number | null;
  distinct_people: number | null;
  privacy_state: 'OBSERVED' | 'NO_RECEIPTS' | 'SMALL_COHORT_SUPPRESSED' | 'SMALL_PARTICIPANT_SET_SUPPRESSED';
}

export interface BombeirosCheckinMonthlyEvidence {
  current: BombeirosCheckinMonthTotals;
  previous: BombeirosCheckinMonthTotals;
  receipt_person_days_delta: number | null;
  source: 'BOA_FRMS_CHECKIN_EVENT_TENANT_SCOPED';
  restrictions: string[];
}

type RawCounts = { receipt_person_days: number; distinct_people: number };

function nextMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
}

function previousMonth(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

function protectTotals(raw: RawCounts, size: number): BombeirosCheckinMonthTotals {
  if (size < 5) {
    return { receipt_person_days: null, distinct_people: null, privacy_state: 'SMALL_COHORT_SUPPRESSED' };
  }
  if (!Number.isSafeInteger(raw.distinct_people) || !Number.isSafeInteger(raw.receipt_person_days)
    || raw.distinct_people < 0 || raw.receipt_person_days < raw.distinct_people) {
    throw new Error('BOMBEIROS_CHECKIN_AGGREGATE_INTEGRITY_ERROR');
  }
  if (raw.distinct_people === 0) {
    return { receipt_person_days: 0, distinct_people: 0, privacy_state: 'NO_RECEIPTS' };
  }
  if (raw.distinct_people < 5) {
    // Protect participation, even when one person's many days exceed 4.
    return { receipt_person_days: null, distinct_people: null, privacy_state: 'SMALL_PARTICIPANT_SET_SUPPRESSED' };
  }
  return { receipt_person_days: raw.receipt_person_days, distinct_people: raw.distinct_people, privacy_state: 'OBSERVED' };
}

/** Requires prevalidated tenant context + effective BOA profile from the API. */
export async function loadBombeirosCheckinMonthlyEvidence(
  db: D1Database,
  empresaId: number,
  month: string,
  allowedCrewIds: ReadonlySet<number>,
): Promise<BombeirosCheckinMonthlyEvidence> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || empresaId === 6) {
    throw new Error('BOMBEIROS_TENANT_REQUIRED');
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new Error('BOMBEIROS_INVALID_MONTH');
  }
  const ids = [...allowedCrewIds];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || ids.length > 10000) {
    throw new Error('BOMBEIROS_INVALID_AUTHORIZED_SCOPE');
  }
  // The caller also blocks small cohorts. Do not execute any D1 read when <5.
  if (ids.length < 5) {
    const suppressed = protectTotals({ receipt_person_days: 0, distinct_people: 0 }, ids.length);
    return {
      current: suppressed, previous: suppressed, receipt_person_days_delta: null,
      source: 'BOA_FRMS_CHECKIN_EVENT_TENANT_SCOPED',
      restrictions: ['Acesso suprimido para equipe autorizada com menos de cinco funcionários.'],
    };
  }
  const placeholders = ids.map(() => '?').join(', ');
  // Query only BOA check-in events, NOT offshore frms_fadiga_checkin rows.
  // Both tenant predicates are mandatory, and payload employee ID is checked
  // against canonical funcionarios with active membership.
  const sql = `SELECT
      COUNT(DISTINCT CAST(f.id AS TEXT) || ':' ||
        json_extract(e.payload_json, '$.reference_date')) AS receipt_person_days,
      COUNT(DISTINCT f.id) AS distinct_people
     FROM frms_fadiga_evento e
     JOIN funcionarios f
       ON f.id = CAST(json_extract(e.payload_json, '$.funcionario_id') AS INTEGER)
      AND f.empresa_id = e.empresa_id
    WHERE e.empresa_id = ?
      AND f.empresa_id = ?
      AND e.tipo = 'BOA_CHECKIN_V1'
      AND json_extract(e.payload_json, '$.schema') = 'BOA_CHECKIN_V1'
      AND f.deleted_at IS NULL
      AND f.ativo = 1
      AND json_extract(e.payload_json, '$.submitted_at') IS NOT NULL
      AND json_extract(e.payload_json, '$.reference_date') >= ?
      AND json_extract(e.payload_json, '$.reference_date') < ?
      AND f.id IN (${placeholders})`;
  const run = async (referenceMonth: string): Promise<BombeirosCheckinMonthTotals> => {
    const row = await db.prepare(sql)
      .bind(empresaId, empresaId, `${referenceMonth}-01`, `${nextMonth(referenceMonth)}-01`, ...ids)
      .first<RawCounts>();
    if (!row) throw new Error('BOMBEIROS_CHECKIN_AGGREGATE_MISSING');
    return protectTotals(row, ids.length);
  };
  const [current, previous] = await Promise.all([run(month), run(previousMonth(month))]);
  return {
    current, previous,
    receipt_person_days_delta: current.receipt_person_days !== null && previous.receipt_person_days !== null
      ? current.receipt_person_days - previous.receipt_person_days : null,
    source: 'BOA_FRMS_CHECKIN_EVENT_TENANT_SCOPED',
    restrictions: [
      'Contagem de recibos de triagem BOA enviados; não confirma completude, recuperação, prontidão ou aptidão.',
      'Sem denominador de dias escalados, não calcular taxa de adesão ou cobertura.',
      'Não usa classificação/limites de aviação offshore nem retorna respostas individuais de saúde.',
      'Células com menos de cinco participantes são suprimidas, inclusive quando o número de dias é maior.',
    ],
  };
}
