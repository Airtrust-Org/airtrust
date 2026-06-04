import { describe, expect, it } from 'vitest';
import {
  buildAgendaListPrintHtml,
  buildCalendarGridHtml,
  buildDailyAgendaPrintHtml,
  buildMonthlyAgendaPrintHtml,
  buildWeeklyAgendaPrintHtml,
} from '../monthlyAgendaPrint';

const sessions = [
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
];

describe('monthlyAgendaPrint', () => {
  it('gera relatorio A4 print-friendly com regras de quebra e tabela', () => {
    const html = buildMonthlyAgendaPrintHtml({
      monthDate: new Date(2026, 5, 1),
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions,
    });

    expect(html).toContain('@page { size: A4 landscape; margin: 10mm; }');
    expect(html).toContain('@media print');
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('page-break-inside: avoid');
    expect(html).toContain('.schedule-table thead { display: table-header-group; }');
    expect(html).toContain('class="schedule-table"');
    expect(html).toContain('SIM A320');
  });

  it('mantem A4 e layout compacto em calendario mensal, semanal, diario e agenda/lista', () => {
    const calendarHtml = buildCalendarGridHtml({
      monthDate: new Date(2026, 5, 1),
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions,
    });
    const weeklyHtml = buildWeeklyAgendaPrintHtml({
      weekStart: new Date('2026-06-08T00:00:00'),
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions,
    });
    const dailyHtml = buildDailyAgendaPrintHtml({
      date: new Date('2026-06-10T00:00:00'),
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions,
    });
    const agendaHtml = buildAgendaListPrintHtml({
      generatedAt: new Date('2026-06-04T12:00:00'),
      sessions,
    });

    expect(calendarHtml).toContain('@page { size: A4 portrait; margin: 10mm; }');
    expect(calendarHtml).toContain('min-height: 18mm;');

    expect(weeklyHtml).toContain('@page { size: A4 landscape; margin: 10mm; }');
    expect(weeklyHtml).toContain('.session-card');
    expect(weeklyHtml).toContain('overflow-wrap:anywhere;');

    expect(dailyHtml).toContain('@page { size: A4 portrait; margin: 10mm; }');
    expect(dailyHtml).toContain('Agenda Diária de Simuladores');
    expect(dailyHtml).toContain('class="dy-status');

    expect(agendaHtml).toContain('@page { size: A4 portrait; margin: 10mm; }');
    expect(agendaHtml).toContain('table-layout:fixed;');
    expect(agendaHtml).toContain('break-inside: avoid;');
  });

  it('mantem o shell da aplicacao fora do documento impresso e garante fundo branco', () => {
    const builders = [
      buildMonthlyAgendaPrintHtml({
        monthDate: new Date(2026, 5, 1),
        generatedAt: new Date('2026-06-04T12:00:00'),
        sessions,
      }),
      buildCalendarGridHtml({
        monthDate: new Date(2026, 5, 1),
        generatedAt: new Date('2026-06-04T12:00:00'),
        sessions,
      }),
      buildWeeklyAgendaPrintHtml({
        weekStart: new Date('2026-06-08T00:00:00'),
        generatedAt: new Date('2026-06-04T12:00:00'),
        sessions,
      }),
      buildDailyAgendaPrintHtml({
        date: new Date('2026-06-10T00:00:00'),
        generatedAt: new Date('2026-06-04T12:00:00'),
        sessions,
      }),
      buildAgendaListPrintHtml({
        generatedAt: new Date('2026-06-04T12:00:00'),
        sessions,
      }),
    ];

    for (const html of builders) {
      expect(html).toMatch(/background:\s*#fff/);
      expect(html).not.toContain('Painel');
      expect(html).not.toContain('Nova Sessão de Voo');
      expect(html).not.toContain('Agenda / Calendário');
      expect(html).not.toContain('backdrop');
      expect(html).not.toContain('100vh');
      expect(html).not.toContain('bg-black');
    }
  });
});
