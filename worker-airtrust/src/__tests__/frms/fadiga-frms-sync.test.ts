import { describe, expect, it } from 'vitest';
import { sincronizarCheckinComFrms } from '../../lib/frms/fadiga-frms-sync';
import { calcEffectiveness, hhmmToMinutes, minutesToHhmm } from '../../lib/frms/calculos';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

const DEFAULT_FATORIZACAO = {
  id: 'fator-1',
  fator_basica_pct: 0,
  fator_apresentacao_pct: 0,
  fator_duracao_pct: 0,
  fator_repouso_pct: 0,
  fator_noturno_dep_pct: 0,
  fator_noturno_arr_pct: 0,
  fator_ciclo_embarcado_pct: 0,
  fator_base_away_pct: 0,
  fator_aclimatacao_pct: 0,
  total_fatorizado_jornada: 0,
  fator_hv_basica_pct: 0,
  fator_hv_quantidade_pct: 0,
  fator_hv_noturno_dep_pct: 0,
  fator_hv_noturno_arr_pct: 0,
  total_fatorizado_hv: 0,
  effectiveness_pct: 90,
  dia_periodo_embarcado: null,
  total_dias_periodo: null,
};

type MockOpts = {
  minutosAntesApresentacao?: number;
  horaApresentacao?: string | null;
  noJornada?: boolean;
  noFatorizacao?: boolean;
  fatorizacao?: Partial<typeof DEFAULT_FATORIZACAO>;
};

function createDb(opts: MockOpts = {}) {
  const fatorizacaoUpdateArgs: unknown[][] = [];
  const jornadaUpdateArgs: unknown[][] = [];
  const eventInserts: Array<{ tipo: string; payloadStr: string }> = [];

  const minutosAntes = opts.minutosAntesApresentacao ?? 90;
  const horaApresentacao = opts.horaApresentacao !== undefined ? opts.horaApresentacao : '09:00';
  const fat = { ...DEFAULT_FATORIZACAO, ...opts.fatorizacao };

  const db = {
    prepare: (query: string) => ({
      all: async () => {
        if (query.includes('FROM frms_configuracao_limites')) {
          return {
            results: [
              { nome: 'MINUTOS_ANTES_APRESENTACAO', valor_numerico: minutosAntes },
              { nome: 'HORAS_SONO_PADRAO', valor_numerico: 8 },
            ],
          };
        }
        return { results: [] };
      },
      bind: (...bindArgs: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM frms_jornada')) {
            if (opts.noJornada) return null;
            return {
              id: 'jornada-1',
              hora_apresentacao: horaApresentacao,
              hora_primeira_decolagem: null,
              hora_ultimo_pouso: null,
              hora_corte_motor: null,
              hora_termino: null,
            };
          }
          if (query.includes('FROM frms_fatorizacao_jornada')) {
            if (opts.noFatorizacao) return null;
            return fat;
          }
          if (query.includes('FROM frms_fadiga_evento')) {
            return null; // no existing event → always INSERT path
          }
          return null;
        },
        run: async () => {
          if (query.includes('UPDATE frms_fatorizacao_jornada')) {
            fatorizacaoUpdateArgs.push(bindArgs);
          } else if (query.includes('UPDATE frms_jornada') && !query.includes('fadiga_evento')) {
            jornadaUpdateArgs.push(bindArgs);
          } else if (query.includes('INSERT INTO frms_fadiga_evento')) {
            // tipo is hardcoded as a string literal in the SQL VALUES clause
            const TIPOS = [
              'CHECKIN_SEM_JORNADA',
              'FRMS_SYNC_SEM_FATORIZACAO',
              'FRMS_RECALCULO_NECESSARIO',
              'FRMS_SYNC',
            ] as const;
            const tipo = TIPOS.find((t) => query.includes(`'${t}'`)) ?? 'UNKNOWN';
            // bindArgs: [uuid, empresaId, checkinId, payloadJson]
            eventInserts.push({ tipo, payloadStr: bindArgs[3] as string });
          }
          return { success: true };
        },
      }),
    }),
  } as unknown as D1Database;

  return { db, fatorizacaoUpdateArgs, jornadaUpdateArgs, eventInserts };
}

// Posições do bind em UPDATE frms_fatorizacao_jornada:
// 0: duracao_sono_efetiva_min
// 1: hora_despertar_estimada
// 2: hora_inicio_sono_estimado
// 3: fator_repouso_pct
// 4: effectiveness_pct
// 5: effectiveness_nivel
// 6: effectiveness_componentes_json
// 7: id (WHERE)

