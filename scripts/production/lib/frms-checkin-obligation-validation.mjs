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

/**
 * Varredura de UMA passada, como o SQLite lê o texto: literais ('..', "..", `..`, [..]) e comentários
 * (-- e /* *\/) são reconhecidos na ordem em que aparecem, então um '--' dentro de um literal não abre
 * comentário. Devolve o SQL sem literais nem comentários; literal ou comentário sem fim é recusado.
 */
export function stripLiteralsAndComments(sql) {
  const text = String(sql);
  let out = '';
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end;
      out += ' ';
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) throw new Error('SQL_UNTERMINATED_COMMENT');
      i = end + 2;
      out += ' ';
    } else if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      let j = i + 1;
      for (;;) {
        if (j >= text.length) throw new Error('SQL_UNTERMINATED_LITERAL');
        if (text[j] === close) {
          if (close !== ']' && text[j + 1] === close) { j += 2; continue; }
          break;
        }
        j += 1;
      }
      i = j + 1;
      out += "''";
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

export function assertReadOnlyQuery(sql) {
  const text = String(sql ?? '');
  // Nenhuma consulta legítima deste validador usa ';'. Recusar o caractere em qualquer posição, mesmo
  // dentro de literal ou comentário, elimina encadeamento de instruções independentemente do analisador.
  if (text.includes(';')) throw new Error('MULTI_STATEMENT_FORBIDDEN');
  const body = stripLiteralsAndComments(text).trim();
  if (!/^(SELECT|WITH)\b/i.test(body)) throw new Error('ONLY_SELECT_PERMITTED');
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

/** Fontes de atividade que o oráculo carrega sozinho. CV é consultivo: a data de programação do voo pode
 * diferir da data da jornada (voo que cruza a meia-noite), então não reprova sozinha. */
export const HARD_ACTIVITY_SOURCES = Object.freeze(['evd', 'jornada', 'simulator', 'training', 'recovery']);
export const ADVISORY_ACTIVITY_SOURCES = Object.freeze(['cv']);

/**
 * Avalia um dia. `oracle` traz só fatos de origem: check-ins, atividade por fonte, alocações com
 * contexto e eventos manuais de ausência.
 */
export function evaluateDay({ empresaId, date, crew, allEmployees, obligations, oracle }) {
  const day = {
    date, crew: crew.size, status: {}, base: {}, divergences: {}, violations: [], advisories: [],
    received_oracle: 0, received_obligation: 0, gap_crew_days: 0, allocation_expected_pending: 0,
    absence_crew_days: {}, base_only: { crew_days: 0, cycle: {}, jornada_status: {}, allocation_context: {}, crew_ids: new Set() },
    legacy_pending_no_checkin: 0, legacy_not_pending_now: {},
  };
  const violate = (code, id) => day.violations.push({ code, date, crew_ref: crewRef(empresaId, id) });
  const advise = (code, id) => day.advisories.push({ code, date, crew_ref: crewRef(empresaId, id) });
  const active = (sources, id) => sources.some((name) => oracle.activity?.[name]?.has(id));

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
    const hardActivity = active(HARD_ACTIVITY_SOURCES, id);
    const cvActivity = active(ADVISORY_ACTIVITY_SOURCES, id);
    const own = oracle.allocations.filter((row) => row.funcionario_id === id);
    const covering = own.filter((row) => covers(row, date));
    const kinds = new Set(covering.map((row) => classify(row.situacao_tipo)));
    const manualAbsence = oracle.manualAbsence.some(
      (row) => row.funcionario_id === id && covers(row, date),
    );
    const obligated = ['PENDENTE', 'RECEBIDO'].includes(obligation.status);
    // Quinzena-base sem nenhuma escala publicada: dimensiona o que existe de evidência de escala por pessoa
    // (ciclo FRMS legado, jornada de qualquer origem e alocações próximas) para decidir se é dúvida real.
    if (obligation.base === 'QUINZENA_BASE_SEM_ESCALA') {
      const b = day.base_only;
      b.crew_days += 1;
      b.crew_ids.add(id);
      const cycles = (oracle.legacyCycle ?? []).filter((row) => row.funcionario_id === id
        && ['ATIVO', 'ENCERRADO'].includes(upper(row.status_ciclo)));
      const embark = cycles.some((row) => row.data_inicio_embarque <= date && date <= row.data_fim_embarque);
      const off = cycles.some((row) => row.data_inicio_folga && row.data_inicio_folga <= date && date <= row.data_fim_folga);
      bump(b.cycle, embark ? 'CICLO_EMBARQUE' : off ? 'CICLO_FOLGA' : cycles.length ? 'CICLO_FORA_DO_DIA' : 'SEM_CICLO');
      bump(b.jornada_status, oracle.jornadaStatus?.get(id) ?? 'SEM_LINHA');
      bump(b.allocation_context, own.length ? 'TEM_ALOCACAO_PROXIMA' : 'SEM_ALOCACAO_PROXIMA');
    }
    // Ausências programadas por tipo (alocação), para dimensionar folgas, férias e afastamentos reais.
    for (const kind of new Set(covering.filter((row) => classify(row.situacao_tipo) === 'ABSENCE')
      .map((row) => upper(row.situacao_tipo)))) bump(day.absence_crew_days, kind);
    if (manualAbsence) bump(day.absence_crew_days, 'EVENTO_MANUAL');

    if (hasCheckin) day.received_oracle += 1;
    if (obligation.status === 'RECEBIDO') day.received_obligation += 1;

    // Nenhuma atividade comprovada pode ser ignorada.
    if (hardActivity && !obligated) violate('ATIVIDADE_COMPROVADA_IGNORADA', id);
    else if (cvActivity && !obligated) advise('ATIVIDADE_CV_NAO_EXIGIDA', id);
    // Pendência por alocação exige alocação operacional e nenhuma ausência sobreposta.
    if (obligation.status === 'PENDENTE' && obligation.base === 'ALOCACAO_OPERACIONAL'
      && (!kinds.has('OPERATIONAL') || kinds.has('ABSENCE') || manualAbsence)) {
      violate('PENDENCIA_SEM_ALOCACAO_OPERACIONAL', id);
    }
    // Reciproca: alocação operacional inequívoca (sem ausência sobreposta) tem que gerar obrigação.
    if (kinds.has('OPERATIONAL') && !kinds.has('ABSENCE') && !manualAbsence) {
      day.allocation_expected_pending += 1;
      if (!obligated) violate('ALOCACAO_OPERACIONAL_SEM_PENDENCIA', id);
    }
    // Presunção nunca gera pendência.
    if (obligation.status === 'PENDENTE' && PRESUMPTION_BASES.includes(obligation.base)) {
      violate('PENDENCIA_POR_PRESUNCAO', id);
    }
    // Quinzena quebrada: lacuna entre alocações, sem nenhuma atividade, não pode ser pendente.
    const before = own.some((row) => row.data_fim < date);
    const after = own.some((row) => row.data_inicio > date);
    if (before && after && covering.length === 0 && !manualAbsence && !hardActivity && !cvActivity) {
      day.gap_crew_days += 1;
      if (obligation.status === 'PENDENTE') violate('LACUNA_QUINZENA_QUEBRADA_PENDENTE', id);
    }
    // Regra antiga: presença na quinzena-base, EVD ou atividade sem check-in = pendente.
    const legacyPending = !hasCheckin && (oracle.legacyRoster.has(id) || hardActivity || cvActivity);
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
    allocation_expected_pending: 0, absence_crew_days: {}, legacy_pending_no_checkin: 0, legacy_not_pending_now: {} };
  const invariants = {};
  const advisories = {};
  const samples = [];
  const baseOnly = { crew_days: 0, distinct_crew: 0, cycle: {}, jornada_status: {}, allocation_context: {} };
  const baseOnlyIds = new Set();
  for (const day of days) {
    totals.crew_days += day.crew;
    totals.gap_crew_days += day.gap_crew_days;
    totals.allocation_expected_pending += day.allocation_expected_pending;
    totals.legacy_pending_no_checkin += day.legacy_pending_no_checkin;
    for (const key of ['status', 'base', 'divergences', 'absence_crew_days', 'legacy_not_pending_now']) {
      for (const [name, count] of Object.entries(day[key])) bump(totals[key], name, count);
    }
    for (const violation of day.violations) {
      bump(invariants, violation.code);
      if (samples.length < sampleLimit) samples.push(violation);
    }
    for (const advisory of day.advisories) bump(advisories, advisory.code);
    baseOnly.crew_days += day.base_only.crew_days;
    for (const id of day.base_only.crew_ids) baseOnlyIds.add(id);
    for (const key of ['cycle', 'jornada_status', 'allocation_context']) {
      for (const [name, count] of Object.entries(day.base_only[key])) bump(baseOnly[key], name, count);
    }
  }
  const violationCount = Object.values(invariants).reduce((sum, value) => sum + value, 0);
  const advisoryCount = Object.values(advisories).reduce((sum, value) => sum + value, 0);
  baseOnly.distinct_crew = baseOnlyIds.size;
  return { days: days.length, totals, invariants, violation_count: violationCount, advisories, advisory_count: advisoryCount, base_only: baseOnly, samples };
}
