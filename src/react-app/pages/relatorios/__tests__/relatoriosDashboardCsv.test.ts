import { describe, expect, it } from 'vitest';
import { buildRelatoriosDashboardCsv } from '../relatoriosDashboardCsv';

describe('buildRelatoriosDashboardCsv', () => {
  it('exports only the report data already loaded by the dashboard', () => {
    const csv = buildRelatoriosDashboardCsv({
      certMes: [{ mes: '2026-08', total: 12 }],
      complianceSetor: [{ setor: 'Operações; Offshore', taxa_compliance: 97 }],
      simUso: [{ nome: 'AW139 "A"', total_sessoes: 8 }],
      treinCat: [{ categoria: 'CRM', total: 5 }],
    });

    expect(csv).toContain('Seção;Categoria;Valor');
    expect(csv).toContain('Certificações por mês;2026-08;12');
    expect(csv).toContain('Compliance por setor;"Operações; Offshore";97');
    expect(csv).toContain('Uso de simuladores;"AW139 ""A""";8');
    expect(csv).toContain('Treinamentos por categoria;CRM;5');
    expect(csv).not.toContain('/relatorios/exportar-csv');
  });
});
