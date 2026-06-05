import { describe, expect, it } from 'vitest';
import {
  calcularEvolucaoFadigaAcumulada,
  calcularLinhaFadigaAcumulada,
} from '../../lib/frms/fadiga-acumulada-legal';

describe('fadiga acumulada legal — escopo diario vs mensal', () => {
  it('marca HV_MAIOR_QUE_JORNADA quando jornada e zero e HV e positiva', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-05-23',
        duracao_jornada_minutos: 0,
        horas_voo_minutos: 18,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.integridade_status).toBe('INCONSISTENTE');
    expect(linha.inconsistencias).toContain('HV_MAIOR_QUE_JORNADA');
    expect(linha.integridade_codigos).toEqual([
      'JORNADA_ZERO_COM_HV',
      'HORARIO_INCOMPLETO_COM_HV',
      'HV_MAIOR_QUE_JORNADA',
    ]);
    expect(linha.integridade_codigo).toBe('JORNADA_ZERO_COM_HV');
    expect(linha.integridade_mensagem).toContain('jornada zerada');
  });

  it('marca jornada ausente com HV positiva como inconsistente', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-05-25',
        duracao_jornada_minutos: null,
        horas_voo_minutos: 42,
        hora_apresentacao: '08:00',
        hora_termino: '09:00',
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.integridade_status).toBe('INCONSISTENTE');
    expect(linha.integridade_codigos).toContain('JORNADA_AUSENTE_COM_HV');
    expect(linha.integridade_codigos).not.toContain('HV_MAIOR_QUE_JORNADA');
    expect(linha.valores_brutos.duracao_jornada_minutos).toBeNull();
    expect(linha.voo_diario_min).toBe(42);
  });

  it('marca horario incompleto com HV positiva sem alterar os valores brutos', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-05-26',
        duracao_jornada_minutos: 90,
        horas_voo_minutos: 30,
        hora_apresentacao: null,
        hora_termino: '10:00',
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.integridade_status).toBe('INCONSISTENTE');
    expect(linha.integridade_codigos).toEqual(['HORARIO_INCOMPLETO_COM_HV']);
    expect(linha.valores_brutos).toMatchObject({
      duracao_jornada_minutos: 90,
      horas_voo_minutos: 30,
      hora_apresentacao: null,
      hora_termino: '10:00',
    });
  });

  it('nao marca HV_MAIOR_QUE_JORNADA quando jornada e HV sao zero', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-05-24',
        duracao_jornada_minutos: 0,
        horas_voo_minutos: 0,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.integridade_status).toBe('OK');
    expect(linha.inconsistencias).toEqual([]);
    expect(linha.integridade_codigo).toBeNull();
  });

  it('calcula HV diaria 04h42 contra limite diario de 8h', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-06-03',
        duracao_jornada_minutos: 391,
        horas_voo_minutos: 282,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.pct_voo_diaria).toBe(58.75);
    expect(linha.pct_voo).toBe(58.75);
    expect(linha.pct_voo_mes).toBe(5.222);
    expect(linha.pct_voo_diaria).not.toBeCloseTo(5.222, 3);
  });

  it('calcula HV diaria 03h09 contra limite diario de 8h', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-06-02',
        duracao_jornada_minutos: 315,
        horas_voo_minutos: 189,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.pct_voo_diaria).toBe(39.375);
    expect(linha.pct_voo).toBe(39.375);
    expect(linha.pct_voo_mes).toBe(3.5);
    expect(linha.pct_voo_diaria).not.toBe(3.5);
  });

  it('mantem percentual mensal de HV com divisor de 90h somente no campo mensal', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-06-03',
        duracao_jornada_minutos: 391,
        horas_voo_minutos: 282,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.pct_voo_mes).toBe(5.222);
    expect(linha.voo_acumulado_min).toBe(282);
  });

  it('marca HV 25h37 como violacao extrema e inconsistencia se HV excede jornada diaria', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-06-01',
        duracao_jornada_minutos: 595,
        horas_voo_minutos: 1537,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.pct_voo_diaria).toBe(320.208);
    expect(linha.integridade_status).toBe('INCONSISTENTE');
    expect(linha.inconsistencias).toContain('HV_MAIOR_QUE_JORNADA');
    expect(linha.integridade_codigo).toBe('HORARIO_INCOMPLETO_COM_HV');
  });

  it('calcula jornada 09h55 contra limite diario de jornada', () => {
    const linha = calcularLinhaFadigaAcumulada({
      jornada: {
        data: '2026-06-01',
        duracao_jornada_minutos: 595,
        horas_voo_minutos: 0,
      },
      acumuladoJornadaMinAnterior: 0,
      acumuladoVooMinAnterior: 0,
    });

    expect(linha.pct_jornada_diaria).toBe(90.152);
    expect(linha.pct_jornada).toBe(90.152);
    expect(linha.pct_jornada_mes).toBe(5.634);
  });

  it('acumula mensalmente sem trocar o percentual diario da linha', () => {
    const [dia1, dia2, dia3] = calcularEvolucaoFadigaAcumulada([
      { data: '2026-06-01', duracao_jornada_minutos: 595, horas_voo_minutos: 0 },
      { data: '2026-06-02', duracao_jornada_minutos: 315, horas_voo_minutos: 189 },
      { data: '2026-06-03', duracao_jornada_minutos: 391, horas_voo_minutos: 282 },
    ]);

    expect(dia1.pct_voo_diaria).toBe(0);
    expect(dia2.pct_voo_diaria).toBe(39.375);
    expect(dia2.pct_voo_mes).toBe(3.5);
    expect(dia3.pct_voo_diaria).toBe(58.75);
    expect(dia3.pct_voo_mes).toBe(8.722);
  });
});
