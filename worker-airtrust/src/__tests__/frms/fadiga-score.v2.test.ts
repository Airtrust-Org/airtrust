import { describe, expect, it } from 'vitest';
import {
  calcularFatorRepouso,
  calcularHorasSono,
  calcularScoreFadiga,
  calcularSono,
  isWithinWOCL,
} from '../../lib/frms/fadiga-score';

const cfg = {
  threshold_amarelo: 40,
  threshold_vermelho: 60,
  peso_kss: 0.35,
  peso_sono_duracao: 0.25,
  peso_sono_qualidade: 0.2,
  peso_sintomas: 0.2,
} as const;

describe('calcularScoreFadiga (modelo VERDE/AMARELO/LARANJA/VERMELHO)', () => {
  it('aplica penalidade quando horas_sono = null', () => {
    const outComNull = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: null,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const outCom8h = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 8,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(outComNull.score_fadiga).toBeGreaterThan(outCom8h.score_fadiga);
  });

  it('kss=9 e sono=3h produz nivel vermelho', () => {
    const out = calcularScoreFadiga(
      {
        kss_score: 9,
        horas_sono: 3,
        qualidade_sono: 1,
        sintomas_json: { sonolencia: 3, reflexo_reduzido: 2 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(out.nivel_fadiga).toBe('VERMELHO');
    expect(out.status_operacional).toBe('INAPTO');
  });

  it('apto=0 força score minimo no threshold_vermelho', () => {
    const out = calcularScoreFadiga(
      {
        kss_score: 2,
        horas_sono: 8,
        qualidade_sono: 5,
        sintomas_json: null,
        apto: 0,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(out.score_fadiga).toBeGreaterThanOrEqual(cfg.threshold_vermelho);
  });

  it('alcool_ult_12h soma +15 no score final', () => {
    const base = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: { sonolencia: 1 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const comAlcool = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: { sonolencia: 1 },
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 1,
      },
      cfg,
    );

    expect(comAlcool.score_fadiga - base.score_fadiga).toBe(15);
  });
});

describe('calcularHorasSono', () => {
  it('calcula corretamente no mesmo dia', () => {
    expect(calcularHorasSono('22:00', '23:30')).toBe(1.5);
  });

  it('calcula corretamente virada de dia', () => {
    expect(calcularHorasSono('23:30', '06:00')).toBe(6.5);
  });

  it('retorna 0 quando hora igual', () => {
    expect(calcularHorasSono('07:00', '07:00')).toBe(0);
  });
});

describe('calcularSono (premissa operacional)', () => {
  it('premissa padrão de 8h', () => {
    const r1 = calcularSono({
      horaApresentacaoMin: 480,
      minutosAntesApresentacao: 90,
      horasSonoPadrao: 8,
    });
    expect(r1.tAcordouMin).toBe(390);
    expect(r1.sonoEfetivoMin).toBe(480);
    expect(r1.fonteSono).toBe('PADRAO');
    expect(r1.tDormiuMin).toBe(-90);
  });

  it('com hora informada cruza meia-noite corretamente', () => {
    const r2 = calcularSono({
      horaApresentacaoMin: 480,
      minutosAntesApresentacao: 90,
      horasSonoPadrao: 8,
      horaDormiu: 1380,
    });
    expect(r2.sonoEfetivoMin).toBe(450);
    expect(r2.fonteSono).toBe('INFORMADO');
  });
});

describe('WOCL helpers', () => {
  it('isWithinWOCL boundaries', () => {
    expect(isWithinWOCL(120)).toBe(true);
    expect(isWithinWOCL(359)).toBe(true);
    expect(isWithinWOCL(360)).toBe(false);
    expect(isWithinWOCL(119)).toBe(false);
  });
});

describe('calcularFatorRepouso', () => {
  it('sono padrão 8h (480) retorna neutro 0', () => {
    expect(calcularFatorRepouso(480)).toBe(0);
  });

  it('sono curto 6h (360) retorna penalidade negativa', () => {
    expect(calcularFatorRepouso(360)).toBeLessThan(0);
  });
});
