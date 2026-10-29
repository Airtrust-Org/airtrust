import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrmsOperationalSnapshotItem } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import FrmsEffectivenessTimeline from '../components/FrmsEffectivenessTimeline';
import type { ConfigLimites } from '../frmsUtils';

const jornadasMock = vi.hoisted(() => vi.fn());

vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsJornadasEffectiveness: jornadasMock,
}));

vi.mock('recharts', () => ({
  CartesianGrid: () => null,
  Dot: () => null,
  Line: () => null,
  LineChart: ({ data, children }: { data: unknown; children?: ReactNode }) => (
    <div data-testid="frms-effectiveness-chart" data-chart={JSON.stringify(data)}>
      {children}
    </div>
  ),
  ReferenceArea: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

function snapshotWithCredit(credit: number | null | undefined): FrmsOperationalSnapshotItem {
  return {
    funcionario_id: 12,
    data_operacional: '2026-10-27',
    effectiveness_pct: 80,
    recovery_credit_points: credit,
    horas_voo_minutos: 0,
    duracao_jornada_minutos: 0,
  } as unknown as FrmsOperationalSnapshotItem;
}

function recoveryPoint(snapshotItems: FrmsOperationalSnapshotItem[]): number | null | undefined {
  render(
    <FrmsEffectivenessTimeline
      tripulanteId="12"
      config={{} as ConfigLimites}
      snapshotItems={snapshotItems}
    />,
  );
  const raw = screen.getByTestId('frms-effectiveness-chart').getAttribute('data-chart') ?? '[]';
  const points = JSON.parse(raw) as Array<{ recovery_points: number | null }>;
  expect(points).toHaveLength(1);
  return points[0]?.recovery_points;
}

describe('FRMS timeline — proveniência do crédito de recuperação', () => {
  beforeEach(() => {
    // A jornada legada possui um componente de 2,5 pt no mesmo dia.
    jornadasMock.mockReturnValue({
      data: [{
        data_apresentacao: '2026-10-27',
        effectiveness_pct: 80,
        effectiveness_componentes_json: '{"recuperacao":0.025}',
      }],
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
    jornadasMock.mockReset();
  });

  it('mantém componente histórico quando não há snapshot para a data', () => {
    expect(recoveryPoint([])).toBe(2.5);
  });

  const cases: Array<{ label: string; credit: number | null | undefined; expected: number | null }> = [
    { label: 'avaliação ausente (null)', credit: null, expected: null },
    { label: 'campo ausente (undefined)', credit: undefined, expected: null },
    { label: 'zero real', credit: 0, expected: 0 },
    { label: 'crédito positivo', credit: 1.5, expected: 1.5 },
    { label: 'crédito negativo', credit: -4, expected: -4 },
    { label: 'valor inválido', credit: Number.NaN, expected: null },
  ];

  it.each(cases)('usa snapshot autoritativo: $label', ({ credit, expected }) => {
    // Mesmo com 2,5 pt no componente legado, a ausência canônica não vira crédito.
    expect(recoveryPoint([snapshotWithCredit(credit)])).toBe(expected);
  });
});
