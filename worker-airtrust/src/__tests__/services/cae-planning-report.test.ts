import { describe, expect, it } from 'vitest';
import { buildSimulatorPlanningApprovalReport } from './../../services/cae-planning-report';

describe('CAE approval report', () => {
  it('mantém sessão normal/compartilhada e ordena blocos cronologicamente', () => {
    const report = buildSimulatorPlanningApprovalReport({
      proposal_id: 1,
      generated_at: '2026-08-22T00:00:00Z',
      company_name: 'Empresa',
      status: 'AGUARDANDO_APROVACAO',
      planning_horizon_days: 90,
      roster_policy: 'FOLGA',
      blocks: [
        {
          slot_key: 'b', equipment: 'AW139', date: '2026-11-20', start_time: '10:00', end_time: '12:00', mode: 'COMPARTILHADA',
          participants: [{ employee_id: 1, employee_name: 'A', training_label: 'Inicial', session_label: 'S5', session_order: 5, roster_state: 'FOLGA' }],
        },
        {
          slot_key: 'a', equipment: 'AW139', date: '2026-11-20', start_time: '08:00', end_time: '10:00', mode: 'NORMAL',
          participants: [{ employee_id: 2, employee_name: 'B', training_label: 'Periódico', session_label: 'S1', session_order: 1, roster_state: 'FOLGA' }],
        },
      ],
      warnings: ['x', 'x'],
      approval: { required: true },
    });
    expect(report.blocks[0].slot_key).toBe('a');
    expect(report.blocks[1].mode).toBe('COMPARTILHADA');
    expect(report.warnings).toEqual(['x']);
  });
});
