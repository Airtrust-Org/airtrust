/**
 * BOA/CBMMG — synthetic-only demonstration fixture, isolated from any remote D1.
 * source_reference: docs/frms/BOA_CBMMG_LICITACAO_POC_MATRIX_20261020.md
 * operational_decision: Generate invented profiles, operational scenarios and
 * append-only BOA event templates for a future explicitly approved QA tenant.
 * dry_run_required: This module performs no network/database operations.
 * rollback_plan_required: No remote resource is created; remove generated files.
 */
import { writeFileSync } from 'node:fs';

const MISSION_TYPES = [
  'RESGATE', 'SALVAMENTO', 'TRANSPORTE_AEROMEDICO',
  'COMBATE_AEREO_INCENDIO', 'TREINAMENTO', 'OUTRA',
];
const AVIATION_ROLES = [
  'PILOTO DE HELICOPTERO', 'COPILOTO', 'OPERADOR AEROTATICO',
  'TRIPULANTE DE RESGATE AEREO', 'OPERADOR DE GUINCHO', 'MEDICO DE BORDO',
];
const BASES = ['BASE-FICTICIA-ALFA', 'BASE-FICTICIA-BRAVO', 'BASE-FICTICIA-CHARLIE', 'BASE-FICTICIA-DELTA'];
const TYPES = Object.freeze({
  receipt: 'BOA_CHECKIN_V1',
  opened: 'BOA_CASE_OPENED_V1',
  treatment: 'BOA_CASE_TREATMENT_V1',
  closed: 'BOA_CASE_CLOSED_V1',
});

const num = n => String(n).padStart(3, '0');
function precedingMonth(value) {
  const [year, month] = value.split('-').map(Number);
  return month === 1 ? (year - 1) + '-12' : year + '-' + String(month - 1).padStart(2, '0');
}
function nextDay(isoDate, days) {
  const next = new Date(isoDate + 'T12:00:00.000Z');
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
function stamp(date, hour) { return date + 'T' + String(hour).padStart(2, '0') + ':00:00.000Z'; }
function requiredMap(mapping, refs, kind) {
  if (!mapping || typeof mapping !== 'object') throw new Error('BOA_DEMO_' + kind + '_MAP_REQUIRED');
  const ids = refs.map(ref => mapping[ref]);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) throw new Error('BOA_DEMO_' + kind + '_MAP_INVALID');
  return ids;
}

