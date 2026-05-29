import { describe, expect, it } from 'vitest';
import { buildFrmsLink, getFrmsVerboseLabel } from '../EvdPage';

type Signal = Parameters<typeof getFrmsVerboseLabel>[0];

function makeSignal(overrides: Partial<NonNullable<Signal>>): NonNullable<Signal> {
  return {
    status: 'normal',
    statusLabel: 'OK',
    dataSource: 'not_applicable',
    requiresReview: false,
    hasAlert: false,
    ...overrides,
  };
}

describe('getFrmsVerboseLabel', () => {
  it('retorna "Sem dado FRMS" quando sinal é null', () => {
    expect(getFrmsVerboseLabel(null)).toBe('Sem dado FRMS');
  });

  it('retorna "Sem dado FRMS" quando sinal é undefined', () => {
    expect(getFrmsVerboseLabel(undefined)).toBe('Sem dado FRMS');
  });

  it('retorna "Check-in pendente" quando status é not_submitted', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'not_submitted' }))).toBe('Check-in pendente');
  });

  it('retorna "Dado estimado" quando dataSource é default_estimate e status normal', () => {
    expect(getFrmsVerboseLabel(makeSignal({ dataSource: 'default_estimate' }))).toBe('Dado estimado');
  });

  it('retorna "Check-in recebido" quando dataSource é crew_reported e status normal', () => {
    expect(getFrmsVerboseLabel(makeSignal({ dataSource: 'crew_reported' }))).toBe('Check-in recebido');
  });

  it('retorna "Revisar com gestor" quando status é critical', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'critical' }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando status é unfit_for_duty', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'unfit_for_duty' }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando requiresReview é true', () => {
    expect(getFrmsVerboseLabel(makeSignal({ requiresReview: true }))).toBe('Revisar com gestor');
  });

  it('retorna "Revisar com gestor" quando hasAlert é true', () => {
    expect(getFrmsVerboseLabel(makeSignal({ hasAlert: true }))).toBe('Revisar com gestor');
  });

  it('retorna "Atenção" quando status é attention', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'attention' }))).toBe('Atenção');
  });

  it('retorna "Sem jornada FRMS" quando status é no_duty', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'no_duty' }))).toBe('Sem jornada FRMS');
  });

  it('retorna "FRMS OK" para status normal sem fonte especial', () => {
    expect(getFrmsVerboseLabel(makeSignal({ status: 'normal', dataSource: 'not_applicable' }))).toBe('FRMS OK');
  });

  it('prioriza status critical sobre dataSource estimado', () => {
    expect(
      getFrmsVerboseLabel(makeSignal({ status: 'critical', dataSource: 'default_estimate' })),
    ).toBe('Revisar com gestor');
  });
});

describe('buildFrmsLink', () => {
  it('gera link com data_inicio e data_fim para a mesma data', () => {
    const link = buildFrmsLink('2026-05-27');
    expect(link).toContain('/frms/controle-operacional');
    expect(link).toContain('data_inicio=2026-05-27');
    expect(link).toContain('data_fim=2026-05-27');
  });

  it('inclui funcionario_id quando fornecido como number', () => {
    const link = buildFrmsLink('2026-05-27', 35);
    expect(link).toContain('funcionario_id=35');
  });

  it('inclui funcionario_id quando fornecido como string numérica', () => {
    const link = buildFrmsLink('2026-05-27', '42');
    expect(link).toContain('funcionario_id=42');
  });

  it('omite funcionario_id quando null', () => {
    const link = buildFrmsLink('2026-05-27', null);
    expect(link).not.toContain('funcionario_id');
  });

  it('omite funcionario_id quando undefined', () => {
    const link = buildFrmsLink('2026-05-27', undefined);
    expect(link).not.toContain('funcionario_id');
  });

  it('omite funcionario_id quando 0 (ID inválido)', () => {
    const link = buildFrmsLink('2026-05-27', 0);
    expect(link).not.toContain('funcionario_id');
  });

  it('não usa apto_para_voo nem decision automática', () => {
    const link = buildFrmsLink('2026-05-27', 10);
    expect(link).not.toContain('apto');
    expect(link).not.toContain('inapto');
    expect(link).not.toContain('bloqueio');
  });
});
