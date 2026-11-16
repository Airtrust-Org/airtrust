// Validação independente da obrigação diária de check-in FRMS (#2356) contra dados reais.
// Camada pura: nenhum acesso a rede, banco ou arquivo. O oráculo abaixo NÃO reutiliza a regra
// canônica do Worker; ele reescreve as invariantes a partir das tabelas de escala/atividade.
//
// Privacidade: o relatório só carrega contagens de tripulante-dia e, nas violações, uma
// referência HMAC-free (sha256 truncado) que só quem já tem o banco consegue reverter.
import { createHash } from 'node:crypto';

export const ABSENCE_CODES = Object.freeze(['FOLGA', 'FERIAS', 'MED', 'AFT']);
export const NON_FLIGHT_CODES = Object.freeze(['SIM', 'CURSO']);
export const MANUAL_ABSENCE_EVENTS = Object.freeze(['folga', 'ferias', 'licenca']);
export const CREW_FUNCTIONS = Object.freeze(['PILOTO', 'COPILOTO', 'COMANDANTE']);
const PRESUMPTION_BASES = Object.freeze(['QUINZENA_BASE_SEM_ESCALA', 'SEM_PROGRAMACAO', 'AUSENCIA_PROGRAMADA']);
const MUTATION_WORDS = /\b(INSERT|UPDATE|DELETE|REPLACE|MERGE|CREATE|ALTER|DROP|VACUUM|ATTACH|DETACH|PRAGMA|REINDEX|ANALYZE)\b/i;