/** Fixed clock and invented identities: never use actual CBMMG names, registration or duty data. */
export function buildBoaDemoDataset({ month = '2026-10' } = {}) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('BOA_DEMO_MONTH_INVALID');
  const previous = precedingMonth(month);
  const crew = Array.from({ length: 130 }, (_, i) => {
    const number = i + 1;
    const ref = 'BOA-DEMO-TRIP-' + num(number);
    return {
      ref,
      nome: 'TRIPULANTE TOTALMENTE FICTICIO ' + num(number),
      guerra: 'DEMO-' + num(number),
      cargo: 'BOMBEIRO MILITAR',
      funcao: AVIATION_ROLES[i % AVIATION_ROLES.length],
      setor_ref: BASES[i % BASES.length],
      user_ref: 'BOA-DEMO-USR-' + num(number),
      active: true,
      profile_expected: 'flight',
    };
  });
  const managers = BASES.map((base, index) => ({
    ref: 'BOA-DEMO-GEST-' + num(index + 1),
    setor_ref: base, role: 'manager', grant_role: 'manager',
  }));
  const admin = { ref: 'BOA-DEMO-ADM-001', role: 'admin' };
  const events = [];
  const missions = [];
  const periods = [
    { month: previous, count: 100, extra: 0 },
    { month, count: 120, extra: 60 },
  ];
  const expected = {};
  for (const period of periods) {
    const counters = { participants: period.count, receipts: 0, ABERTO: 0, EM_TRATAMENTO: 0, RESOLVIDO: 0 };
    for (let i = 0; i < period.count + period.extra; i++) {
      const person = crew[i % period.count];
      const day = i < period.count ? 6 + (i % 6) : 12 + (i % 4);
      const date = period.month + '-' + String(day).padStart(2, '0');
      const suffix = period.month.replace('-', '') + '-' + num(i + 1);
      const receiptRef = 'BOA-DEMO-' + suffix + '-REC';
      const caseRef = 'BOA-DEMO-' + suffix + '-CAS';
      const state = ['ABERTO', 'EM_TRATAMENTO', 'RESOLVIDO'][i % 3];
      const missionType = MISSION_TYPES[i % MISSION_TYPES.length];
      const night = i % 4 === 1 || i % 4 === 2;
      const incomplete = i % 13 === 0;
      const selfDeclaredUnfit = i % 17 === 0;
      const report = {
        mission_type: missionType,
        duty_period: night ? 'NOTURNO' : 'DIURNO',
        standby_activation: i % 4 === 1,
        critical_mission: i % 5 === 0,
        sleep_hours_24h: incomplete ? null : [8, 6, 4.5, 7][i % 4],
        sleep_fragmented: incomplete ? null : night,
        kss_reported: incomplete ? null : [2, 5, 7, 4][i % 4],
        pvt_60s_completed: incomplete ? null : i % 7 !== 0,
        self_declared_unfit: selfDeclaredUnfit,
        acknowledge_confidentiality: true,
      };
      const at = stamp(date, 8);
      missions.push({
        ref: 'MISSAO-FICTICIA-' + suffix,
        crew_ref: person.ref, setor_ref: person.setor_ref,
        reference_date: date, mission_type: missionType,
        context: night ? 'ACONTECIMENTO FICTICIO EM PERIODO NOTURNO' : 'ATIVIDADE AERONAUTICA FICTICIA DIURNA',
        roster_source: 'SYNTHETIC_SCENARIO_ONLY',
        real_duty_hours: null,
      });
      events.push({
        ref: receiptRef, parent_ref: receiptRef, tipo: TYPES.receipt,
        crew_ref: person.ref, actor_ref: person.user_ref, created_at: at,
        payload_template: {
          schema: TYPES.receipt, reference_date: date, submitted_at: at,
          profile_code: 'FIREFIGHTER_AVIATION',
          ...report, evidence_state: 'CREW_SELF_REPORT_NOT_VERIFIED',
          dispatch_permission: 'NOT_GRANTED',
        },
      });
      events.push({
        ref: caseRef, parent_ref: receiptRef, tipo: TYPES.opened,
        crew_ref: person.ref, actor_ref: person.user_ref, created_at: stamp(date, 9),
        payload_template: {
          schema: TYPES.opened,
          reason: selfDeclaredUnfit ? 'CREW_REPORTED_UNFIT' : 'BOA_METHOD_REVIEW_PENDING',
          review_required: true, dispatch_permission: 'NOT_GRANTED',
        },
      });
      const manager = managers[BASES.indexOf(person.setor_ref)];
      if (state !== 'ABERTO') {
        const treatmentDate = nextDay(date, 1);
        events.push({
          ref: 'BOA-DEMO-' + suffix + '-TRT', parent_ref: caseRef,
          tipo: TYPES.treatment, crew_ref: person.ref, actor_ref: manager.ref,
          created_at: stamp(treatmentDate, 10),
          payload_template: {
            schema: 'FRMS_CASE_TREATMENT_V1',
            responsavel: 'COORDENACAO FICTICIA ' + manager.setor_ref,
            prazo: nextDay(date, 7),
            acao_mitigacao: 'Revisar escala e oportunidade de repouso no cenario ficticio.',
            justificativa: 'Registro ilustrativo de revisao humana sem criterio cientifico homologado.',
            evidencia_referencia: 'DEMO-SEM-DOCUMENTO-REAL',
          },
        });
      }
      if (state === 'RESOLVIDO') {
        events.push({
          ref: 'BOA-DEMO-' + suffix + '-CLS', parent_ref: caseRef,
          tipo: TYPES.closed, crew_ref: person.ref, actor_ref: manager.ref,
          created_at: stamp(nextDay(date, 2), 11),
          payload_template: {
            schema: 'FRMS_CASE_RESOLUTION_V1',
            avaliacao_eficacia: 'Eficacia somente declarada para demonstracao ficticia; revisao independente pendente.',
          },
        });
      }
      counters.receipts++;
      counters[state]++;
    }
    expected[period.month] = counters;
  }
  return {
    metadata: {
      fixture_id: 'BOA_DEMO_SYNTHETIC_20261021_V1',
      environment: 'OFFLINE_FIXTURE_ONLY',
      classification: '100_PERCENT_SYNTHETIC_NOT_REAL',
      source: 'AIRTRUST_LOCAL_GENERATOR',
      requires_approved_boa_tenant: true,
      requires_approved_scientific_policy: true,
      tenant_id: null,
      signed: false,
      official_report: false,
      dispatch_permission: 'NOT_GRANTED',
      no_network_or_database_write: true,
      months: [previous, month],
    },
    sectors: BASES.map(ref => ({ ref, description: 'BASE AERONAUTICA FICTICIA' })),
    crew, managers, admin, missions, events, expected,
  };
}

/**
 * Procurement sizing is UP TO 130 ACTIVE USERS TOTAL (crew + managers + admin),
 * not 130 crew plus supervisory accounts. Keep the full 130-crew fixture as a
 * separate capacity stress artifact; the tender-sized cohort is read-only data.
 * It includes every crew member associated with one of the 839 example events.
 */
