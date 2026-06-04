import { describe, expect, it } from 'vitest';
import { buildMonthlyAgendaPrintHtml } from '../monthlyAgendaPrint';

describe('monthlyAgendaPrint', () => {
  it('gera relatorio A4 print-friendly com regras de quebra e tabela', () => {
    const html = buildMonthlyAgendaPrintHtml({
      monthDate: new Date(2026, 5, 1),
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions: [
        {
          id: 1,
          simulador_nome: 'SIM A320',
          simulador_tipo: 'A320',
          data: '2026-06-10',
          hora_inicio: '08:00',
          hora_fim: '10:00',
          tipo_sessao: 'TREINAMENTO',
          tema_sessao: 'LOFT',
          instrutor_nome: 'Instrutor Teste',
          status: 'AGENDADO',
          participantes: [{ nome: 'Tripulante Teste', funcao: 'PIC' }],
        },
      ],
    });

    expect(html).toContain('@page { size: A4 landscape; margin: 10mm; }');
    expect(html).toContain('@media print');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('page-break-inside: avoid');
    expect(html).toContain('.schedule-table thead { display: table-header-group; }');
    expect(html).toContain('class="schedule-table"');
    expect(html).toContain('SIM A320');
  });
});
