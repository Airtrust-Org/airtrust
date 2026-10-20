import { describe, expect, it } from 'vitest';
import type { FrmsComplianceReportRow } from '../../lib/frms/db-service-relatorios';
import { buildFrmsMonthlyConsolidatedSummary } from '../../lib/frms/monthly-consolidated-summary';

function row(id: number, overrides: Partial<FrmsComplianceReportRow> = {}): FrmsComplianceReportRow {
  return {
    tripulante_id: String(id), nome: `QA ${id}`,
    dias_avaliados: 0, dias_conformes: 0, dias_violacao: 0,
    dias_nao_avaliados: 0, dias_mitigacao: 0, dias_atencao: 0,
    violacoes_normativas: [], fontes_normativas: [],
    violacoes: 0, alertas_criticos: 0, alertas_atencao: 0, alertas_aviso: 0,
    ...overrides,
  };
}

describe('FRMS resumo mensal consolidado — BOA/CBMMG', () => {
  it('não divulga métricas ou tamanho de escopo menor que cinco profissionais', () => {
    const summary = buildFrmsMonthlyConsolidatedSummary([row(1, { dias_violacao: 1 })], [], 1);
    expect(summary.status).toBe('SMALL_COHORT_SUPPRESSED');
    expect(summary.authorized_crew).toBeNull();
    expect(summary.represented_crew).toBeNull();
    expect(summary.indicators.dias_violacao.value).toBeNull();
    expect(summary.recorded_month_delta.dias_violacao).toBeNull();
    expect(JSON.stringify(summary)).not.toContain('QA 1');
  });

  it('suprime contagens de um a quatro e não revela deltas derivados', () => {
    const current = Array.from({ length: 8 }, (_, index) =>
      row(index, { dias_avaliados: 3, dias_conformes: 2, dias_violacao: index === 0 ? 1 : 0 }));
    const previous = Array.from({ length: 8 }, (_, index) =>
      row(index, { dias_avaliados: 2, dias_conformes: 2 }));
    const summary = buildFrmsMonthlyConsolidatedSummary(current, previous, 130);
    expect(summary.status).toBe('PARTIAL_COVERAGE');
    expect(summary.indicators.dias_violacao).toEqual({
      value: null, state: 'SMALL_CELL_SUPPRESSED',
    });
    expect(summary.recorded_month_delta.dias_violacao).toBeNull();
    expect(summary.indicators.dias_conformes.value).toBe(16);
    expect(summary.recorded_month_delta.dias_conformes).toBe(0);
  });

  it('ausência de registros não equivale a zero nem conformidade', () => {
    const summary = buildFrmsMonthlyConsolidatedSummary([], [], 130);
    expect(summary.status).toBe('NO_OBSERVATIONS');
    expect(summary.indicators.dias_conformes.state).toBe('NO_OBSERVATION');
    expect(summary.indicators.dias_conformes.value).toBeNull();
  });

  it('campos incompletos não viram zero e impedem comparação indevida', () => {
    const rows = Array.from({ length: 6 }, (_, index) => row(index, { dias_mitigacao: 2 }));
    (rows[0] as { dias_mitigacao: number | null }).dias_mitigacao = null;
    const summary = buildFrmsMonthlyConsolidatedSummary(rows, rows, 10);
    expect(summary.indicators.dias_mitigacao.state).toBe('INCOMPLETE_SOURCE');
    expect(summary.recorded_month_delta.dias_mitigacao).toBeNull();
  });

  it('não retorna nomes, IDs, KSS nem sono apesar de entradas individualizadas', () => {
    const current = Array.from({ length: 6 }, (_, index) => row(index, {
      nome: `CONFIDENCIAL ${index}`, dias_nao_avaliados: 2,
    }));
    const summary = buildFrmsMonthlyConsolidatedSummary(current, [], 130);
    const payload = JSON.stringify(summary);
    expect(payload).not.toMatch(/CONFIDENCIAL|tripulante_id|kss|sono_horas/i);
    expect(summary.indicators.dias_nao_avaliados.value).toBe(12);
    expect(summary.represented_crew).toBe(6);
  });
});
