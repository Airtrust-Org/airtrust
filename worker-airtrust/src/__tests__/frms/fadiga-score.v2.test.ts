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

  it('não aplica penalidade quando medicação e álcool são null ou false', () => {
    const base = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const comNull = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: null,
        alcool_ult_12h: null,
      },
      cfg,
    );

    const comFalse = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: false,
        alcool_ult_12h: false,
      },
      cfg,
    );

    expect(comNull.componentes.bonus_meds).toBe(0);
    expect(comNull.componentes.bonus_alcool).toBe(0);
    expect(comNull.score_fadiga).toBe(base.score_fadiga);
    expect(comFalse.componentes.bonus_meds).toBe(0);
    expect(comFalse.componentes.bonus_alcool).toBe(0);
    expect(comFalse.score_fadiga).toBe(base.score_fadiga);
  });

  it('aplica penalidade quando medicação e álcool são true', () => {
    const out = calcularScoreFadiga(
      {
        kss_score: 5,
        horas_sono: 6,
        qualidade_sono: 3,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: true,
        alcool_ult_12h: true,
      },
      cfg,
    );

    expect(out.componentes.bonus_meds).toBe(8);
    expect(out.componentes.bonus_alcool).toBe(15);
  });

  it('qualidade_sono ausente não penaliza como qualidade regular default', () => {
    const semQualidade = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: null,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const qualidadeRegular = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: 3,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(semQualidade.score_fadiga).toBeLessThan(qualidadeRegular.score_fadiga);
  });

  it('KSS 1 continua representando maior alerta e KSS 9 maior sonolência', () => {
    const maisAlerta = calcularScoreFadiga(
      {
        kss_score: 1,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const maisSonolento = calcularScoreFadiga(
      {
        kss_score: 9,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(maisAlerta.componentes.kss_norm).toBe(0);
    expect(maisSonolento.componentes.kss_norm).toBe(1);
    expect(maisSonolento.score_fadiga).toBeGreaterThan(maisAlerta.score_fadiga);
  });

  it('qualidade 5 continua sendo melhor e qualidade 1 continua sendo pior', () => {
    const melhorQualidade = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: 5,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const piorQualidade = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: 1,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(melhorQualidade.componentes.qualidade_norm).toBe(0);
    expect(piorQualidade.componentes.qualidade_norm).toBe(1);
    expect(piorQualidade.score_fadiga).toBeGreaterThan(melhorQualidade.score_fadiga);
  });

  it('menos horas de sono nunca reduzem o score nas oito opções discretas do formulário', () => {
    const horasOrdenadas = [9.5, 9, 8, 7, 6, 5, 4, 3.5];
    const scores = horasOrdenadas.map((horas_sono) =>
      calcularScoreFadiga(
        {
          kss_score: 3,
          horas_sono,
          qualidade_sono: 4,
          sintomas_json: null,
          apto: 1,
          meds_ult_12h: 0,
          alcool_ult_12h: 0,
        },
        cfg,
      ).score_fadiga,
    );

    expect(scores).toEqual([9, 9, 9, 13, 18, 24, 29, 34]);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it('mantém o mesmo score para a mesma resposta semântica das escalas do formulário', () => {
    const respostaAntes = calcularScoreFadiga(
      {
        kss_score: 3,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const respostaDepois = calcularScoreFadiga(
      {
        kss_score: 3,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(respostaDepois.score_fadiga).toBe(respostaAntes.score_fadiga);
    expect(respostaDepois.nivel_fadiga).toBe(respostaAntes.nivel_fadiga);
    expect(respostaDepois.status_operacional).toBe(respostaAntes.status_operacional);
  });

  it('medicação sonolenta e sintomas informados aumentam o score', () => {
    const base = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: null,
        apto: 1,
        meds_ult_12h: 0,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    const comFatores = calcularScoreFadiga(
      {
        kss_score: 4,
        horas_sono: 7,
        qualidade_sono: 4,
        sintomas_json: { sonolencia_diurna: 2, dificuldade_concentracao: 2 },
        apto: 1,
        meds_ult_12h: 1,
        alcool_ult_12h: 0,
      },
      cfg,
    );

    expect(comFatores.componentes.bonus_meds).toBe(8);
    expect(comFatores.componentes.sintomas_norm).toBeGreaterThan(0);
    expect(comFatores.score_fadiga).toBeGreaterThan(base.score_fadiga);
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
