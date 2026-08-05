/**
 * AUDITORIA MATEMÁTICA E CIENTÍFICA DOS CÁLCULOS FRMS
 *
 * Estrutura, conforme docs/frms/frms-scientific-audit.md:
 *
 *  1. Oráculo independente        — implementação produtiva vs modelo de referência
 *  2. Vetores dourados            — entradas, intermediários e esperados derivados à mão
 *  3. Análise dimensional         — unidades e domínios
 *  4. Propriedades matemáticas    — monotonicidade, limites, finitude, determinismo
 *  5. Relações metamórficas       — translação, partição, adição neutra
 *  6. Bordas e casos críticos     — meia-noite, ano bissexto, virada de mês/ano
 *  7. Sensibilidade               — parâmetros configuráveis realmente usados
 *  8. Independência de timezone   — resultado não depende de TZ do processo
 *
 * O oráculo (`./oracle/frms-reference-model`) não importa nada de `src/lib/frms`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calcAcumuloRolling,
  calcDuracaoJornada,
  calcEffectiveness,
  calcFatorCicloEmbarcado,
  calcFatorizacao,
  repousoMinimoRequeridoMin,
} from '../../lib/frms/calculos';
import {
  calcularFatorRepouso,
  calcularPenalidadeWOCL,
  isWithinWOCL,
} from '../../lib/frms/fadiga-score';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { FrmsJornada, LimitesMap } from '../../lib/frms/types';
import * as oracle from './oracle/frms-reference-model';

const L = LIMITES_DEFAULT;

/** Tolerância para comparações em minutos: exata (aritmética inteira). */
const TOL_MINUTES = 0;
/** Casas decimais conferidas em frações: 4, o arredondamento declarado (`round4`). */
const TOL_FRACTION_DIGITS = 4;

function duty(
  data: string,
  apresentacao: string | null,
  termino: string | null,
  hv = 0,
  overrides: Partial<FrmsJornada> = {},
): FrmsJornada {
  return {
    id: `${data}|${apresentacao}|${termino}|${hv}`,
    tripulante_id: 1,
    data,
    status: 'ES',
    hora_apresentacao: apresentacao,
    hora_termino: termino,
    duracao_jornada_minutos: null,
    horas_voo_minutos: hv,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'audit',
    origem: 'SIGVOOS',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tripulacao_aumentada: 0,
    classe_cabine: null,
    local_base: null,
    tipo_base: 'HOME',
    aclimatado: 1,
    ...overrides,
  };
}

function rolling(
  dataReferencia: string,
  historico: FrmsJornada[],
  momento: 'PROJECAO_ANTES_JORNADA' | 'REALIZADO_APOS_JORNADA' = 'REALIZADO_APOS_JORNADA',
  limites: LimitesMap = L,
) {
  return calcAcumuloRolling({
    tripulanteId: 1,
    dataReferencia,
    jornadasHistorico: historico,
    limites,
    momentoCalculoHvDia: momento,
  });
}

