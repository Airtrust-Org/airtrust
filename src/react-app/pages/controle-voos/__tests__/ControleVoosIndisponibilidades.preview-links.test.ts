import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosIndisponibilidades.tsx'),
  'utf8',
);

describe('ControleVoosIndisponibilidades preview links', () => {
  it('não transforma IDs mockados em links para detalhes operacionais reais', () => {
    expect(source).not.toContain('to={`/controle-voos/voos/${vooId}`}');
    expect(source).not.toContain("import { Link } from 'react-router-dom'");
    expect(source).toContain('Referências ilustrativas do preview; não abrem registros operacionais.');
  });
});
