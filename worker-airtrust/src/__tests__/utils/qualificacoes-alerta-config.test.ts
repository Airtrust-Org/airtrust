import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALIFICACOES_ALERTA_DIAS,
  normalizeQualificacoesAlertaDias,
} from '../../utils/qualificacoes-alerta-config';

describe('qualificacoes-alerta-config', () => {
  it('usa padrao quando valor e invalido', () => {
    expect(normalizeQualificacoesAlertaDias(undefined)).toBe(DEFAULT_QUALIFICACOES_ALERTA_DIAS);
    expect(normalizeQualificacoesAlertaDias('abc')).toBe(DEFAULT_QUALIFICACOES_ALERTA_DIAS);
  });

  it('aplica limites de seguranca', () => {
    expect(normalizeQualificacoesAlertaDias(0)).toBe(1);
    expect(normalizeQualificacoesAlertaDias(500)).toBe(365);
  });

  it('mantem valor valido dentro da faixa', () => {
    expect(normalizeQualificacoesAlertaDias(15)).toBe(15);
    expect(normalizeQualificacoesAlertaDias('90')).toBe(90);
  });
});