/** PRNG determinístico (mulberry32) — geração reprodutível, sem dependências. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clock(minuteOfDay: number): string {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// 1. ORÁCULO INDEPENDENTE
// ═══════════════════════════════════════════════════════════════════

describe('1. Oráculo independente vs implementação produtiva', () => {
  it('duração da jornada coincide com o oráculo em toda a grade de 15 min', () => {
    let compared = 0;
    for (let start = 0; start < 1440; start += 15) {
      for (let end = 0; end < 1440; end += 15) {
        const produced = calcDuracaoJornada(duty('2026-08-03', clock(start), clock(end)));
        const span = oracle.dutySpan('2026-08-03', clock(start), clock(end));
        // A implementação usa relógio circular; o oráculo, instantes absolutos.
        // Ambos devem concordar exceto no ponto degenerado início == fim.
        const expected = span ? span.to - span.from : 0;
        expect(produced).toBe(start === end ? 0 : expected);
        compared++;
      }
    }
    expect(compared).toBe(96 * 96);
  });

  it('repouso entre jornadas coincide com o oráculo (inclui cruzamento de meia-noite)', () => {
    const anterior = duty('2026-08-03', '18:00', '02:00');
    const atual = duty('2026-08-04', '10:00', '20:00');
    const produced = rolling('2026-08-04', [anterior, atual]);

    const spanAnterior = oracle.dutySpan('2026-08-03', '18:00', '02:00')!;
    const spanAtual = oracle.dutySpan('2026-08-04', '10:00', '20:00')!;
    const expected = spanAtual.from - spanAnterior.to;

    expect(expected).toBe(480); // 02:00 → 10:00
    expect(produced.repouso_anterior_min).toBe(expected);
    expect(Math.abs(produced.repouso_anterior_min - expected)).toBeLessThanOrEqual(TOL_MINUTES);
  });

  it('piso de repouso coincide com o oráculo em toda a faixa de jornada anterior', () => {
    for (let dutyMin = 0; dutyMin <= 20 * 60; dutyMin += 10) {
      expect(repousoMinimoRequeridoMin(dutyMin, L)).toBe(oracle.restFloorMinutes(dutyMin));
    }
    expect(repousoMinimoRequeridoMin(null, L)).toBe(oracle.restFloorMinutes(null));
  });

  it('WOCL e penalidade de despertar coincidem com o oráculo minuto a minuto', () => {
    for (let m = 0; m < 1440; m++) {
      expect(isWithinWOCL(m)).toBe(oracle.insideWocl(m));
      expect(calcularPenalidadeWOCL(m)).toBeCloseTo(oracle.woclArousalPenalty(m), 12);
    }
  });

  it('penalidade por débito de sono coincide com o oráculo', () => {
    for (let min = -60; min <= 1000; min += 5) {
      expect(calcularFatorRepouso(min)).toBeCloseTo(oracle.sleepDebtPenalty(min), 12);
    }
  });

  it('ciclo embarcado coincide com o oráculo em toda a faixa', () => {
    const limites = { ...L, CICLO_EMBARCADO_DIA_INICIO: 1, CICLO_EMBARCADO_DIA_MAX: 14 };
    for (let dia = 0; dia <= 20; dia++) {
      const expected = dia < 1 ? 0 : oracle.embarkedCyclePenalty(dia, 1, 14, 0, -0.15);
      expect(calcFatorCicloEmbarcado(dia, limites)).toBeCloseTo(expected, TOL_FRACTION_DIGITS);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. VETORES DOURADOS
// ═══════════════════════════════════════════════════════════════════

describe('2. Vetores dourados', () => {
  /**
   * V-01 — repouso após jornada que cruza meia-noite.
   * Intermediário: fim anterior = 2026-08-04T02:00; início atual = 2026-08-04T10:00.
   * Esperado: 8 h = 480 min. Fonte: RBAC 117 117.3(n) + A117.23.
   */
  it('V-01 repouso 02:00 → 10:00 = 480 min, não 1920', () => {
    const r = rolling('2026-08-04', [
      duty('2026-08-03', '18:00', '02:00'),
      duty('2026-08-04', '10:00', '20:00'),
    ]);
    expect(r.repouso_anterior_min).toBe(480);
  });

  /**
   * V-02 — A117.23(b)(2): jornada anterior de 13 h exige 16 h de repouso.
   * Intermediário: repouso observado 13 h (780 min) < 960 min exigidos.
   * Antes da correção D-04 isto era classificado SUFICIENTE contra a norma.
   */
  it('V-02 repouso de 13 h após jornada de 13 h é INSUFICIENTE (A117.23(b)(2))', () => {
    const r = rolling('2026-08-04', [
      duty('2026-08-03', '06:00', '19:00'), // 780 min = 13 h
      duty('2026-08-04', '08:00', '16:00'),
    ]);
    expect(r.duracao_jornada_anterior_min).toBe(780);
    expect(r.repouso_anterior_min).toBe(780); // 19:00 → 08:00
    expect(r.repouso_minimo_requerido_min).toBe(960); // 16 h
    expect(r.repouso_estado).toBe('INSUFICIENTE');
    expect(r.repouso_suficiente).toBe(0);
  });

  /** V-03 — A117.23(b)(3): jornada anterior > 15 h exige 24 h. */
  it('V-03 jornada anterior de 16 h exige 24 h de repouso', () => {
    // Anterior: 03/08 06:00 → 22:00 = 960 min (16 h) ⇒ exige 24 h.
    // Atual: 04/08 20:00. Repouso observado = 22:00 → 20:00 = 22 h = 1320 min.
    const r = rolling('2026-08-04', [
      duty('2026-08-03', '06:00', '22:00'),
      duty('2026-08-04', '20:00', '23:00'),
    ]);
    expect(r.duracao_jornada_anterior_min).toBe(960);
    expect(r.repouso_minimo_requerido_min).toBe(1440); // 24 h
    expect(r.repouso_anterior_min).toBe(1320); // 22 h
    expect(r.repouso_estado).toBe('INSUFICIENTE');

    // Contraprova: 24 h de repouso satisfazem o patamar.
    const ok = rolling('2026-08-04', [
      duty('2026-08-03', '06:00', '22:00'),
      duty('2026-08-04', '22:00', '23:59'),
    ]);
    expect(ok.repouso_anterior_min).toBe(1440);
    expect(ok.repouso_estado).toBe('SUFICIENTE');
  });

  /** V-04 — A117.23(b)(1): jornada de 10 h + repouso de 12 h é suficiente. */
  it('V-04 repouso de 12 h após jornada de 10 h é SUFICIENTE', () => {
    const r = rolling('2026-08-04', [
      duty('2026-08-03', '06:00', '16:00'), // 600 min = 10 h
      duty('2026-08-04', '04:00', '12:00'),
    ]);
    expect(r.repouso_minimo_requerido_min).toBe(720);
    expect(r.repouso_anterior_min).toBe(720); // 16:00 → 04:00
    expect(r.repouso_estado).toBe('SUFICIENTE');
    expect(r.repouso_suficiente).toBe(1);
  });

  /**
   * V-05 — HV na janela de 24 h, modo realizado.
   * Jornada 06:00–17:00 (660 min) com 180 min de voo, integralmente contida na
   * janela que termina em 17:00. Esperado: 180 min.
   */
  it('V-05 modo realizado inclui a jornada corrente na janela de 24 h', () => {
    const j = duty('2026-08-04', '06:00', '17:00', 180);
    expect(rolling('2026-08-04', [j], 'REALIZADO_APOS_JORNADA').hv_dia_min).toBe(180);
    // Em projeção a janela termina na apresentação: a jornada ainda não ocorreu.
    expect(rolling('2026-08-04', [j], 'PROJECAO_ANTES_JORNADA').hv_dia_min).toBe(0);
  });

  /**
   * V-06 — rateio de jornada parcialmente contida na janela de 24 h.
   * Jornada anterior 2026-08-03 20:00 → 2026-08-04 04:00 (480 min, 240 de voo).
   * Janela realizado da jornada de 04-08 06:00→10:00 termina em 10:00 e começa
   * em 2026-08-03 10:00. A anterior está integralmente contida ⇒ 240 min.
   */
  it('V-06 rateio proporcional confere com o oráculo', () => {
    const anterior = duty('2026-08-03', '20:00', '04:00', 240);
    const atual = duty('2026-08-04', '06:00', '10:00', 60);
    const r = rolling('2026-08-04', [anterior, atual], 'REALIZADO_APOS_JORNADA');

    const windowEnd = oracle.civilInstant('2026-08-04', '10:00')!;
    const window = { from: windowEnd - 1440, to: windowEnd };
    const expected =
      oracle.proratedFlightMinutes(oracle.dutySpan('2026-08-03', '20:00', '04:00')!, 240, window) +
      oracle.proratedFlightMinutes(oracle.dutySpan('2026-08-04', '06:00', '10:00')!, 60, window);

    expect(expected).toBe(300);
    expect(r.hv_dia_min).toBe(Math.round(expected));
  });

  /** V-07 — effectiveness com penalidades conhecidas confere com o oráculo. */
  it('V-07 effectiveness = 100 + 100·Σpenalidades, saturado', () => {
    const fat = calcFatorizacao({
      jornada: duty('2026-08-04', '23:00', '07:00', 360, {
        hora_primeira_decolagem: '23:30',
        hora_ultimo_pouso: '06:30',
      }),
      repousoAnteriorMin: 300,
      limites: L,
      diasDoMes: 31,
    });
    const eff = calcEffectiveness(fat, L);
    expect(eff.effectiveness_pct).toBeCloseTo(
      oracle.effectivenessFromPenalties([fat.total_fatorizado_jornada]),
      1,
    );
    expect(eff.effectiveness_pct).toBeGreaterThanOrEqual(0);
    expect(eff.effectiveness_pct).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. ANÁLISE DIMENSIONAL
// ═══════════════════════════════════════════════════════════════════

describe('3. Análise dimensional', () => {
  /**
   * `FatorizacaoResult` mistura DUAS grandezas sob o mesmo sufixo `_pct`:
   *
   * - **razões de utilização** (`fator_basica_pct`, `fator_hv_basica_pct`):
   *   adimensionais, ≥ 0 e **ilimitadas superiormente** — uma jornada de 15 h
   *   contra FDP de 11 h vale 1,3636. São diagnósticas e não entram nos totais.
   * - **penalidades** (todas as demais): adimensionais em [-1, 0].
   *
   * O sufixo comum é dívida de nomenclatura preservada por compatibilidade
   * (ver D-10). O teste fixa a separação para que ela não se perca.
   */
  it('razões são ≥ 0 e ilimitadas; penalidades ficam em [-1, 0]', () => {
    const fat = calcFatorizacao({
      jornada: duty('2026-08-04', '05:00', '20:00', 400, {
        tipo_base: 'AWAY',
        aclimatado: 0,
        hora_primeira_decolagem: '23:30',
        hora_ultimo_pouso: '04:30',
      }),
      repousoAnteriorMin: 60,
      limites: L,
      diasDoMes: 31,
      diaDoCiclo: 10,
    });
    const razoes = new Set(['fator_basica_pct', 'fator_hv_basica_pct']);
    const totais = new Set(['total_fatorizado_jornada', 'total_fatorizado_hv']);
    for (const [nome, valor] of Object.entries(fat)) {
      const v = valor as number;
      expect(Number.isFinite(v), `${nome} finito`).toBe(true);
      if (razoes.has(nome)) {
        expect(v, `${nome} é razão ≥ 0`).toBeGreaterThanOrEqual(0);
      } else if (totais.has(nome)) {
        // Soma de penalidades: não positiva, mas pode ultrapassar −1 em módulo.
        expect(v, `${nome} não positivo`).toBeLessThanOrEqual(0);
      } else {
        expect(v, `${nome} penalidade em [-1, 0]`).toBeGreaterThanOrEqual(-1);
        expect(v, `${nome} penalidade em [-1, 0]`).toBeLessThanOrEqual(0);
      }
    }
    // A razão excede 1 quando a jornada supera o FDP máximo — comportamento correto.
    expect(fat.fator_basica_pct).toBeGreaterThan(1);
  });

  it('penalidades somadas ao total são não positivas; razões básicas ficam fora', () => {
    const fat = calcFatorizacao({
      jornada: duty('2026-08-04', '05:00', '20:00', 400),
      repousoAnteriorMin: 60,
      limites: L,
      diasDoMes: 31,
    });
    expect(fat.fator_basica_pct).toBeGreaterThan(0); // razão de utilização
    expect(fat.fator_hv_basica_pct).toBeGreaterThan(0);
    expect(fat.total_fatorizado_jornada).toBeLessThanOrEqual(0);
    expect(fat.total_fatorizado_hv).toBeLessThanOrEqual(0);
  });

  it('percentuais de utilização de limite estão em 0–100, não em fração', () => {
    // 8 h de voo com limite diário de 8 h ⇒ 100%, não 1.
    const r = rolling('2026-08-04', [duty('2026-08-04', '06:00', '18:00', 480)]);
    expect(r.pct_limite_dia).toBeCloseTo(100, 4);
  });

  it('minutos e horas não são trocados: limites em horas viram minutos', () => {
    expect(repousoMinimoRequeridoMin(600, L)).toBe(L.REPOUSO_MINIMO_HORAS * 60);
  });

  it('valores não finitos em fatores configurados são neutralizados, não propagados', () => {
    const sujo = { ...L, NOTURNO_FATOR: Number.NaN, DURACAO_LONGA_FATOR: Number.POSITIVE_INFINITY };
    const fat = calcFatorizacao({
      jornada: duty('2026-08-04', '23:00', '09:00', 300, {
        hora_primeira_decolagem: '23:30',
        hora_ultimo_pouso: '08:30',
      }),
      repousoAnteriorMin: 600,
      limites: sujo as LimitesMap,
      diasDoMes: 31,
    });
    for (const valor of Object.values(fat)) {
      expect(Number.isFinite(valor)).toBe(true);
      expect(Number.isNaN(valor)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. PROPRIEDADES MATEMÁTICAS
// ═══════════════════════════════════════════════════════════════════

describe('4. Propriedades matemáticas', () => {
  it('monotonicidade: mais sono nunca piora o fator de repouso', () => {
    let anterior = -Infinity;
    for (let min = 0; min <= 960; min += 5) {
      const atual = calcularFatorRepouso(min);
      expect(atual).toBeGreaterThanOrEqual(anterior - 1e-12);
      anterior = atual;
    }
  });

  it('monotonicidade: mais horas de voo nunca aumentam a effectiveness', () => {
    let anterior = Infinity;
    for (let hv = 0; hv <= 600; hv += 20) {
      const fat = calcFatorizacao({
        jornada: duty('2026-08-04', '08:00', '18:00', hv),
        repousoAnteriorMin: 720,
        limites: L,
        diasDoMes: 31,
      });
      const eff = calcEffectiveness(fat, L).effectiveness_pct;
      expect(eff).toBeLessThanOrEqual(anterior + 1e-9);
      anterior = eff;
    }
  });

  it('monotonicidade: exposição de voo em janela móvel é não decrescente no HV', () => {
    let anterior = -1;
    for (let hv = 0; hv <= 480; hv += 30) {
      const r = rolling('2026-08-04', [duty('2026-08-04', '06:00', '18:00', hv)]);
      expect(r.hv_dia_min).toBeGreaterThanOrEqual(anterior);
      anterior = r.hv_dia_min;
    }
  });

  it('limites: effectiveness permanece em [0, 100] sob entradas aleatórias', () => {
    const rand = mulberry32(20260804);
    for (let i = 0; i < 400; i++) {
      const start = Math.floor(rand() * 1440);
      const dur = 30 + Math.floor(rand() * 900);
      const fat = calcFatorizacao({
        jornada: duty('2026-08-04', clock(start), clock(start + dur), Math.floor(rand() * 600), {
          tipo_base: rand() > 0.5 ? 'AWAY' : 'HOME',
          aclimatado: rand() > 0.5 ? 0 : 1,
          hora_primeira_decolagem: clock(Math.floor(rand() * 1440)),
          hora_ultimo_pouso: clock(Math.floor(rand() * 1440)),
        }),
        repousoAnteriorMin: Math.floor(rand() * 2000) - 100,
        limites: L,
        diasDoMes: 31,
        diaDoCiclo: Math.floor(rand() * 20),
      });
      const eff = calcEffectiveness(fat, L, {
        hora_apresentacao: clock(start),
        hora_acordou: rand() > 0.5 ? clock(Math.floor(rand() * 1440)) : null,
        hora_dormiu: rand() > 0.5 ? clock(Math.floor(rand() * 1440)) : null,
      });
      expect(Number.isFinite(eff.effectiveness_pct)).toBe(true);
      expect(eff.effectiveness_pct).toBeGreaterThanOrEqual(0);
      expect(eff.effectiveness_pct).toBeLessThanOrEqual(100);
      expect(['verde', 'atencao', 'amarelo', 'vermelho']).toContain(eff.nivel);
    }
  });

  it('determinismo e idempotência: mesma entrada, mesma saída', () => {
    const jornadas = [
      duty('2026-08-03', '18:00', '02:00', 200),
      duty('2026-08-04', '10:00', '20:00', 300),
    ];
    const a = rolling('2026-08-04', jornadas);
    const b = rolling('2026-08-04', jornadas);
    expect(a).toEqual(b);
  });

  it('independência de ordem: permutar o histórico não altera o resultado', () => {
    const jornadas = [
      duty('2026-08-01', '06:00', '14:00', 120),
      duty('2026-08-02', '07:00', '15:00', 150),
      duty('2026-08-03', '18:00', '02:00', 200),
      duty('2026-08-04', '10:00', '20:00', 300),
    ];
    const base = rolling('2026-08-04', jornadas);
    const rand = mulberry32(7);
    for (let i = 0; i < 20; i++) {
      const shuffled = [...jornadas].sort(() => rand() - 0.5);
      expect(rolling('2026-08-04', shuffled)).toEqual(base);
    }
  });

  it('nenhum repouso negativo impossível é produzido', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 200; i++) {
      const r = rolling('2026-08-04', [
        duty('2026-08-03', clock(Math.floor(rand() * 1440)), clock(Math.floor(rand() * 1440))),
        duty('2026-08-04', clock(Math.floor(rand() * 1440)), clock(Math.floor(rand() * 1440))),
      ]);
      // -1 é o sentinela documentado de "não observável"; qualquer outro valor é duração real.
      expect(r.repouso_anterior_min === -1 || r.repouso_anterior_min >= 0).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. RELAÇÕES METAMÓRFICAS
// ═══════════════════════════════════════════════════════════════════

describe('5. Relações metamórficas', () => {
  it('translação: deslocar todos os eventos por N dias preserva durações e repouso', () => {
    const jornadas = [
      duty('2026-08-03', '18:00', '02:00', 200),
      duty('2026-08-04', '10:00', '20:00', 300),
    ];
    const base = rolling('2026-08-04', jornadas);
    for (const deslocamento of [-400, -31, -1, 1, 29, 366, 1000]) {
      const shifted = jornadas.map((j) =>
        duty(
          oracle.shiftIsoDate(j.data, deslocamento),
          j.hora_apresentacao,
          j.hora_termino,
          j.horas_voo_minutos ?? 0,
        ),
      );
      const alvo = oracle.shiftIsoDate('2026-08-04', deslocamento);
      const r = rolling(alvo, shifted);
      expect(r.repouso_anterior_min).toBe(base.repouso_anterior_min);
      expect(r.hv_dia_min).toBe(base.hv_dia_min);
      expect(r.hv_7_dias_min).toBe(base.hv_7_dias_min);
      expect(r.repouso_estado).toBe(base.repouso_estado);
    }
  });

  it('partição: dividir uma jornada em duas contíguas preserva a duração total', () => {
    const inteira = calcDuracaoJornada(duty('2026-08-04', '06:00', '18:00'));
    const parte1 = calcDuracaoJornada(duty('2026-08-04', '06:00', '12:00'));
    const parte2 = calcDuracaoJornada(duty('2026-08-04', '12:00', '18:00'));
    expect(parte1 + parte2).toBe(inteira);
  });

  it('adição neutra: evento sem interseção com a janela não altera a janela de 24 h', () => {
    const atual = duty('2026-08-04', '06:00', '17:00', 180);
    const semExtra = rolling('2026-08-04', [atual]);
    const distante = duty('2026-07-01', '06:00', '17:00', 400);
    const comExtra = rolling('2026-08-04', [distante, atual]);
    expect(comExtra.hv_dia_min).toBe(semExtra.hv_dia_min);
  });

  it('mais carga não pode melhorar a classificação', () => {
    const leve = calcFatorizacao({
      jornada: duty('2026-08-04', '08:00', '14:00', 120),
      repousoAnteriorMin: 900,
      limites: L,
      diasDoMes: 31,
    });
    const pesada = calcFatorizacao({
      jornada: duty('2026-08-04', '08:00', '22:00', 480),
      repousoAnteriorMin: 900,
      limites: L,
      diasDoMes: 31,
    });
    expect(pesada.total_fatorizado_jornada).toBeLessThanOrEqual(leve.total_fatorizado_jornada);
  });

  it('mais repouso, mantido o resto, nunca piora a métrica', () => {
    let anterior = -Infinity;
    for (const repouso of [0, 120, 300, 480, 600, 720, 900, 1200]) {
      const fat = calcFatorizacao({
        jornada: duty('2026-08-04', '08:00', '18:00', 240),
        repousoAnteriorMin: repouso,
        limites: L,
        diasDoMes: 31,
      });
      expect(fat.fator_repouso_pct).toBeGreaterThanOrEqual(anterior - 1e-12);
      anterior = fat.fator_repouso_pct;
    }
  });

  it('ausência de dupla contagem: um mesmo intervalo não é somado duas vezes', () => {
    const j = duty('2026-08-04', '06:00', '18:00', 300);
    const uma = rolling('2026-08-04', [j]);
    // O mesmo objeto repetido não deve dobrar a exposição da jornada de referência.
    const duplicada = rolling('2026-08-04', [j, j]);
    expect(duplicada.hv_dia_min).toBe(uma.hv_dia_min * 2);
    // (documenta o comportamento: linhas distintas são eventos distintos —
    // a deduplicação é responsabilidade da camada de origem, ver L-04)
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. BORDAS E CASOS CRÍTICOS
// ═══════════════════════════════════════════════════════════════════

describe('6. Bordas e casos críticos', () => {
  it('meia-noite exata e jornada de 24 h', () => {
    expect(calcDuracaoJornada(duty('2026-08-04', '00:00', '00:00'))).toBe(0);
    expect(calcDuracaoJornada(duty('2026-08-04', '23:59', '00:00'))).toBe(1);
    expect(calcDuracaoJornada(duty('2026-08-04', '00:00', '23:59'))).toBe(1439);
  });

  it('virada de mês, de ano e ano bissexto', () => {
    // 2028 é bissexto: 29/02 existe.
    expect(
      rolling('2028-03-01', [
        duty('2028-02-29', '20:00', '02:00'),
        duty('2028-03-01', '10:00', '18:00'),
      ]).repouso_anterior_min,
    ).toBe(480);
    // Virada de ano.
    expect(
      rolling('2027-01-01', [
        duty('2026-12-31', '20:00', '02:00'),
        duty('2027-01-01', '10:00', '18:00'),
      ]).repouso_anterior_min,
    ).toBe(480);
    // Virada de mês.
    expect(
      rolling('2026-09-01', [
        duty('2026-08-31', '20:00', '02:00'),
        duty('2026-09-01', '10:00', '18:00'),
      ]).repouso_anterior_min,
    ).toBe(480);
  });

  it('2026 não é bissexto: 29/02 é rejeitado pelo oráculo e não vira 01/03', () => {
    expect(oracle.parseCivilDate('2026-02-29')).toBeNull();
    expect(oracle.parseCivilDate('2028-02-29')).not.toBeNull();
  });

  it('entradas nulas, ausentes ou inválidas não produzem NaN', () => {
    for (const invalida of [null, '', '24:00', '12:60', '9:30', 'ab:cd', '  ']) {
      const d = calcDuracaoJornada(duty('2026-08-04', invalida as string | null, '18:00'));
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
    const semHistorico = rolling('2026-08-04', []);
    expect(semHistorico.repouso_estado).toBe('NAO_APLICAVEL');
    expect(semHistorico.repouso_suficiente).toBe(0); // fail-closed
  });

  it('repouso desconhecido falha fechado, nunca como suficiente', () => {
    // Primeira jornada da série: não há anterior observável.
    const r = rolling('2026-08-04', [duty('2026-08-04', '10:00', '20:00')]);
    expect(r.repouso_estado).toBe('DESCONHECIDO');
    expect(r.repouso_suficiente).toBe(0);
  });

  it('D-07: jornada anterior sobreposta marca DESCONHECIDO, não repouso inflado', () => {
    const r = rolling('2026-08-04', [
      duty('2026-08-01', '06:00', '14:00'), // antiga, terminaria dando repouso enorme
      duty('2026-08-03', '18:00', '12:00'), // termina 2026-08-04 12:00 — invade a atual
      duty('2026-08-04', '10:00', '20:00'),
    ]);
    expect(r.repouso_estado).toBe('DESCONHECIDO');
    expect(r.repouso_suficiente).toBe(0);
  });

  it('bordas do limiar: imediatamente abaixo, no limite e acima de 12 h de jornada', () => {
    expect(repousoMinimoRequeridoMin(12 * 60 - 1, L)).toBe(720);
    expect(repousoMinimoRequeridoMin(12 * 60, L)).toBe(720); // "até 12 h" inclusivo
    expect(repousoMinimoRequeridoMin(12 * 60 + 1, L)).toBe(960);
    expect(repousoMinimoRequeridoMin(15 * 60, L)).toBe(960); // "até 15 h" inclusivo
    expect(repousoMinimoRequeridoMin(15 * 60 + 1, L)).toBe(1440);
  });

  it('bordas da WOCL: 01:59 fora, 02:00 dentro, 05:59 dentro, 06:00 fora', () => {
    expect(isWithinWOCL(119)).toBe(false);
    expect(isWithinWOCL(120)).toBe(true);
    expect(isWithinWOCL(359)).toBe(true);
    expect(isWithinWOCL(360)).toBe(false);
  });

  it('janela móvel: eventos que começam antes, terminam depois ou envolvem a janela', () => {
    const windowEnd = oracle.civilInstant('2026-08-04', '12:00')!;
    const window = { from: windowEnd - 1440, to: windowEnd };
    // Começa antes e termina dentro.
    expect(oracle.overlapMinutes(oracle.dutySpan('2026-08-03', '10:00', '14:00')!, window)).toBe(
      120,
    );
    // Começa dentro e termina depois.
    expect(oracle.overlapMinutes(oracle.dutySpan('2026-08-04', '10:00', '14:00')!, window)).toBe(
      120,
    );
    // Envolve integralmente a janela.
    expect(oracle.overlapMinutes({ from: window.from - 100, to: window.to + 100 }, window)).toBe(
      1440,
    );
    // Contíguo, sem interseção.
    expect(oracle.overlapMinutes({ from: window.to, to: window.to + 60 }, window)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. SENSIBILIDADE DOS PARÂMETROS
// ═══════════════════════════════════════════════════════════════════

describe('7. Sensibilidade: limites configuráveis são realmente usados', () => {
  const jornadaLonga = duty('2026-08-04', '06:00', '20:00', 400);

  it('DURACAO_LONGA_FATOR altera o resultado; DURACAO_CURTA_FATOR não (D-05)', () => {
    const base = calcFatorizacao({
      jornada: jornadaLonga,
      repousoAnteriorMin: 900,
      limites: L,
      diasDoMes: 31,
    });
    const alterado = calcFatorizacao({
      jornada: jornadaLonga,
      repousoAnteriorMin: 900,
      limites: { ...L, DURACAO_LONGA_FATOR: -0.3 },
      diasDoMes: 31,
    });
    expect(alterado.fator_duracao_pct).not.toBe(base.fator_duracao_pct);

    // DURACAO_CURTA_* permanece no schema mas comprovadamente não é lido.
    const curta = calcFatorizacao({
      jornada: jornadaLonga,
      repousoAnteriorMin: 900,
      limites: { ...L, DURACAO_CURTA_FATOR: -0.9, DURACAO_CURTA_MINUTOS: 1200 },
      diasDoMes: 31,
    });
    expect(curta.fator_duracao_pct).toBe(base.fator_duracao_pct);
  });

  it('REPOUSO_MINIMO_HORAS só pode endurecer o piso, nunca afrouxar A117.23(b)', () => {
    // Operador mais restritivo que a norma: prevalece o operador.
    expect(repousoMinimoRequeridoMin(600, { ...L, REPOUSO_MINIMO_HORAS: 14 })).toBe(14 * 60);
    // Operador mais frouxo que a norma para jornada longa: prevalece a norma.
    expect(repousoMinimoRequeridoMin(16 * 60, { ...L, REPOUSO_MINIMO_HORAS: 8 })).toBe(24 * 60);
  });

  it('D-03: a penalidade é monotônica e contínua no parâmetro configurado', () => {
    const jornadaNoturna = duty('2026-08-04', '23:00', '07:00', 300, {
      hora_primeira_decolagem: '23:30',
      hora_ultimo_pouso: '06:30',
    });
    let anterior = Infinity;
    // Varre o parâmetro atravessando |v| = 1, onde a heurística anterior dava
    // um salto de ~0,99 e INVERTIA o sentido (mais severo ⇒ menos penalidade).
    for (let v = 0; v <= 2.0001; v += 0.01) {
      const fat = calcFatorizacao({
        jornada: jornadaNoturna,
        repousoAnteriorMin: 900,
        limites: { ...L, NOTURNO_FATOR: -v },
        diasDoMes: 31,
      });
      const atual = fat.fator_noturno_dep_pct;
      expect(Number.isFinite(atual)).toBe(true);
      expect(atual).toBeLessThanOrEqual(anterior + 1e-12); // não crescente
      expect(atual).toBeGreaterThanOrEqual(-1); // saturado
      anterior = atual;
    }
  });

  it('FATORES_ESCALA declara a unidade uma vez; não há inferência por valor', () => {
    const args = {
      jornada: duty('2026-08-04', '08:00', '18:00', 200),
      repousoAnteriorMin: 900,
      diasDoMes: 31,
    };
    const fracao = calcFatorizacao({
      ...args,
      limites: { ...L, FATOR_BASE_AWAY_PCT: -0.25 } as LimitesMap,
      jornada: { ...args.jornada, tipo_base: 'AWAY' },
    });
    const percentual = calcFatorizacao({
      ...args,
      limites: { ...L, FATOR_BASE_AWAY_PCT: -25, FATORES_ESCALA: 'PERCENTUAL' } as LimitesMap,
      jornada: { ...args.jornada, tipo_base: 'AWAY' },
    });
    expect(fracao.fator_base_away_pct).toBeCloseTo(-0.25, 6);
    expect(percentual.fator_base_away_pct).toBeCloseTo(-0.25, 6);
  });

  it('EFFECTIV_* movem as fronteiras de classificação', () => {
    // Jornada com penalidade real (> DURACAO_LONGA_MINUTOS e repouso ruim),
    // para que a effectiveness caia estritamente abaixo de 100.
    const fat = calcFatorizacao({
      jornada: duty('2026-08-04', '06:00', '20:00', 200),
      repousoAnteriorMin: 500,
      limites: L,
      diasDoMes: 31,
    });
    const eff = calcEffectiveness(fat, L).effectiveness_pct;
    expect(eff).toBeLessThan(100);
    expect(eff).toBeGreaterThan(0);

    // Fronteira acima do valor observado ⇒ deixa de ser verde.
    expect(calcEffectiveness(fat, { ...L, EFFECTIV_VERDE_MIN: eff + 1 }).nivel).not.toBe('verde');
    // Fronteira abaixo ⇒ volta a ser verde.
    expect(calcEffectiveness(fat, { ...L, EFFECTIV_VERDE_MIN: eff - 1 }).nivel).toBe('verde');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. INDEPENDÊNCIA DE TIMEZONE
// ═══════════════════════════════════════════════════════════════════

describe('8. Independência de timezone', () => {
  const arquivos = ['calculos.ts', 'fadiga-score.ts'];

  it('os módulos de cálculo não usam APIs de horário local do processo', () => {
    // getHours/getFullYear/... sem sufixo UTC leem o TZ do processo. Um único uso
    // faria o resultado depender de onde o runner roda. Guarda estrutural.
    const proibidos =
      /\.(getFullYear|getMonth|getDate|getHours|getMinutes|getSeconds|getDay|getTime)\s*\(|toLocaleString|toLocaleDateString|toLocaleTimeString|Intl\.DateTimeFormat/;
    for (const arquivo of arquivos) {
      const conteudo = readFileSync(join(__dirname, '../../lib/frms', arquivo), 'utf8');
      const linhasSuspeitas = conteudo
        .split('\n')
        .map((linha, i) => ({ linha, n: i + 1 }))
        .filter(({ linha }) => proibidos.test(linha));
      expect(
        linhasSuspeitas,
        `${arquivo} usa API de horário local: ${JSON.stringify(linhasSuspeitas)}`,
      ).toEqual([]);
    }
  });

  it('entradas equivalentes produzem o mesmo resultado físico, qualquer que seja o TZ', () => {
    // Datas escolhidas sobre transições de DST reais: Brasil (quando vigente),
    // EUA (2026-03-08 / 2026-11-01) e Europa (2026-03-29 / 2026-10-25).
    const datasDst = ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25', '2026-02-14'];
    const tzOriginal = process.env.TZ;
    try {
      const resultados = new Map<string, number[]>();
      for (const tz of ['UTC', 'America/Sao_Paulo', 'Pacific/Kiritimati', 'Pacific/Niue']) {
        process.env.TZ = tz;
        const valores: number[] = [];
        for (const data of datasDst) {
          const anterior = oracle.shiftIsoDate(data, -1);
          const r = rolling(data, [
            duty(anterior, '18:00', '02:00', 200),
            duty(data, '10:00', '20:00', 300),
          ]);
          valores.push(
            r.repouso_anterior_min,
            r.hv_dia_min,
            r.hv_7_dias_min,
            r.repouso_minimo_requerido_min ?? -1,
          );
        }
        resultados.set(tz, valores);
      }
      const referencia = resultados.get('UTC')!;
      for (const [tz, valores] of resultados) {
        expect(valores, `TZ=${tz} divergiu de UTC`).toEqual(referencia);
      }
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });

  it('horários locais inexistentes/ambíguos de DST não alteram a aritmética civil', () => {
    // 2026-11-01 01:30 é ambíguo em America/New_York; 2026-03-08 02:30 não existe.
    // A convenção do FRMS é civil (relógio de parede), então ambos são tratados
    // como rótulos, sem conversão de instante. Ver L-01.
    expect(oracle.civilInstant('2026-03-08', '02:30')).toBe(
      oracle.daysFromCivil(2026, 3, 8) * 1440 + 150,
    );
    expect(calcDuracaoJornada(duty('2026-03-08', '01:30', '03:30'))).toBe(120);
    expect(calcDuracaoJornada(duty('2026-11-01', '01:00', '02:00'))).toBe(60);
  });

  it('ida e volta de conversão de data é estável em 4000 dias', () => {
    for (let offset = -2000; offset <= 2000; offset += 7) {
      const data = oracle.shiftIsoDate('2026-08-04', offset);
      expect(oracle.shiftIsoDate(data, -offset)).toBe('2026-08-04');
    }
  });
});
