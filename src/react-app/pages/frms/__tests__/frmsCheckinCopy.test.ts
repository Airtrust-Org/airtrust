import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

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
    'src/react-app/pages/frms/FrmsFlightCheckinFadiga.tsx',
    'src/react-app/pages/frms/FrmsMaintenanceCheckin.tsx',
  ])('usa faixas de sono legiveis em %s', (path) => {
    const text = source(path);

    for (const label of sleepLabels) expect(text).toContain(label);
    expect(text).not.toContain('4 a menos de 5');
    expect(text).not.toContain('5 a menos de 6');
    expect(text).not.toContain('6 a menos de 7');
    expect(text).not.toContain('7 a menos de 8');
  });

  it('nao exibe duracao prevista nas instrucoes do teste de prontidao', () => {
    const text = source('src/react-app/pages/frms/OperationalVigilanceTest.tsx');

    expect(text).not.toContain('Duração prevista');
    expect(text).toContain('Mantenha a tela ativa e evite conversar ou alternar de aplicativo durante o teste.');
  });
});
