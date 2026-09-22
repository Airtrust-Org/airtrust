import { describe, expect, it } from 'vitest';
import { buildDailyComplianceSnapshots } from '../../services/training-compliance-snapshots';
import { selectDueThreshold } from '../../services/training-compliance-notifications';

describe('training compliance intelligence primitives', () => {
  it('builds company, sector, role and sector+role snapshots without PII', () => {
    const data = buildDailyComplianceSnapshots(
      [
        { setor_id: 10, funcao_id: 2, total_obrigatorios: 2, conformes: 1, vencendo: 0, vencidos: 1, nao_realizados: 0, em_andamento: 0 },
        { setor_id: 10, funcao_id: 3, total_obrigatorios: 2, conformes: 2, vencendo: 1, vencidos: 0, nao_realizados: 0, em_andamento: 0 },
        { setor_id: 11, funcao_id: 2, total_obrigatorios: 1, conformes: 0, vencendo: 0, vencidos: 0, nao_realizados: 1, em_andamento: 0 },
      ],
      '2026-09-21',
    );

    expect(data.find((row) => row.setor_id === 0 && row.funcao_id === 0)).toMatchObject({
      pessoas: 3,
      pessoas_com_pendencia: 3,
      requisitos_obrigatorios: 5,
      conformes: 3,
      vencidos: 1,
      nao_realizados: 1,
      compliance_pct: 60,
    });
    expect(data.find((row) => row.setor_id === 10 && row.funcao_id === 0)).toMatchObject({ pessoas: 2, requisitos_obrigatorios: 4, conformes: 3, compliance_pct: 75 });
    expect(data.find((row) => row.setor_id === 0 && row.funcao_id === 2)).toMatchObject({ pessoas: 2, requisitos_obrigatorios: 3, conformes: 1, compliance_pct: 33.3 });
    expect(data.find((row) => row.setor_id === 10 && row.funcao_id === 2)).toMatchObject({ pessoas: 1, requisitos_obrigatorios: 2, conformes: 1, compliance_pct: 50 });
  });

  it('maps due dates to deterministic reminder stages', () => {
    const stages = [30, 15, 7, 0, -7, -15, -30];
    expect(selectDueThreshold(30, stages)).toBe(30);
    expect(selectDueThreshold(28, stages)).toBe(30);
    expect(selectDueThreshold(14, stages)).toBe(15);
    expect(selectDueThreshold(4, stages)).toBe(7);
    expect(selectDueThreshold(0, stages)).toBe(0);
    expect(selectDueThreshold(-3, stages)).toBe(0);
    expect(selectDueThreshold(-10, stages)).toBe(-7);
    expect(selectDueThreshold(-45, stages)).toBe(-30);
  });
});
