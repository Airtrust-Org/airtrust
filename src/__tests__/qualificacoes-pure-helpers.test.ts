import { describe, expect, it } from 'vitest';
import {
  formatDateInputValue,
  formatDateLabel,
  getTipoTreinamentoDisplay,
  getDataMinimaPlanejada,
  isPlanejadaVencida,
  normalizeTipoCodigo,
  sugerirNovaDataPlanejada,
} from '@/react-app/pages/qualificacoes/qualificacoes.helpers';

describe('qualificacoes pure presentation helpers', () => {
  it('normalizes qualification codes without changing empty-value behavior', () => {
    expect(normalizeTipoCodigo('  g1-sem  ')).toBe('G1-SEM');
    expect(normalizeTipoCodigo(null)).toBe('');
    expect(normalizeTipoCodigo(undefined)).toBe('');
  });

  it('keeps training type labels and classes stable', () => {
    expect(getTipoTreinamentoDisplay('SEMESTRAL', 12)).toEqual({
      value: 'SEMESTRAL',
      label: 'Semestral',
      className: 'bg-emerald-100 text-emerald-800',
    });
    expect(getTipoTreinamentoDisplay('RECORRENTE', 6)).toEqual({
      value: 'SEMESTRAL',
      label: 'Semestral',
      className: 'bg-emerald-100 text-emerald-800',
    });
    expect(getTipoTreinamentoDisplay(' inicial ')).toEqual({
      value: 'INICIAL',
      label: 'Inicial',
      className: 'bg-amber-100 text-amber-800',
    });
    expect(getTipoTreinamentoDisplay(null)).toEqual({
      value: 'RECORRENTE',
      label: 'Periódico',
      className: 'bg-sky-100 text-sky-800',
    });
  });

  it('formats date input values using the existing local-calendar contract', () => {
    expect(formatDateInputValue(new Date(2026, 9, 2))).toBe('2026-10-02');
    expect(formatDateInputValue(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('keeps qualification date labels stable for empty, valid and invalid values', () => {
    expect(formatDateLabel()).toBe('Data a definir');
    expect(formatDateLabel(null)).toBe('Data a definir');
    expect(formatDateLabel('2026-10-02')).toBe('02/10/2026');
    expect(formatDateLabel('valor-invalido')).toBe('valor-invalido');
  });

  it('detects overdue planned qualifications against a deterministic local day', () => {
    const today = new Date(2026, 9, 2, 15, 30);
    expect(isPlanejadaVencida({ qualificacao_status: 'PLANEJADA', data_realizacao: '2026-10-01' }, today)).toBe(true);
    expect(isPlanejadaVencida({ qualificacao_status: 'PLANEJADA', data_conclusao: '2026-10-02' }, today)).toBe(false);
    expect(isPlanejadaVencida({ qualificacao_status: 'VENCIDA', data_realizacao: '2026-10-01' }, today)).toBe(false);
    expect(isPlanejadaVencida({ qualificacao_status: 'PLANEJADA', data_realizacao: 'invalida' }, today)).toBe(false);
  });

  it('keeps planned rescheduling dates bounded to tomorrow', () => {
    const today = new Date(2026, 9, 2, 15, 30);
    expect(getDataMinimaPlanejada(today)).toBe('2026-10-03');
    expect(sugerirNovaDataPlanejada({ data_realizacao: '2026-10-10' }, today)).toBe('2026-10-11');
    expect(sugerirNovaDataPlanejada({ data_conclusao: '2026-10-01' }, today)).toBe('2026-10-03');
    expect(sugerirNovaDataPlanejada(null, today)).toBe('2026-10-03');
  });
});
