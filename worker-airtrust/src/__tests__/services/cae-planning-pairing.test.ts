import { describe, expect, it } from 'vitest';
import { resolveSimulatorPlanningConfig } from './../../services/cae-planning-policy';
import {
  buildCaePairingCandidates,
  evaluateCaePairingCandidate,
  type CaeParticipantSessionNeed,
} from './../../services/cae-planning-pairing';

const config = resolveSimulatorPlanningConfig({
  planejamento_simulador_antecedencia_dias: 90,
  planejamento_simulador_regra_quinzena: 'FOLGA',
  planejamento_simulador_preferencia_sessoes_por_dia: 2,
  planejamento_simulador_preferencia_minutos_por_dia: 240,
  planejamento_simulador_permitir_quebra_preferencia: 1,
  planejamento_simulador_permitir_sessao_compartilhada: 1,
  planejamento_simulador_preferir_mesmo_treinamento: 1,
  planejamento_simulador_preferir_mesma_sessao: 1,
  planejamento_simulador_aprovacao_obrigatoria: 1,
});

function need(params: {
  employee: number;
  training: string;
  session: string;
  equipment?: string;
  roster?: 'FOLGA' | 'TRABALHO';
}): CaeParticipantSessionNeed {
  return {
    employee_id: params.employee,
    training_id: params.training,
    expiry_date: '2026-11-30',
    roster_state: params.roster || 'FOLGA',
    session: {
      training_id: params.training,
      session_model_id: params.session,
      session_order: 1,
      duration_minutes: 120,
      equipment: params.equipment || 'AW139',
    },
  };
}

describe('CAE pairing dinâmico', () => {
  it('prefere sessão NORMAL quando treinamento e modelo são iguais', async () => {
    const result = await evaluateCaePairingCandidate({
      left: need({ employee: 1, training: 'PER', session: 'S1' }),
      right: need({ employee: 2, training: 'PER', session: 'S1' }),
      config,
      resolveSharedCompatibility: async () => ({ compatible: false, fingerprint: 'unused' }),
    });
    expect(result?.mode).toBe('NORMAL');
    expect(result?.preference_penalty).toBe(0);
  });

  it('permite sessão COMPARTILHADA com treinamentos/sessões diferentes quando regra canônica permite', async () => {
    const result = await evaluateCaePairingCandidate({
      left: need({ employee: 1, training: 'INI', session: 'I5' }),
      right: need({ employee: 2, training: 'PER', session: 'P1' }),
      config,
      resolveSharedCompatibility: async () => ({
        compatible: true,
        fingerprint: 'simulador-rule-v1:INI-I5|PER-P1',
      }),
    });
    expect(result?.mode).toBe('COMPARTILHADA');
    expect(result?.compatibility_fingerprint).toContain('simulador-rule-v1');
  });

  it('não usa quinzena gravada: bloqueia usando o estado live da data candidata', async () => {
    const result = await evaluateCaePairingCandidate({
      left: need({ employee: 1, training: 'PER', session: 'S1', roster: 'TRABALHO' }),
      right: need({ employee: 2, training: 'PER', session: 'S1', roster: 'FOLGA' }),
      config,
      resolveSharedCompatibility: async () => ({ compatible: true, fingerprint: 'x' }),
    });
    expect(result).toBeNull();
  });

  it('ordena NORMAL antes de compartilhada quando ambas são válidas', async () => {
    const needs = [
      need({ employee: 1, training: 'PER', session: 'S1' }),
      need({ employee: 2, training: 'PER', session: 'S1' }),
      need({ employee: 3, training: 'INI', session: 'I5' }),
    ];
    const result = await buildCaePairingCandidates({
      needs,
      config,
      resolveSharedCompatibility: async () => ({ compatible: true, fingerprint: 'shared-ok' }),
    });
    expect(result[0].mode).toBe('NORMAL');
  });
});