/** Remove literais e comentários para que palavras dentro deles não disparem falso positivo. */
function stripLiteralsAndComments(sql) {
  return String(sql)
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function assertReadOnlyQuery(sql) {
  const text = String(sql ?? '');
  const body = stripLiteralsAndComments(text).trim();
  if (!/^(SELECT|WITH)\b/i.test(body)) throw new Error('ONLY_SELECT_PERMITTED');
  if (body.includes(';')) throw new Error('MULTI_STATEMENT_FORBIDDEN');
  if (MUTATION_WORDS.test(body)) throw new Error('MUTATION_FORBIDDEN');
  return text;
}

/**
 * Adaptador D1 mínimo (prepare/bind/all/first) sobre uma função de consulta.
 * Qualquer instrução que não seja SELECT/WITH falha antes de sair do processo.
 */
export function createReadOnlyD1(queryFn, stats = { queries: 0 }) {
  const run = async (sql, params) => {
    assertReadOnlyQuery(sql);
    stats.queries += 1;
    return queryFn(sql, params);
  };
  const statement = (sql, params = []) => ({
    bind: (...args) => statement(sql, args),
    all: async () => ({ results: await run(sql, params), success: true }),
    first: async () => (await run(sql, params))[0] ?? null,
  });
  return { prepare: (sql) => statement(sql), stats };
}

export function crewRef(empresaId, funcionarioId) {
  return createHash('sha256')
    .update(`airtrust-frms-checkin-validation:${empresaId}:${funcionarioId}`)
    .digest('hex')
    .slice(0, 10);
}

const covers = (row, date) => row.data_inicio <= date && date <= row.data_fim;
const upper = (value) => String(value ?? '').trim().toUpperCase();

function classify(situacao) {
  const code = upper(situacao);
  if (ABSENCE_CODES.includes(code)) return 'ABSENCE';
  if (NON_FLIGHT_CODES.includes(code)) return 'NON_FLIGHT';
  return 'OPERATIONAL';
}

function bump(map, key, by = 1) {
  map[key] = (map[key] ?? 0) + by;
}

/**
 * Avalia um dia. `oracle` traz só fatos de origem: check-ins, EVD não cancelada, jornada canônica
 * com dado operacional, alocações com contexto e eventos manuais de ausência.
 */
export function evaluateDay({ empresaId, date, crew, allEmployees, obligations, oracle }) {
  const day = {
    date, crew: crew.size, status: {}, base: {}, divergences: {}, violations: [],
    received_oracle: 0, received_obligation: 0, gap_crew_days: 0,
    legacy_pending_no_checkin: 0, legacy_not_pending_now: {},
  };
  const violate = (code, id) => day.violations.push({ code, date, crew_ref: crewRef(empresaId, id) });

  for (const id of obligations.keys()) {
    if (!allEmployees.has(id)) violate('OBRIGACAO_FORA_DO_TENANT', id);
  }

  for (const id of crew) {
    const obligation = obligations.get(id);
    if (!obligation) { violate('OBRIGACAO_AUSENTE', id); continue; }
    bump(day.status, obligation.status);
    bump(day.base, obligation.base);
    for (const divergence of obligation.divergencias ?? []) bump(day.divergences, divergence);

    const hasCheckin = oracle.checkins.has(id);
    const evd = oracle.evd.has(id);
    const jornada = oracle.jornada.has(id);
    const own = oracle.allocations.filter((row) => row.funcionario_id === id);
    const covering = own.filter((row) => covers(row, date));
    const kinds = new Set(covering.map((row) => classify(row.situacao_tipo)));
    const manualAbsence = oracle.manualAbsence.some(
      (row) => row.funcionario_id === id && covers(row, date),
    );

    if (hasCheckin) day.received_oracle += 1;
    if (obligation.status === 'RECEBIDO') day.received_obligation += 1;

    // Nenhuma atividade comprovada pode ser ignorada.
    if ((evd || jornada) && !['PENDENTE', 'RECEBIDO'].includes(obligation.status)) {
      violate('ATIVIDADE_COMPROVADA_IGNORADA', id);
    }
    // Pendência por alocação exige alocação operacional e nenhuma ausência sobreposta.
    if (obligation.status === 'PENDENTE' && obligation.base === 'ALOCACAO_OPERACIONAL'
      && (!kinds.has('OPERATIONAL') || kinds.has('ABSENCE') || manualAbsence)) {
      violate('PENDENCIA_SEM_ALOCACAO_OPERACIONAL', id);
    }
    // Presunção nunca gera pendência.
    if (obligation.status === 'PENDENTE' && PRESUMPTION_BASES.includes(obligation.base)) {
      violate('PENDENCIA_POR_PRESUNCAO', id);
    }
    // Quinzena quebrada: lacuna entre alocações, sem atividade, não pode ser pendente.
    const before = own.some((row) => row.data_fim < date);
    const after = own.some((row) => row.data_inicio > date);
    if (before && after && covering.length === 0 && !manualAbsence && !evd && !jornada) {
      day.gap_crew_days += 1;
      if (obligation.status === 'PENDENTE') violate('LACUNA_QUINZENA_QUEBRADA_PENDENTE', id);
    }
    // Regra antiga: presença na quinzena-base, EVD ou atividade sem check-in = pendente.
    const legacyPending = !hasCheckin && (oracle.legacyRoster.has(id) || evd || jornada);
    if (legacyPending) {
      day.legacy_pending_no_checkin += 1;
      if (obligation.status !== 'PENDENTE') bump(day.legacy_not_pending_now, obligation.status);
    }
  }
  if (day.received_oracle !== day.received_obligation) {
    day.violations.push({ code: 'CHECKIN_RECEBIDO_DIVERGENTE', date, crew_ref: null });
  }
  return day;
}

export function summarize(days, { sampleLimit = 10 } = {}) {
  const totals = { crew_days: 0, status: {}, base: {}, divergences: {}, gap_crew_days: 0,
    legacy_pending_no_checkin: 0, legacy_not_pending_now: {} };
  const invariants = {};
  const samples = [];
  for (const day of days) {
    totals.crew_days += day.crew;
    totals.gap_crew_days += day.gap_crew_days;
    totals.legacy_pending_no_checkin += day.legacy_pending_no_checkin;
    for (const key of ['status', 'base', 'divergences', 'legacy_not_pending_now']) {
      for (const [name, count] of Object.entries(day[key])) bump(totals[key], name, count);
    }
    for (const violation of day.violations) {
      bump(invariants, violation.code);
      if (samples.length < sampleLimit) samples.push(violation);
    }
  }
  const violationCount = Object.values(invariants).reduce((sum, value) => sum + value, 0);
  return { days: days.length, totals, invariants, violation_count: violationCount, samples };
}
