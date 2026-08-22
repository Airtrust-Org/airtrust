/**
 * FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 — equivalence test (Fase 6).
 *
 * Proves resultado_old === resultado_v1: running the current, ungoverned
 * calculation path (LIMITES_DEFAULT / LEGACY_FADIGA_BUSINESS_POLICY /
 * LEGACY_FORTNIGHT_POLICY, hardcoded in source) against the values actually
 * stored by migrations/seeds/frms_helicopter_offshore_baseline_v1.sql (read
 * from a real sqlite3 execution, not re-typed by hand) produces byte-for-byte
 * identical score, classification, alerts and factors, across the required
 * scenarios: normal duty, critical duty, night flight (WOCL), reduced sleep,
 * high KSS, and excess hours.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcFatorizacao, calcEffectiveness } from '../../lib/frms/calculos';
import { calcularScoreFadiga, calcularPenalidadeWOCL, resolveFadigaBusinessPolicy, LEGACY_FADIGA_BUSINESS_POLICY } from '../../lib/frms/fadiga-score';
import { buildFrmsFortnightIndicatorMap } from '../../lib/frms/fortnight-indicator';
import { processarAlertas } from '../../lib/frms/alertas';
import { LIMITES_DEFAULT, type FrmsJornada, type LimitesMap } from '../../lib/frms/types';

const testDir = dirname(fileURLToPath(import.meta.url));
const migration0464 = readFileSync(join(testDir, '../../../migrations/0464_frms_parameter_governance_recalc.sql'), 'utf8');
const seed = readFileSync(join(testDir, '../../../../scripts/frms-seeds/frms_helicopter_offshore_baseline_v1.sql'), 'utf8');
const tempDirs: string[] = [];
afterAll(() => tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function sqlite(path: string, sql: string) {
  return spawnSync('sqlite3', [path], { input: sql, encoding: 'utf8' });
}

/** Reads the real, applied HELICOPTER_OFFSHORE_BASELINE_V1 parameter rows — not a hand-typed copy. */
function loadGovernedLimites(): LimitesMap & Record<string, number> {
  const dir = mkdtempSync(join(tmpdir(), 'airtrust-offshore-equiv-'));
  tempDirs.push(dir);
  const path = join(dir, 'db.sqlite');
  // Populate frms_configuracao_limites with the real, current LIMITES_DEFAULT
  // set — mirroring what migration 0464's bootstrap SELECT actually copies
  // from in production (the legacy config table is never empty there).
  const limitesInserts = Object.entries(LIMITES_DEFAULT)
    .map(([nome, valor]) => `INSERT INTO frms_configuracao_limites VALUES ('${nome}', ${valor}, 'unit', 1, NULL);`)
    .join('\n');
  const setup = sqlite(path, `
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    CREATE TABLE frms_configuracao_limites (nome TEXT, valor_numerico REAL, unidade TEXT, ativo INTEGER, deleted_at TEXT);
    CREATE TABLE frms_fatorizacao_jornada (id TEXT, jornada_id TEXT, deleted_at TEXT, updated_at TEXT);
    CREATE TABLE frms_fadiga_checkin (id TEXT, empresa_id INTEGER, data_checkin TEXT, deleted_at TEXT);
    ${limitesInserts}
  `);
  if (setup.status !== 0) throw new Error(setup.stderr);
  if (sqlite(path, migration0464).status !== 0) throw new Error('0464 apply failed');
  if (sqlite(path, seed).status !== 0) throw new Error('seed apply failed');

  const rows = spawnSync(
    'sqlite3',
    ['-separator', '|', path, `SELECT parameter_key, numeric_value FROM frms_config_parameters WHERE revision_id = 'frms-helicopter-offshore-baseline-v1';`],
    { encoding: 'utf8' },
  );
  if (rows.status !== 0) throw new Error(rows.stderr);
  const values: Record<string, number> = {};
  for (const line of rows.stdout.trim().split('\n')) {
    const [key, value] = line.split('|');
    if (key) values[key] = Number(value);
  }
  return values as LimitesMap & Record<string, number>;
}

