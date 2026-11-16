// Avaliação pura da cadeia SIGVOOS -> Controle de Voos -> FRMS a partir de fatos já lidos.
// Sem rede, banco ou arquivo. Só contagens agregadas; nenhum identificador de pessoa.
export const SEVERITY = Object.freeze({ VIOLATION: 'VIOLATION', ADVISORY: 'ADVISORY', INFO: 'INFO' });

const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''));
const addDays = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export function listDays(from, to, limit = 62) {
  if (!isDay(from) || !isDay(to) || from > to) throw new Error('WINDOW_INVALID');
  const out = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (out.length >= limit) throw new Error('WINDOW_TOO_LARGE');
    out.push(day);
  }
  return out;
}

/**
 * @param facts resultado das leituras; cada sonda indisponível vem como { unavailable: 'CÓDIGO' }.
 * @param ctx   { today } data civil de São Paulo; { from, to } janela de dias fechados.
 */
export function evaluateChain(facts, ctx) {
  const findings = [];
  const add = (severity, code, detail = {}) => findings.push({ severity, code, ...detail });
  const yesterday = addDays(ctx.today, -1);
  const days = listDays(ctx.from, ctx.to);

  for (const [name, value] of Object.entries(facts)) {
    if (value && typeof value === 'object' && 'unavailable' in value) {
      add(SEVERITY.ADVISORY, 'PROBE_UNAVAILABLE', { probe: name, reason: value.unavailable });
    }
  }

  // A. Frescor da ingestão e rechecagem retroativa D-3..D-1.
  const cron = facts.cron;
  if (cron && !cron.unavailable) {
    if (!cron.row) {
      add(SEVERITY.VIOLATION, 'INGEST_STATE_ABSENT');
    } else {
      const watermark = isDay(cron.row.watermark_to) ? cron.row.watermark_to : null;
      const lagDays = watermark ? daysBetween(watermark, yesterday) : null;
      const reviewed = isDay(cron.row.last_reviewed) ? cron.row.last_reviewed : null;
      const reviewLag = reviewed ? daysBetween(reviewed, ctx.today) : null;
      add(SEVERITY.INFO, 'INGEST_STATE', {
        watermark_to: watermark, lag_days_vs_yesterday: lagDays, last_reviewed: reviewed, review_lag_days: reviewLag,
        stage: cron.row.stage ?? null, consecutive_failures: Number(cron.row.consecutive_failures ?? 0),
        processed_total: Number(cron.row.processed_total ?? 0), failed_total: Number(cron.row.failed_total ?? 0),
        last_error_code: /^[A-Z0-9_:.-]{1,80}$/.test(String(cron.row.last_error_code ?? '')) ? cron.row.last_error_code : null,
      });
      // O job roda uma vez por dia, depois do dia fechar: no máximo 1 dia de atraso é normal.
      if (lagDays === null || lagDays > 1) add(SEVERITY.VIOLATION, 'INGEST_WATERMARK_STALE', { lag_days: lagDays });
      if (reviewLag === null || reviewLag > 1) add(SEVERITY.VIOLATION, 'RETROACTIVE_REVIEW_NOT_RUNNING', { review_lag_days: reviewLag });
      if (Number(cron.row.consecutive_failures ?? 0) > 0) {
        add(SEVERITY.VIOLATION, 'INGEST_CONSECUTIVE_FAILURES', { consecutive_failures: Number(cron.row.consecutive_failures) });
      }
    }
  }

  // B. Eventos de falha recentes.
  const events = facts.events;
  if (events && !events.unavailable) {
    const failures = events.rows.filter((row) => row.tipo_evento === 'CRON_FALHA');
    const total = failures.reduce((sum, row) => sum + Number(row.n ?? 0), 0);
    add(SEVERITY.INFO, 'FAILURE_EVENTS_LAST_14D', { total, by_day: Object.fromEntries(
      failures.map((row) => [row.dia, Number(row.n ?? 0)])) });
    const recent = failures.filter((row) => row.dia >= addDays(ctx.today, -2)).reduce((sum, row) => sum + Number(row.n ?? 0), 0);
    if (recent > 0) add(SEVERITY.ADVISORY, 'RECENT_INGEST_FAILURES', { last_48h: recent });
  }

  // C. Ledger de cobertura por dia fechado.
  const ledger = facts.ledger;
  if (ledger && !ledger.unavailable) {
    const byDay = new Map();
    for (const row of ledger.rows) if (isDay(row.day)) byDay.set(row.day, [...(byDay.get(row.day) ?? []), String(row.status)]);
    const closed = days.filter((day) => day <= yesterday);
    const count = (predicate) => closed.filter((day) => predicate(byDay.get(day) ?? [])).length;
    const consolidated = count((s) => s.includes('CONSOLIDADO'));
    const failed = count((s) => !s.includes('CONSOLIDADO') && s.includes('FALHOU'));
    const missing = count((s) => s.length === 0);
    add(SEVERITY.INFO, 'COVERAGE_LEDGER', { closed_days: closed.length, consolidated, failed, missing,
      ledger_rows_total: ledger.rows.reduce((sum, row) => sum + Number(row.n ?? 0), 0) });
    if (ledger.rows.length === 0) add(SEVERITY.ADVISORY, 'COVERAGE_LEDGER_INACTIVE_FOR_TENANT');
    else if (failed > 0) add(SEVERITY.VIOLATION, 'COVERAGE_DAYS_FAILED', { failed });
    else if (missing > 0) add(SEVERITY.ADVISORY, 'COVERAGE_DAYS_NOT_ATTESTED', { missing });
  }

  // Governança do art. 42 (Lei 13.475): ativação depende de parecer jurídico, então o estado esperado é inativo.
  const art42 = facts.art42;
  if (art42 && !art42.unavailable) {
    if (art42.rows.length !== 1) {
      add(SEVERITY.ADVISORY, 'ART42_PROFILE_UNRESOLVED', { effective_profiles: art42.rows.length });
    } else {
      const flag = art42.rows[0].enforced === 1 || art42.rows[0].enforced === true
        || art42.rows[0].enforced_camel === 1 || art42.rows[0].enforced_camel === true;
      add(SEVERITY.INFO, 'ART42_ENFORCEMENT_STATE', { state: flag ? 'ACTIVE' : 'INACTIVE' });
      if (flag) add(SEVERITY.ADVISORY, 'ART42_ACTIVE_VERIFY_LEGAL_BASIS');
    }
  }

  // Ciclo de tratamento de casos: prazo vencido tem que deixar registro de escalonamento.
  const cases = facts.cases;
  if (cases && !cases.unavailable) {
    add(SEVERITY.INFO, 'CASE_LIFECYCLE', { ...cases });
    if (Number(cases.overdue_open) > 0 && Number(cases.overdue_notifications_7d) === 0) {
      // Esperado até o escalonamento ser publicado e rodar o primeiro cron diário; depois disso é falha.
      add(SEVERITY.ADVISORY, 'OVERDUE_CASES_WITHOUT_ESCALATION_RECORD', {
        overdue_open: Number(cases.overdue_open) });
    }
  }

  // D. Integridade: duplicação, órfãos e isolamento.
  const integrity = facts.integrity;
  if (integrity && !integrity.unavailable) {
    for (const [code, value] of Object.entries({
      CV_DUPLICATE_ETAPA_GROUPS: integrity.duplicate_etapa_groups,
      CV_SAME_CONTENT_HASH_IN_DIFFERENT_VOOS: integrity.same_hash_different_voos,
      FRMS_DUPLICATE_JORNADA_GROUPS: integrity.duplicate_jornada_groups,
      CV_ORPHAN_ETAPAS: integrity.orphan_etapas,
      CV_ORPHAN_TRIPULANTES: integrity.orphan_tripulantes,
      CV_CROSS_TENANT_ROWS: integrity.cross_tenant_rows,
    })) {
      if (Number(value ?? 0) > 0) add(SEVERITY.VIOLATION, code, { count: Number(value) });
    }
    if (integrity.crew_unique_index_present === false) add(SEVERITY.VIOLATION, 'CV_CREW_UNIQUE_INDEX_MISSING');
    add(SEVERITY.INFO, 'INTEGRITY_COUNTS', Object.fromEntries(Object.entries(integrity).map(([k, v]) => [k, v])));
  }

  // E. Reconciliação por dia entre voos realizados no CV e jornadas SIGVOOS no FRMS.
  const recon = facts.reconciliation;
  if (recon && !recon.unavailable) {
    const map = (rows) => new Map(rows.map((row) => [row.dia, Number(row.n ?? 0)]));
    const cv = map(recon.cv_crew_days);
    const frms = map(recon.frms_sigvoos_crew_days);
    let onlyCv = 0; let onlyFrms = 0; let both = 0; let cvTotal = 0; let frmsTotal = 0;
    for (const day of days.filter((d) => d <= yesterday)) {
      const a = cv.get(day) ?? 0; const b = frms.get(day) ?? 0;
      cvTotal += a; frmsTotal += b;
      if (a > 0 && b === 0) onlyCv += 1; else if (b > 0 && a === 0) onlyFrms += 1; else if (a > 0 && b > 0) both += 1;
    }
    add(SEVERITY.INFO, 'RECONCILIATION', { days_both: both, days_only_cv: onlyCv, days_only_frms_jornada: onlyFrms,
      cv_crew_days: cvTotal, frms_sigvoos_crew_days: frmsTotal });
    // FRMS lê o Controle de Voos diretamente; dia só no FRMS legado indica jornada sem origem rastreável.
    if (onlyFrms > 0) add(SEVERITY.ADVISORY, 'FRMS_JORNADA_WITHOUT_CV_DAY', { days: onlyFrms });
    if (onlyCv > 0) add(SEVERITY.INFO, 'CV_DAY_WITHOUT_FRMS_JORNADA_ROW', { days: onlyCv,
      note: 'esperado quando o FRMS consome o Controle de Voos direto, sem linha em frms_jornada' });
  }

  return {
    findings,
    violations: findings.filter((f) => f.severity === SEVERITY.VIOLATION).length,
    advisories: findings.filter((f) => f.severity === SEVERITY.ADVISORY).length,
  };
}