export function buildBoaTender130IdentityPlan(dataset) {
  if (dataset?.metadata?.fixture_id !== 'BOA_DEMO_SYNTHETIC_20261021_V1'
    || !Array.isArray(dataset.crew) || dataset.crew.length !== 130
    || !Array.isArray(dataset.managers) || dataset.managers.length !== 4
    || !dataset.admin || !Array.isArray(dataset.events)) {
    throw new Error('BOA_TENDER_PLAN_FIXTURE_INVALID');
  }
  const crew = dataset.crew.slice(0, 125);
  const participantRefs = new Set(crew.map(person => person.ref));
  const actorRefs = new Set([
    ...crew.map(person => person.user_ref),
    ...dataset.managers.map(manager => manager.ref),
    dataset.admin.ref,
  ]);
  if (dataset.events.some(event => !participantRefs.has(event.crew_ref)
      || !actorRefs.has(event.actor_ref))) {
    throw new Error('BOA_TENDER_PLAN_EVENT_ACTOR_NOT_COVERED');
  }
  const accounts = [
    ...crew.map(person => ({
      ref: person.user_ref, role: 'tripulante', employee_ref: person.ref,
      sector_ref: person.setor_ref, credentials_provisioned: false,
    })),
    ...dataset.managers.map(manager => ({
      ref: manager.ref, role: 'gestor', sector_ref: manager.setor_ref,
      credentials_provisioned: false,
    })),
    { ref: dataset.admin.ref, role: 'administrador', credentials_provisioned: false },
  ];
  if (accounts.length !== 130 || new Set(accounts.map(a => a.ref)).size !== 130)
    throw new Error('BOA_TENDER_PLAN_130_ACCOUNTS_REQUIRED');
  return {
    purpose: 'PROCUREMENT_INITIAL_CAPACITY_UP_TO_130_USERS',
    count: accounts.length, crew_count: crew.length,
    manager_count: dataset.managers.length, admin_count: 1,
    official_provisioned_users: 0, authentication_ready: false,
    accounts, // identity ALIASES ONLY; never passwords, tokens or D1 IDs
  };
}

/**
 * Materialize templates only after an external, governed process has resolved
 * *all* employee/user aliases to existing synthetic IDs in one authorized BOA
 * tenant. The function returns rows in memory: NEVER INSERTs them.
 */
export function bindBoaDemoEventRows(dataset, { tenantId, employeeIds, userIds, policyRevision }) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0 || tenantId === 6)
    throw new Error('BOA_DEMO_ISOLATED_TENANT_REQUIRED');
  if (dataset?.metadata?.fixture_id !== 'BOA_DEMO_SYNTHETIC_20261021_V1'
    || dataset.metadata.classification !== '100_PERCENT_SYNTHETIC_NOT_REAL')
    throw new Error('BOA_DEMO_FIXTURE_NOT_TRUSTED');
  if (!policyRevision || typeof policyRevision.revision_id !== 'string'
    || !policyRevision.revision_id.trim() || typeof policyRevision.policy_version !== 'string'
    || !policyRevision.policy_version.trim() || policyRevision.approved !== true
    || policyRevision.profile_code !== 'FIREFIGHTER_AVIATION')
    throw new Error('BOA_DEMO_POLICY_APPROVAL_REQUIRED');
  const crewRefs = dataset.crew.map(person => person.ref);
  const actorRefs = [
    ...dataset.crew.map(person => person.user_ref),
    ...dataset.managers.map(person => person.ref),
    dataset.admin.ref,
  ];
  requiredMap(employeeIds, crewRefs, 'EMPLOYEE');
  requiredMap(userIds, actorRefs, 'USER');
  const events = dataset.events;
  if (!Array.isArray(events) || !events.length
    || new Set(events.map(event => event.ref)).size !== events.length)
    throw new Error('BOA_DEMO_EVENTS_INVALID');
  const refs = new Set(events.map(event => event.ref));
  const rows = events.map(event => {
    if (!refs.has(event.parent_ref) || !crewRefs.includes(event.crew_ref)
      || !actorRefs.includes(event.actor_ref)
      || !Object.values(TYPES).includes(event.tipo)
      || typeof event.created_at !== 'string') throw new Error('BOA_DEMO_EVENT_LINK_INVALID');
    const payload = { ...event.payload_template };
    if (event.tipo === TYPES.receipt || event.tipo === TYPES.opened) {
      payload.funcionario_id = employeeIds[event.crew_ref];
      if (event.tipo === TYPES.receipt) {
        payload.submitted_by = userIds[event.actor_ref];
        payload.revision_id = policyRevision.revision_id;
        payload.policy_version = policyRevision.policy_version;
      } else {
        payload.opened_by = userIds[event.actor_ref];
        payload.revision_id = policyRevision.revision_id;
      }
    } else if (event.tipo === TYPES.treatment) {
      payload.registrado_por = String(userIds[event.actor_ref]);
      payload.registrado_em = event.created_at;
    } else {
      payload.fechado_por = String(userIds[event.actor_ref]);
      payload.fechado_em = event.created_at;
    }
    return {
      id: event.ref, empresa_id: tenantId, checkin_id: event.parent_ref,
      tipo: event.tipo, payload_json: JSON.stringify(payload), created_at: event.created_at,
    };
  });
  return rows;
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' || !args[1] || args[1].startsWith('-')) {
    console.error('Usage: node scripts/fixtures/boa/boa-demo-dataset.mjs --out /tmp/boa-demo-fixture.json');
    process.exitCode = 2;
  } else {
    const dataset = buildBoaDemoDataset();
    writeFileSync(args[1], JSON.stringify(dataset, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('Created synthetic-only fixture: ' + dataset.crew.length
      + ' fictional crew, ' + dataset.events.length + ' event templates, 0 remote writes.');
  }
}