// Posições do bind em UPDATE frms_jornada:
// 0: hora_acordou
// 1: sono_efetivo_min
// 2: fonte_sono
// 3: acordou_na_wocl
// 4: id (WHERE)

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('sincronizarCheckinComFrms — C2 patch', () => {
  it('1. sem jornada: retorna sincronizado=false e registra CHECKIN_SEM_JORNADA', async () => {
    const { db, eventInserts } = createDb({ noJornada: true });

    const result = await sincronizarCheckinComFrms(db, 'ck-1', 1, '2026-05-28', 7, 10);

    expect(result.sincronizado).toBe(false);
    expect(result.jornada_id).toBeUndefined();
    expect(eventInserts.some((e) => e.tipo === 'CHECKIN_SEM_JORNADA')).toBe(true);
  });

  it('2. sem fatorizacao: retorna sincronizado=false e registra FRMS_SYNC_SEM_FATORIZACAO', async () => {
    const { db, eventInserts } = createDb({ noFatorizacao: true });

    const result = await sincronizarCheckinComFrms(db, 'ck-2', 1, '2026-05-28', 7, 10);

    expect(result.sincronizado).toBe(false);
    expect(result.jornada_id).toBe('jornada-1');
    expect(eventInserts.some((e) => e.tipo === 'FRMS_SYNC_SEM_FATORIZACAO')).toBe(true);
  });

  it('3. paridade com calcEffectiveness: effectiveness_pct dentro de ±0.1 pp', async () => {
    const fat = {
      total_fatorizado_jornada: -0.05,
      fator_basica_pct: 0.7,
      fator_apresentacao_pct: 0,
      fator_duracao_pct: -0.1,
      fator_repouso_pct: -0.1,
      fator_noturno_dep_pct: 0,
      fator_noturno_arr_pct: 0,
      fator_ciclo_embarcado_pct: 0,
      fator_base_away_pct: 0,
      fator_aclimatacao_pct: 0,
      fator_hv_basica_pct: 0,
      fator_hv_quantidade_pct: 0,
      fator_hv_noturno_dep_pct: 0,
      fator_hv_noturno_arr_pct: 0,
      total_fatorizado_hv: 0,
      effectiveness_pct: 85,
      dia_periodo_embarcado: null,
      total_dias_periodo: null,
    };

    const { db, fatorizacaoUpdateArgs } = createDb({
      horaApresentacao: '09:00',
      fatorizacao: fat,
    });

    const horasSono = 6;
    await sincronizarCheckinComFrms(db, 'ck-3', 1, '2026-05-28', horasSono, 10);

    // Reproduce the same calculation that fadiga-frms-sync uses internally
    const duracaoSonoMin = Math.round(horasSono * 60);
    const apresentacaoMin = hhmmToMinutes('09:00');
    const standardWakeMin = apresentacaoMin - 90; // minutosAntesApresentacao = 90 (default)
    const hora_dormiu = minutesToHhmm(standardWakeMin - duracaoSonoMin);

    const limites = { ...LIMITES_DEFAULT };
    const expected = calcEffectiveness(fat as never, limites, {
      hora_apresentacao: '09:00',
      hora_dormiu,
      dia_periodo_embarcado: null,
      total_dias_periodo: null,
    });

    const actual = fatorizacaoUpdateArgs[0]?.[4] as number;
    expect(typeof actual).toBe('number');
    expect(Math.abs(actual - expected.effectiveness_pct)).toBeLessThanOrEqual(0.1);
  });

  it('4. WOCL: apresentacao 05:00, sono 5h → acordou_na_wocl=true', async () => {
    const { db, jornadaUpdateArgs } = createDb({ horaApresentacao: '05:00' });

    await sincronizarCheckinComFrms(db, 'ck-4', 1, '2026-05-28', 5, 10);

    // standardWake = 05:00 - 90min = 03:30 → 210 min → WOCL (120–359)
    const acordouNaWocl = jornadaUpdateArgs[0]?.[3];
    expect(acordouNaWocl).toBe(1);
  });

  it('5. MINUTOS_ANTES_APRESENTACAO default 90: apresentacao 09:00 → wake 07:30', async () => {
    const { db, fatorizacaoUpdateArgs } = createDb({
      horaApresentacao: '09:00',
      minutosAntesApresentacao: 90,
    });

    await sincronizarCheckinComFrms(db, 'ck-5', 1, '2026-05-28', 6, 10);

    // hora_despertar_estimada from calcEffectiveness = hora_apresentacao - minutosAntes = 07:30
    const horaDespertar = fatorizacaoUpdateArgs[0]?.[1];
    expect(horaDespertar).toBe('07:30');
  });

  it('6. MINUTOS_ANTES_APRESENTACAO custom 75: apresentacao 09:00 → wake 07:45', async () => {
    const { db, fatorizacaoUpdateArgs } = createDb({
      horaApresentacao: '09:00',
      minutosAntesApresentacao: 75,
    });

    await sincronizarCheckinComFrms(db, 'ck-6', 1, '2026-05-28', 6, 10);

    const horaDespertar = fatorizacaoUpdateArgs[0]?.[1];
    expect(horaDespertar).toBe('07:45');
  });

  it('7. hora_apresentacao=null: não altera effectiveness_pct, registra FRMS_RECALCULO_NECESSARIO', async () => {
    const { db, fatorizacaoUpdateArgs, eventInserts } = createDb({ horaApresentacao: null });

    const result = await sincronizarCheckinComFrms(db, 'ck-7', 1, '2026-05-28', 6, 10);

    expect(result.sincronizado).toBe(false);
    expect(fatorizacaoUpdateArgs).toHaveLength(0);
    expect(eventInserts.some((e) => e.tipo === 'FRMS_RECALCULO_NECESSARIO')).toBe(true);
  });

  it('8. atualiza frms_jornada com hora_acordou, sono_efetivo_min, fonte_sono, acordou_na_wocl', async () => {
    const { db, jornadaUpdateArgs } = createDb({ horaApresentacao: '09:00' });

    await sincronizarCheckinComFrms(db, 'ck-8', 1, '2026-05-28', 6, 10);

    expect(jornadaUpdateArgs).toHaveLength(1);
    const [horaAcordou, sonoEfetivoMin, fonteSono, acordouNaWocl, jornadaId] =
      jornadaUpdateArgs[0] as [string, number, string, number, string];

    expect(typeof horaAcordou).toBe('string');
    expect(sonoEfetivoMin).toBe(360); // 6h * 60
    expect(fonteSono).toBe('INFORMADO'); // hora_dormiu sempre fornecida
    expect(typeof acordouNaWocl).toBe('number'); // 0 or 1
    expect(jornadaId).toBe('jornada-1');
  });

  it('8b. hora_acordou usa wakeTimeReal quando fornecida', async () => {
    const { db, jornadaUpdateArgs } = createDb({ horaApresentacao: '09:00' });

    await sincronizarCheckinComFrms(db, 'ck-8b', 1, '2026-05-28', 6, 10, '06:55');

    const horaAcordou = jornadaUpdateArgs[0]?.[0];
    expect(horaAcordou).toBe('06:55');
  });

  it('9. evento FRMS_SYNC: payload de auditoria sem apto_para_voo, INAPTO ou bloqueio', async () => {
    const { db, eventInserts } = createDb({ horaApresentacao: '09:00' });

    const result = await sincronizarCheckinComFrms(db, 'ck-9', 1, '2026-05-28', 7, 10);

    expect(result.sincronizado).toBe(true);

    const syncEvent = eventInserts.find((e) => e.tipo === 'FRMS_SYNC');
    expect(syncEvent).toBeDefined();

    const payload = syncEvent!.payloadStr;
    expect(payload).toContain('jornada_id');
    expect(payload).toContain('effectiveness_anterior');
    expect(payload).toContain('effectiveness_nova');
    expect(payload).toContain('duracao_sono_min');
    expect(payload).toContain('componentes');

    expect(payload).not.toContain('apto_para_voo');
    expect(payload).not.toContain('INAPTO');
    expect(payload).not.toContain('NAO_APTO');
    expect(payload).not.toContain('bloqueio');
  });

  it('10. garantia contra aritmética incremental: effectivenessNova nunca é efectuada', async () => {
    // Test that two calls with different fatorizacao.effectiveness_pct produce
    // different results that track calcEffectiveness, not the incremental formula.

    const fatBase = {
      total_fatorizado_jornada: 0,
      fator_basica_pct: 0,
      fator_apresentacao_pct: 0,
      fator_duracao_pct: 0,
      fator_repouso_pct: 0,
      fator_noturno_dep_pct: 0,
      fator_noturno_arr_pct: 0,
      fator_ciclo_embarcado_pct: 0,
      fator_base_away_pct: 0,
      fator_aclimatacao_pct: 0,
      fator_hv_basica_pct: 0,
      fator_hv_quantidade_pct: 0,
      fator_hv_noturno_dep_pct: 0,
      fator_hv_noturno_arr_pct: 0,
      total_fatorizado_hv: 0,
      dia_periodo_embarcado: null,
      total_dias_periodo: null,
    };

    const { db: db50, fatorizacaoUpdateArgs: args50 } = createDb({
      horaApresentacao: '09:00',
      fatorizacao: { ...fatBase, effectiveness_pct: 50 },
    });
    const { db: db95, fatorizacaoUpdateArgs: args95 } = createDb({
      horaApresentacao: '09:00',
      fatorizacao: { ...fatBase, effectiveness_pct: 95 },
    });

    await sincronizarCheckinComFrms(db50, 'ck-10a', 1, '2026-05-28', 7, 10);
    await sincronizarCheckinComFrms(db95, 'ck-10b', 1, '2026-05-28', 7, 10);

    const eff50 = args50[0]?.[4] as number;
    const eff95 = args95[0]?.[4] as number;

    // Both calls use the same fatorizacao factors and same sleep hours.
    // calcEffectiveness is deterministic on factors + sleep, independent of prior effectiveness_pct.
    // The incremental formula would have given different results (eff50 ≠ eff95 by design).
    // The correct formula gives identical results regardless of prior effectiveness_pct stored.
    expect(Math.abs(eff50 - eff95)).toBeLessThan(0.5);
  });
});