let governedLimites: LimitesMap & Record<string, number>;
beforeAll(() => {
  governedLimites = loadGovernedLimites();
});

function jornada(overrides: Partial<FrmsJornada>): FrmsJornada {
  return {
    id: 'j-1',
    tripulante_id: 1,
    empresa_id: 10,
    data: '2026-05-28',
    status: 'ES',
    hora_apresentacao: '09:00',
    hora_termino: '17:00',
    duracao_jornada_minutos: 480,
    horas_voo_minutos: 240,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    hora_dormiu: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 1,
    observacao: null,
    registrado_por: '1',
    origem: 'SIGVOOS',
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    ...overrides,
  } as FrmsJornada;
}

type Scenario = { name: string; jornada: Partial<FrmsJornada>; repousoAnteriorMin: number | null; diaDoCiclo: number | null };

const SCENARIOS: Scenario[] = [
  { name: 'jornada normal', jornada: {}, repousoAnteriorMin: 600, diaDoCiclo: 2 },
  {
    name: 'jornada crítica (duração longa + HV alta)',
    jornada: { duracao_jornada_minutos: 660, horas_voo_minutos: 360, hora_apresentacao: '05:00', hora_termino: '16:00' },
    repousoAnteriorMin: 420,
    diaDoCiclo: 14,
  },
  {
    name: 'voo noturno (WOCL)',
    jornada: { hora_apresentacao: '01:00', hora_primeira_decolagem: '02:00', hora_ultimo_pouso: '04:30', hora_termino: '05:00' },
    repousoAnteriorMin: 480,
    diaDoCiclo: 5,
  },
  { name: 'sono reduzido / repouso insuficiente', jornada: {}, repousoAnteriorMin: 300, diaDoCiclo: 3 },
  { name: 'excesso de horas (duração muito longa)', jornada: { duracao_jornada_minutos: 700, horas_voo_minutos: 400 }, repousoAnteriorMin: 500, diaDoCiclo: 1 },
];

