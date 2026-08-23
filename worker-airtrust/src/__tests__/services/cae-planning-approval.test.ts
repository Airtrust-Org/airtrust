import { describe, expect, it } from 'vitest';
import {
  canMaterializeSimulatorSessions,
  decideSimulatorProposal,
  submitSimulatorProposalForApproval,
} from './../../services/cae-planning-approval';

describe('CAE approval gate', () => {
  it('submete PROPOSTO mantendo status de planejamento e marcando aprovação PENDENTE', () => {
    expect(submitSimulatorProposalForApproval({ planning_status: 'PROPOSTO', approval_required: true }))
      .toEqual({ planning_status: 'PROPOSTO', approval_status: 'PENDENTE' });
  });

  it('aprova somente quando revalidação live está verde', () => {
    const result = decideSimulatorProposal({
      proposal_id: 1,
      current_planning_status: 'PROPOSTO',
      current_approval_status: 'PENDENTE',
      decision: 'APROVAR',
      actor: { user_id: 10, role: 'manager' },
      decided_at: '2026-08-22T22:00:00Z',
      revalidation: { ok: true, issues: [] },
    });
    expect(result.ok).toBe(true);
    expect(result.next_planning_status).toBe('CONFIRMADO');
    expect(result.next_approval_status).toBe('APROVADO');
  });

  it('mudança material bloqueia aprovação e manda replanejar', () => {
    const result = decideSimulatorProposal({
      proposal_id: 1,
      current_planning_status: 'PROPOSTO',
      current_approval_status: 'PENDENTE',
      decision: 'APROVAR',
      actor: { user_id: 10, role: 'manager' },
      decided_at: '2026-08-22T22:00:00Z',
      revalidation: {
        ok: false,
        issues: [{
          code: 'ROSTER_POLICY_NO_LONGER_SATISFIED',
          severity: 'BLOCK',
          message: 'Escala mudou.',
        }],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.next_planning_status).toBe('REPLANEJAR');
    expect(result.next_approval_status).toBe('DEVOLVIDO');
  });

  it('somente confirmado + aprovação válida materializa sessão real', () => {
    expect(canMaterializeSimulatorSessions({ planning_status: 'PROPOSTO', approval_status: 'PENDENTE' })).toBe(false);
    expect(canMaterializeSimulatorSessions({ planning_status: 'CONFIRMADO', approval_status: 'PENDENTE' })).toBe(false);
    expect(canMaterializeSimulatorSessions({ planning_status: 'CONFIRMADO', approval_status: 'APROVADO' })).toBe(true);
    expect(canMaterializeSimulatorSessions({ planning_status: 'CONFIRMADO', approval_status: 'NAO_EXIGIDO' })).toBe(true);
  });
});
