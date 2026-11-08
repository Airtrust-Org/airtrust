import { describe, expect, it } from 'vitest';
import { classifyDailyMonitorItem, indexCanonicalDailyAlerts, summarizeDailyMonitor } from '../frmsDailyMonitorRisk';

describe('FRMS Monitor — alertas canônicos e indicadores sem falsa aptidão', () => {
  it('promove score crítico calculado apesar da triagem subjetiva normal', () => {
    const item = { funcionario_id: 10, status: 'normal', score_fadiga: 12 };
    const summary = summarizeDailyMonitor([item], [
      { tripulante_id: 10, nivel: 'CRITICO' },
    ]);
    expect(classifyDailyMonitorItem(item, summary.alertIndex)).toBe('critical');
    expect(summary).toMatchObject({ complete: 1, critical: 1, attention: 0, riskPct: 100 });
  });

  it('promove atenção operacional mesmo com check-in recebido e subjetivamente normal', () => {
    const summary = summarizeDailyMonitor(
      [{ funcionario_id: 21, status: 'normal', score_fadiga: 0 }],
      [{ tripulante_id: 21, nivel: 'ATENCAO' }],
    );
    expect(summary).toMatchObject({ complete: 1, critical: 0, attention: 1, riskPct: 100, mediaScore: 0 });
  });

  it('agrega duplicatas por funcionário dando precedência ao alerta mais grave', () => {
    const index = indexCanonicalDailyAlerts([
      { tripulante_id: 15, nivel: 'ATENCAO' },
      { tripulante_id: '15', nivel: 'CRITICO' },
      { tripulante_id: 15, nivel: 'ATENCAO' },
    ]);
    expect(index.size).toBe(1);
    expect(index.get(15)).toBe('CRITICO');
  });

  it('não apresenta ausência ou dados incompletos como risco baixo nem dilui a taxa', () => {
    const summary = summarizeDailyMonitor([
      { funcionario_id: 1, status: 'normal', score_fadiga: 15 },
      { funcionario_id: 2, status: 'not_submitted' },
      { funcionario_id: 3, status: 'incomplete_checkin' },
      { funcionario_id: 4, status: 'no_duty' },
    ], [{ tripulante_id: 1, nivel: 'CRITICO' },
      { tripulante_id: 2, nivel: 'ATENCAO' }]);
    expect(summary).toMatchObject({ complete: 1, pending: 2, critical: 1, riskPct: 100 });
  });

  it('não transforma alerta pendente de coleta em classificação clínica de fadiga', () => {
    const alerts = indexCanonicalDailyAlerts([{ tripulante_id: 9, nivel: 'ATENCAO' }]);
    expect(classifyDailyMonitorItem({ funcionario_id: 9, status: 'not_submitted' }, alerts))
      .toBe('not_submitted');
    expect(classifyDailyMonitorItem({ funcionario_id: 9, status: 'incomplete_checkin' }, alerts))
      .toBe('incomplete_checkin');
  });

  it('mantém revisão obrigatória e dados desconhecidos sem status verde fictício', () => {
    const none = new Map<number, 'ATENCAO' | 'CRITICO'>();
    expect(classifyDailyMonitorItem({ funcionario_id: 4, status: 'normal', requires_operational_review: true }, none)).toBe('attention');
    expect(classifyDailyMonitorItem({ funcionario_id: 5, status: 'new_future_status' }, none)).toBe('unknown');
  });

  it('quando não há check-ins completos, não publica taxa de risco artificial 0%', () => {
    const summary = summarizeDailyMonitor(
      [{ funcionario_id: 1, status: 'not_submitted' }, { funcionario_id: 2, status: 'no_duty' }], [],
    );
    expect(summary).toMatchObject({ complete: 0, pending: 1, riskPct: null, mediaScore: null });
  });

  it('calcula uma taxa entre check-ins completos sem contar duas vezes o mesmo alerta', () => {
    const summary = summarizeDailyMonitor([
      { funcionario_id: 1, status: 'critical', score_fadiga: 35 },
      { funcionario_id: 2, status: 'normal', score_fadiga: 15 },
      { funcionario_id: 3, status: 'normal', score_fadiga: null },
      { funcionario_id: 4, status: 'normal', score_fadiga: 0 },
    ], [{ tripulante_id: 1, nivel: 'CRITICO' }, { tripulante_id: 1, nivel: 'CRITICO' }]);
    expect(summary).toMatchObject({ complete: 4, critical: 1, attention: 0, riskPct: 25 });
    expect(summary.mediaScore).toBeCloseTo((35 + 15 + 0) / 3);
  });
});
