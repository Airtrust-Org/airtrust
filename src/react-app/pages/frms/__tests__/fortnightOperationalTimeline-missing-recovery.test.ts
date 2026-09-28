import { describe, expect, it } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { buildFortnightTimeline } from '../fortnightOperationalTimeline';

function item(recovery_credit_points: number | null): FrmsOperationalSnapshotItem {
  return {
    data_operacional: '2026-09-27',
    funcionario_id: 10,
    teve_jornada: false,
    teve_atividade_frms: false,
    horas_voo_minutos: 0,
    duracao_jornada_minutos: 0,
    checkin_status: 'AUSENTE',
    sleep_data_source: 'AUSENTE',
    wake_data_source: 'AUSENTE',
    jornada_data_source: 'AUSENTE',
    snapshot_status: 'INCOMPLETO',
    recovery_credit_points,
    recovery_state: recovery_credit_points == null ? null : 'PARTIAL',
    alertas: [],
  } as FrmsOperationalSnapshotItem;
}

describe('fortnight timeline missing recovery semantics', () => {
  it('não converte ausência em zero', () => {
    const missing = buildFortnightTimeline([item(null)], {
      periodStart: '2026-09-27',
      periodEnd: '2026-09-27',
    });
    const realZero = buildFortnightTimeline([item(0)], {
      periodStart: '2026-09-27',
      periodEnd: '2026-09-27',
    });

    expect(missing.days[0].recovery_credit_points).toBeNull();
    expect(realZero.days[0].recovery_credit_points).toBe(0);
  });
});
