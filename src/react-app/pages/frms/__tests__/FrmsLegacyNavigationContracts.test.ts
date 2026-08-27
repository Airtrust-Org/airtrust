import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(`${process.cwd()}/src/react-app/App.tsx`, 'utf8');
const layoutSource = readFileSync(`${process.cwd()}/src/react-app/components/AppLayout.tsx`, 'utf8');

describe('FRMS legacy navigation contracts', () => {
  it('mantém controle-operacional apenas como redirect declarativo sem lazy chunk', () => {
    expect(appSource).toContain('path="/frms/controle-operacional"');
    expect(appSource).toContain('element={<Navigate to="/frms" replace />}');
    expect(appSource).not.toContain("import('./pages/frms/FrmsControleOperacional')");
    expect(appSource).not.toContain('<FrmsControleOperacional />');
  });

  it('alinha o submenu móvel ao vocabulário Operação Casos Administração', () => {
    expect(layoutSource).toContain('to="/frms"');
    expect(layoutSource).toContain('> Operação');
    expect(layoutSource).toContain('to="/frms/alertas"');
    expect(layoutSource).toContain('> Casos');
    expect(layoutSource).toContain('to="/frms/configuracoes"');
    expect(layoutSource).toContain('> Administração');
    expect(layoutSource).not.toContain('> Controle operacional');
  });
});
