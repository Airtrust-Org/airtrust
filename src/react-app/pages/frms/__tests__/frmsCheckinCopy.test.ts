import { describe, expect, it } from 'vitest';
import flightSource from '../FrmsFlightCheckinFadiga.tsx?raw';
import maintenanceSource from '../FrmsMaintenanceCheckin.tsx?raw';
import readinessSource from '../OperationalVigilanceTest.tsx?raw';

const sleepLabels = [
  'Menos de 4 horas',
  'Entre 4 e 5 horas',
  'Entre 5 e 6 horas',
  'Entre 6 e 7 horas',
  'Entre 7 e 8 horas',
  '8 horas ou mais',
];

describe('FRMS check-in copy', () => {
  it.each([
    ['pilotos', flightSource],
    ['mecânicos e inspetores', maintenanceSource],
  ])('usa faixas de sono legíveis no formulário de %s', (_form, text) => {
    for (const label of sleepLabels) expect(text).toContain(label);
    expect(text).not.toContain('4 a menos de 5');
    expect(text).not.toContain('5 a menos de 6');
    expect(text).not.toContain('6 a menos de 7');
    expect(text).not.toContain('7 a menos de 8');
  });

  it('não exibe duração prevista nas instruções do teste de prontidão', () => {
    expect(readinessSource).not.toContain('Duração prevista');
    expect(readinessSource).toContain(
      'Mantenha a tela ativa e evite conversar ou alternar de aplicativo durante o teste.',
    );
  });
});
