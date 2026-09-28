import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import FrmsEffectivenessPanel from '../components/FrmsEffectivenessPanel';

describe('FrmsEffectivenessPanel', () => {
  it('usa cor de anel coerente com status degradado/crítico', () => {
    const { container } = render(
      <FrmsEffectivenessPanel effectiveness_pct={52} effectiveness_nivel="Fadiga Severa" config={null} />,
    );

    const circles = container.querySelectorAll('svg circle');
    const progressCircle = circles[1];
    expect(progressCircle?.getAttribute('stroke')).toBe('#BE123C');
  });

  it('não expõe condição meteorológica interna em inglês', () => {
    const { queryByText, getAllByText } = render(
      <FrmsEffectivenessPanel
        effectiveness_pct={80}
        config={null}
        componentes={{ processo_s: 0, processo_c: 0, repouso: 0, hv: 0, duracao: 0 }}
        operationalLoad={{
          policy_version: 'test', landings_count: 1, temperature_max_c: null,
          weather_evidence_quality: 'NOT_APPLICABLE', imc_evidence_quality: 'OBSERVED', data_quality: 'COMPLETE',
          landings_delta: 0, temperature_delta: 0, imc_delta: 0, total_delta: 0,
          imc_legs: [{
            legId: '1', departure: { condition: 'INDETERMINATE' }, arrival: { condition: 'VMC' },
            departureDelta: 0, arrivalDelta: 0, totalDelta: 0,
          }],
        }}
      />,
    );

    expect(queryByText('INDETERMINATE')).not.toBeInTheDocument();
    expect(getAllByText(/Indeterminada/).length).toBeGreaterThan(0);
  });

});
