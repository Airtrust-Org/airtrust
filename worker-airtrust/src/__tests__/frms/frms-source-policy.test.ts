import { describe, expect, it } from 'vitest';
import {
  resolveFrmsSourceStatus,
  shouldUseForOperationalAlerts,
  shouldUseForOperationalFrms,
  shouldUseForRolling,
} from '../../lib/frms/frms-source-policy';

describe('frms source policy', () => {
  it('usa SIGVOOS como unica fonte operacional canonica', () => {
    const decision = resolveFrmsSourceStatus({ origem: 'SIGVOOS' });

    expect(decision).toMatchObject({
      fonte_original: 'SIGVOOS',
      fonte_canonica: 'SIGVOOS',
      source_status: 'CANONICAL_SIGVOOS',
      usado_no_frms_operacional: true,
      usado_em_alertas: true,
      usado_em_rolling: true,
    });
    expect(shouldUseForOperationalFrms({ origem: 'SIGVOOS' })).toBe(true);
  });

  it('marca FIRA sem SIGVOOS como pendente e fora de rolling/alertas', () => {
    const decision = resolveFrmsSourceStatus({ origem: 'FIRA' });

    expect(decision.source_status).toBe('PENDENTE_SIGVOOS');
    expect(decision.integridade_fonte).toContain('FIRA_NAO_OPERACIONAL');
    expect(decision.integridade_fonte).toContain('FONTE_NAO_CANONICA');
    expect(decision.integridade_fonte).toContain('PENDENTE_SIGVOOS');
    expect(shouldUseForOperationalFrms({ origem: 'FIRA' })).toBe(false);
    expect(shouldUseForRolling({ origem: 'FIRA' })).toBe(false);
    expect(shouldUseForOperationalAlerts({ origem: 'FIRA' })).toBe(false);
  });

  it('mantem FIRA fora do operacional mesmo quando ha SIGVOOS na mesma data', () => {
    const decision = resolveFrmsSourceStatus(
      { origem: 'FIRA' },
      { hasCanonicalForSameDay: true },
    );

    expect(decision.source_status).toBe('FIRA_NAO_OPERACIONAL');
    expect(decision.usado_no_frms_operacional).toBe(false);
  });
});
