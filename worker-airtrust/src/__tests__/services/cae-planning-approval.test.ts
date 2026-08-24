import type { D1Database } from '@cloudflare/workers-types';
import { describe, expect, it } from 'vitest';
import {
  canMaterializeSimulatorSessions,
  decideSimulatorProposal,
  executeSimulatorPlanningApproval,
  submitSimulatorProposalForApproval,
} from './../../services/cae-planning-approval';

describe('CAE approval gate', () => {
  it('submete PROPOSTO mantendo status de planejamento e marcando aprovação PENDENTE', () => {
    expect(submitSimulatorProposalForApproval({ planning_status: 'PROPOSTO', approval_required: true }))
      .toEqual({ planning_status: 'PROPOSTO', approval_status: 'PENDENTE' });
  });

  it('rejeita SUBMETER em estado inválido com falha controlada, sem lançar exceção', async () => {
    const db = {
      prepare(sql: string) {
        return {
          bind() {
            return {
              async first() {
                if (sql.includes('FROM treinamentos_planejados')) {
                  return {
                    planejamento_status: 'AGUARDANDO_DISPONIBILIDADE',
                    planejamento_aprovacao_status: 'RASCUNHO',
                    planejamento_snapshot_json: null,
                  };
                }
                if (sql.includes('FROM empresas_config')) {
                  return { planejamento_simulador_aprovacao_obrigatoria: 1 };
                }
                return null;
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    } as unknown as D1Database;

    const result = await executeSimulatorPlanningApproval({
      db,
      empresaId: 999050,
      planningId: 4,
      action: 'SUBMIT',
      userId: 8,
      userName: 'manager',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_APPROVAL_SUBMISSION_STATE:AGUARDANDO_DISPONIBILIDADE');
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
