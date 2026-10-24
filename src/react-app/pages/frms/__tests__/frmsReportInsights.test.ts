import { describe, expect, it } from 'vitest';
import { deriveFrmsReportInsights } from '../frmsReportInsights';

describe('FRMS: conclusões baseadas em evidência de relatório', () => {
  it('distingue violação, falta de avaliação e mitigação', () => {
    const items = deriveFrmsReportInsights('compliance', [
      { tripulante_id: 1, dias_violacao: 2, dias_nao_avaliados: 0 },
      { tripulante_id: 2, dias_violacao: 0, dias_nao_avaliados: 3, dias_mitigacao: 1 },
      { tripulante_id: 3 },
    ]);
    expect(items[0].title).toContain('1 profissional');
    expect(items[1].title).toContain('1 profissional');
    expect(items[1].explanation).toContain('1 linha(s)');
    expect(items[2].explanation).toContain('não são, por si, infrações');
  });
  it('preserva desconhecido em repouso e classificação', () => {
    const items = deriveFrmsReportInsights('mapa-fadiga', [
      { nivel_max: 'CRITICO', repouso_suficiente: 0 },
      { nivel_max: null, repouso_suficiente: null },
    ]);
    expect(items[0].title).toContain('1 profissional');
    expect(items[1].title).toContain('1 profissional');
    expect(items[1].explanation).toContain('1 linha(s)');
  });
  it('limita recorrência aos casos recebidos', () => {
    const items = deriveFrmsReportInsights('alertas-historico', [
      { tripulante_id: 5, nivel: 'CRITICO', resolvido_em: null },
      { tripulante_id: 5, nivel: 'ATENCAO', resolvido_em: '2026-10-10' },
      { tripulante_id: 6, nivel: 'VIOLACAO', resolvido_em: null },
    ]);
    expect(items[0].title).toContain('2 alerta(s)');
    expect(items[0].explanation).toContain('2 aberto(s)');
    expect(items[1].title).toContain('1 profissional');
    expect(items[1].explanation).toContain('apenas nas linhas retornadas');
  });
  it('não fabrica decisões sem dados', () => {
    expect(deriveFrmsReportInsights('compliance', [])).toEqual([]);
  });
});
