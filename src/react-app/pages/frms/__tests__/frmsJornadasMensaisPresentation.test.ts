import { describe, expect, it } from 'vitest';
import { buildJornadaMensalPresentation } from '../frmsJornadasMensaisPresentation';

describe('frms jornadas mensais presentation', () => {
  it('renderiza FAT.HV diaria de 04h42 usando o limite diario de 8h', () => {
    const presentation = buildJornadaMensalPresentation({
      pct_jornada_diaria: 59.242,
      pct_voo_diaria: 58.75,
      integridade_status: 'OK',
      integridade_codigo: null,
      integridade_mensagem: null,
    });

    expect(presentation.fatHvDiaLabel).toBe('58.75%');
    expect(presentation.fatJornadaDiaLabel).toBe('59.24%');
  });

  it('renderiza FAT.HV diaria de 03h09 sem cair no valor mensal de 3.50%', () => {
    const presentation = buildJornadaMensalPresentation({
      pct_jornada_diaria: 47.727,
      pct_voo_diaria: 39.375,
      integridade_status: 'OK',
      integridade_codigo: null,
      integridade_mensagem: null,
    });

    expect(presentation.fatHvDiaLabel).toBe('39.38%');
    expect(presentation.fatHvDiaLabel).not.toBe('3.50%');
  });

  it('nao faz fallback silencioso para percentual mensal ou fatorizado quando o diario nao vem', () => {
    const presentation = buildJornadaMensalPresentation({
      pct_jornada_diaria: null,
      pct_voo_diaria: null,
      integridade_status: 'OK',
      integridade_codigo: null,
      integridade_mensagem: null,
    });

    expect(presentation.fatJornadaDiaLabel).toBe('—');
    expect(presentation.fatHvDiaLabel).toBe('—');
  });

  it('marca jornada inconsistente como nao normal na tabela', () => {
    const presentation = buildJornadaMensalPresentation({
      pct_jornada_diaria: 90.152,
      pct_voo_diaria: 320.208,
      integridade_status: 'INCONSISTENTE',
      integridade_codigo: 'HV_MAIOR_QUE_JORNADA',
      integridade_mensagem: 'Horas de voo excedem a duração de jornada registrada.',
    });

    expect(presentation.hasIntegrityIssue).toBe(true);
    expect(presentation.integrityLabel).toBe('HV maior que jornada');
    expect(presentation.integrityMessage).toContain('excedem');
  });

  it('exibe FIRA como auditoria pendente sem HV operacional validada', () => {
    const presentation = buildJornadaMensalPresentation({
      pct_jornada_diaria: null,
      pct_voo_diaria: null,
      integridade_status: 'INCONSISTENTE',
      integridade_codigo: 'FONTE_NAO_CANONICA',
      integridade_mensagem: 'Fonte nao canonica para FRMS operacional.',
      fonte_original: 'FIRA',
      source_status: 'PENDENTE_SIGVOOS',
      usado_no_frms_operacional: false,
      duracao_jornada_minutos: 595,
      horas_voo_minutos: 1537,
    });

    expect(presentation.sourceLabel).toBe('Pendente SIGVOOS');
    expect(presentation.operationalHvLabel).toBe('—');
    expect(presentation.operationalJourneyLabel).toBe('—');
    expect(presentation.auxiliarySourceLabel).toBe('FIRA: 25h37');
    expect(presentation.fatHvDiaLabel).toBe('—');
  });
});
