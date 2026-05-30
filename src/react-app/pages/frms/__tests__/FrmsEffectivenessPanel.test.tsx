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
});
