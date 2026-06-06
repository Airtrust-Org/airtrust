import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildConflictEvents,
  dedupeIntegratedEvents,
  eventsOverlap,
  groupIntegratedEmployeeMonths,
  parseIntegratedMonth,
  summarizeEvents,
  type IntegratedMonthlyEvent,
} from '../../services/escala-mensal-integrada';

function event(overrides: Partial<IntegratedMonthlyEvent>): IntegratedMonthlyEvent {
  return {
    id: 'event-1',
    source: 'ESCALA',
    sourceId: '1',
    employeeId: '10',
    employeeName: 'Tripulante Teste',
    date: '2026-06-10',
    allDay: false,
    startAt: '2026-06-10T08:00:00-03:00',
    endAt: '2026-06-10T10:00:00-03:00',
    type: 'TESTE',
    title: 'Evento',
    severity: 'INFO',
    status: 'ATIVO',
    blocksAllocation: false,
    requiresAction: false,
    ...overrides,
  };
}

describe('escala-mensal-integrada pure helpers', () => {
  it('parseIntegratedMonth calcula primeiro e último dia do mês sem deslocar datas', () => {
    const month = parseIntegratedMonth('2026-06');

    expect(month.startDate).toBe('2026-06-01');
    expect(month.endDate).toBe('2026-06-30');
    expect(month.days).toHaveLength(30);
    expect(month.days[0]).toBe('2026-06-01');
    expect(month.days[29]).toBe('2026-06-30');
  });

  it('eventsOverlap não cria conflito para eventos adjacentes', () => {
    const a = event({ id: 'a', startAt: '2026-06-10T08:00:00-03:00', endAt: '2026-06-10T10:00:00-03:00' });
    const b = event({ id: 'b', startAt: '2026-06-10T10:00:00-03:00', endAt: '2026-06-10T12:00:00-03:00' });

    expect(eventsOverlap(a, b)).toBe(false);
  });

  it('eventsOverlap identifica evento que atravessa meia-noite', () => {
    const a = event({ id: 'a', date: '2026-06-10', startAt: '2026-06-10T22:30:00-03:00', endAt: '2026-06-11T01:00:00-03:00' });
    const b = event({ id: 'b', date: '2026-06-11', startAt: '2026-06-11T00:30:00-03:00', endAt: '2026-06-11T02:00:00-03:00' });

    expect(eventsOverlap(a, b)).toBe(true);
  });

  it('eventsOverlap ignora cancelados', () => {
    const a = event({ id: 'a', status: 'CANCELADO' });
    const b = event({ id: 'b' });

    expect(eventsOverlap(a, b)).toBe(false);
  });

  it('dedupeIntegratedEvents funde apenas a mesma fonte, origem, tripulante, dia e horário', () => {
    const first = event({ id: 'a', source: 'SIMULADOR', sourceId: 33 });
    const duplicateBlocking = event({
      id: 'b',
      source: 'SIMULADOR',
      sourceId: 33,
      severity: 'BLOCKING',
      blocksAllocation: true,
    });
    const distinct = event({ id: 'c', source: 'SIMULADOR', sourceId: 34 });

    const deduped = dedupeIntegratedEvents([first, duplicateBlocking, distinct]);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((item) => item.sourceId === 33)?.severity).toBe('BLOCKING');
  });

  it('buildConflictEvents cria conflito único para compromisso simultâneo com escala', () => {
    const escala = event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1', title: 'Escala operacional' });
    const treinamento = event({
      id: 'treinamento',
      source: 'TREINAMENTO',
      sourceId: 44,
      title: 'Treinamento HUET',
      startAt: '2026-06-10T09:00:00-03:00',
      endAt: '2026-06-10T11:00:00-03:00',
    });

    const conflicts = buildConflictEvents([escala, treinamento]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      severity: 'CONFLICT',
      blocksAllocation: false,
      requiresAction: true,
      title: 'Conflito com escala operacional',
    });
  });

  it('buildConflictEvents transforma indisponibilidade sobreposta em bloqueio determinístico', () => {
    const escala = event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1' });
    const indisponibilidade = event({
      id: 'ferias',
      source: 'INDISPONIBILIDADE',
      sourceId: 'sit-1',
      allDay: true,
      startAt: null,
      endAt: null,
      status: 'FERIAS',
      blocksAllocation: true,
    });

    const conflicts = buildConflictEvents([escala, indisponibilidade]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('BLOCKING');
    expect(conflicts[0].blocksAllocation).toBe(true);
  });

  it('summarizeEvents reconcilia totais com itens detalhados', () => {
    const items = [
      event({ id: 'info', severity: 'INFO' }),
      event({ id: 'warning', severity: 'WARNING' }),
      event({ id: 'conflict', severity: 'CONFLICT' }),
      event({ id: 'blocking', severity: 'BLOCKING', blocksAllocation: true }),
    ];

    expect(summarizeEvents(items)).toEqual({
      events: 4,
      warnings: 1,
      conflicts: 1,
      blockingIssues: 1,
    });
  });

  it('groupIntegratedEmployeeMonths mantém buckets por dia e resumo por tripulante coerentes', () => {
    const month = parseIntegratedMonth('2026-06');
    const events = [
      event({ id: 'escala', source: 'ESCALA', sourceId: 'ea-1' }),
      event({ id: 'treinamento', source: 'TREINAMENTO', sourceId: 1 }),
      event({ id: 'qual', source: 'QUALIFICACAO', sourceId: 2, severity: 'WARNING' }),
      event({ id: 'frms', source: 'FRMS', sourceId: '3', severity: 'BLOCKING', blocksAllocation: true }),
      event({ id: 'conflito', source: 'OUTRO', sourceId: null, severity: 'CONFLICT' }),
    ];

    const grouped = groupIntegratedEmployeeMonths(
      month,
      [{ employeeId: '10', employeeName: 'Tripulante Teste', role: 'PIC', base: 'SBSP' }],
      events,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].summary).toMatchObject({
      scheduledDays: 1,
      trainingEvents: 1,
      qualificationWarnings: 1,
      frmsWarnings: 1,
      conflicts: 1,
      blockingIssues: 1,
    });
    expect(grouped[0].days['2026-06-10'].operationalAssignments).toHaveLength(1);
    expect(grouped[0].days['2026-06-10'].commitments).toHaveLength(1);
    expect(grouped[0].days['2026-06-10'].alerts).toHaveLength(2);
    expect(grouped[0].days['2026-06-10'].conflicts).toHaveLength(1);
  });
});

describe('escala-mensal-integrada training source contract', () => {
  const source = readFileSync(
    new URL('../../services/escala-mensal-integrada.ts', import.meta.url).pathname,
    'utf8',
  );

  it('consolida participantes e instrutores por turma', () => {
    expect(source).toContain('FROM treinamentos_instrutores');
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain('MAX(is_instrutor)');
    expect(source).toContain("participationRole:");
  });

  it('suprime simulador quando a sessão já está vinculada ao dia da turma', () => {
    expect(source).toContain('td.sessao_id = sa.id');
    expect(source).toContain('tp.funcionario_id = sp.funcionario_id');
    expect(source).toContain('AND NOT EXISTS');
  });

  it('marca conflito de recurso por simulador, aeronave ou local sobreposto', () => {
    expect(source).toContain('other_day.simulador_id = td.simulador_id');
    expect(source).toContain('other_day.aeronave_id = td.aeronave_id');
    expect(source).toContain('AS resource_conflict');
    expect(source).toContain("severity: Number(row.resource_conflict || 0) === 1 ? 'CONFLICT'");
  });
});