describe('FRMS_HELICOPTER_OFFSHORE_BASELINE_V1 — resultado_old === resultado_v1', () => {
  it.each(SCENARIOS)('calcFatorizacao + calcEffectiveness: $name', (scenario) => {
    const j = jornada(scenario.jornada);

    const fatOld = calcFatorizacao({
      jornada: j,
      repousoAnteriorMin: scenario.repousoAnteriorMin,
      limites: LIMITES_DEFAULT,
      diasDoMes: 31,
      diaDoCiclo: scenario.diaDoCiclo,
    });
    const fatV1 = calcFatorizacao({
      jornada: j,
      repousoAnteriorMin: scenario.repousoAnteriorMin,
      limites: governedLimites,
      diasDoMes: 31,
      diaDoCiclo: scenario.diaDoCiclo,
    });
    expect(fatV1).toEqual(fatOld);

    const effInput = {
      hora_apresentacao: j.hora_apresentacao,
      hora_primeira_decolagem: j.hora_primeira_decolagem,
      hora_ultimo_pouso: j.hora_ultimo_pouso,
      hora_corte_motor: j.hora_corte_motor,
      hora_termino: j.hora_termino,
      hora_dormiu: j.hora_dormiu,
      dia_periodo_embarcado: scenario.diaDoCiclo,
      total_dias_periodo: 15,
    };
    const effOld = calcEffectiveness(fatOld, LIMITES_DEFAULT, effInput);
    const effV1 = calcEffectiveness(fatV1, governedLimites, effInput);
    expect(effV1).toEqual(effOld);
  });

  it.each([
    { name: 'KSS elevado', input: { kss_score: 8, horas_sono: 5, qualidade_sono: 2, sintomas_json: null, apto: 1, meds_ult_12h: 0, alcool_ult_12h: 0 } },
    { name: 'sono reduzido', input: { kss_score: 4, horas_sono: 3, qualidade_sono: 2, sintomas_json: null, apto: 1, meds_ult_12h: 0, alcool_ult_12h: 0 } },
    { name: 'jornada normal (fadiga check-in)', input: { kss_score: 2, horas_sono: 8, qualidade_sono: 5, sintomas_json: null, apto: 1, meds_ult_12h: 0, alcool_ult_12h: 0 } },
  ])('calcularScoreFadiga: $name', ({ input }) => {
    const config = { threshold_amarelo: 35, threshold_vermelho: 55, peso_kss: 0.4, peso_sono_duracao: 0.25, peso_sono_qualidade: 0.2, peso_sintomas: 0.15 };
    const policyOld = LEGACY_FADIGA_BUSINESS_POLICY;
    const policyV1 = resolveFadigaBusinessPolicy(governedLimites);
    expect(calcularScoreFadiga(input as never, config, policyV1)).toEqual(
      calcularScoreFadiga(input as never, config, policyOld),
    );
  });

  it('calcularPenalidadeWOCL: governed WOCL window/penalties match the legacy defaults', () => {
    const policyV1 = resolveFadigaBusinessPolicy(governedLimites);
    for (const minute of [0, 119, 120, 240, 359, 360, 720]) {
      expect(calcularPenalidadeWOCL(minute, policyV1)).toBe(calcularPenalidadeWOCL(minute));
    }
  });

  it('buildFrmsFortnightIndicatorMap: governed fortnight policy produces identical indicators', () => {
    const items = [
      {
        data_operacional: '2026-05-25', funcionario_id: 1, snapshot_status: 'OK' as const, checkin_status: 'RECEBIDO' as const,
        sleep_data_source: 'REAL' as const, wake_data_source: 'REAL' as const, jornada_data_source: 'REAL' as const,
        hora_apresentacao: '05:00', hora_termino: '13:00', duracao_jornada_minutos: 480, horas_voo_minutos: 240,
        teve_jornada: true, horas_sono: 5, kss_score: 8, effectiveness_pct: 62,
        dia_periodo_embarcado: 5, total_dias_periodo: 15,
      },
      {
        data_operacional: '2026-05-26', funcionario_id: 1, snapshot_status: 'OK' as const, checkin_status: 'RECEBIDO' as const,
        sleep_data_source: 'REAL' as const, wake_data_source: 'REAL' as const, jornada_data_source: 'REAL' as const,
        hora_apresentacao: '06:30', hora_termino: '14:00', duracao_jornada_minutos: 450, horas_voo_minutos: 200,
        teve_jornada: true, horas_sono: 7, kss_score: 4, effectiveness_pct: 88,
        dia_periodo_embarcado: 6, total_dias_periodo: 15,
      },
    ];
    const fortnightPolicyV1 = {
      consecutiveAttentionDays: governedLimites.FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION,
      consecutiveCriticalDays: governedLimites.FORTNIGHT_CONSECUTIVE_DAYS_CRITICAL,
      lowSleepHours: governedLimites.FORTNIGHT_LOW_SLEEP_HOURS,
      highKss: governedLimites.KSS_HIGH_THRESHOLD,
      lowEffectivenessPct: governedLimites.FORTNIGHT_LOW_EFFECTIVENESS_PCT,
      daysWithoutDuty: governedLimites.FORTNIGHT_DAYS_WITHOUT_DUTY,
      longRestMinutes: governedLimites.FORTNIGHT_LONG_REST_MINUTES,
      shortAverageDutyMinutes: governedLimites.FORTNIGHT_SHORT_AVG_DUTY_MINUTES,
      shortRestMinutes: governedLimites.FORTNIGHT_SHORT_REST_MINUTES,
      earlyPresentation0600Minutes: governedLimites.FORTNIGHT_EARLY_0600_MINUTES,
      earlyPresentation0700Minutes: governedLimites.FORTNIGHT_EARLY_0700_MINUTES,
      recurringEarlyPresentations: governedLimites.FORTNIGHT_RECURRING_EARLY_PRESENTATIONS,
      rollingDutyPct: governedLimites.FORTNIGHT_ROLLING_DUTY_PCT,
      scoreAttention: governedLimites.FORTNIGHT_SCORE_ATTENTION,
      scoreCritical: governedLimites.FORTNIGHT_SCORE_CRITICAL,
      scoreLimitWeight: governedLimites.FORTNIGHT_SCORE_LIMIT_WEIGHT,
      trendIncreasingImpact: governedLimites.FORTNIGHT_TREND_INCREASING_IMPACT,
      trendReducingImpact: governedLimites.FORTNIGHT_TREND_REDUCING_IMPACT,
      impactDaysWithoutDuty: governedLimites.FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY,
      impactLongRest: governedLimites.FORTNIGHT_IMPACT_LONG_REST,
      impactShortAverageDuty: governedLimites.FORTNIGHT_IMPACT_SHORT_AVG_DUTY,
      impactNoEarlyPresentation: governedLimites.FORTNIGHT_IMPACT_NO_EARLY_PRESENTATION,
      impactCompleteData: governedLimites.FORTNIGHT_IMPACT_COMPLETE_DATA,
      impactConsecutiveAttention: governedLimites.FORTNIGHT_IMPACT_CONSECUTIVE_ATTENTION,
      impactConsecutiveCritical: governedLimites.FORTNIGHT_IMPACT_CONSECUTIVE_CRITICAL,
      impactCheckinPending: governedLimites.FORTNIGHT_IMPACT_CHECKIN_PENDING,
      impactEstimatedData: governedLimites.FORTNIGHT_IMPACT_ESTIMATED_DATA,
      impactEarly0600: governedLimites.FORTNIGHT_IMPACT_EARLY_0600,
      impactRecurringEarly: governedLimites.FORTNIGHT_IMPACT_RECURRING_EARLY,
      impactShortRest: governedLimites.FORTNIGHT_IMPACT_SHORT_REST,
      impactLowSleep: governedLimites.FORTNIGHT_IMPACT_LOW_SLEEP,
      impactHighKss: governedLimites.FORTNIGHT_IMPACT_HIGH_KSS,
      impactLowEffectiveness: governedLimites.FORTNIGHT_IMPACT_LOW_EFFECTIVENESS,
      impactRollingDuty: governedLimites.FORTNIGHT_IMPACT_ROLLING_DUTY,
      impactDailyCritical: governedLimites.FORTNIGHT_IMPACT_DAILY_CRITICAL,
      impactDailyAttention: governedLimites.FORTNIGHT_IMPACT_DAILY_ATTENTION,
    };

    const resultDefault = buildFrmsFortnightIndicatorMap({ items, windowStart: '2026-05-12', windowEnd: '2026-05-26', today: '2026-05-26' });
    const resultV1 = buildFrmsFortnightIndicatorMap({ items, windowStart: '2026-05-12', windowEnd: '2026-05-26', today: '2026-05-26', policy: fortnightPolicyV1 });
    expect(resultV1).toEqual(resultDefault);
  });

  it('processarAlertas: governed limites produce identical alerts to LIMITES_DEFAULT', () => {
    const acumulo = {
      hv_7_dias_min: 2800, hv_28_dias_min: 5500, hv_365_dias_min: 55000, hv_mes_calendario_min: 5300,
      hv_dia_min: 400, pct_limite_7d: 103, pct_limite_28d: 98, pct_limite_mes_calendario: 96,
      pct_limite_365d: 91, pct_limite_dia: 83, repouso_anterior_min: 480, repouso_suficiente: 0,
    };
    const alertasOld = processarAlertas({
      tripulanteId: 1, tripulanteNome: 'Teste', jornadaId: 'j-1',
      jornada: { duracao_jornada_minutos: 700, horas_voo_minutos: 400, status: 'ES', tripulacao_aumentada: 0 },
      acumulo, limites: LIMITES_DEFAULT,
    });
    const alertasV1 = processarAlertas({
      tripulanteId: 1, tripulanteNome: 'Teste', jornadaId: 'j-1',
      jornada: { duracao_jornada_minutos: 700, horas_voo_minutos: 400, status: 'ES', tripulacao_aumentada: 0 },
      acumulo, limites: governedLimites,
    });
    expect(alertasV1).toEqual(alertasOld);
  });
});
