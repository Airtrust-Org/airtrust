import { describe, expect, it } from 'vitest';
import { resolveFrmsFichaBack } from '../FrmsFichaTripulante';

/**
 * N-10 — Funcionários > FRMS/Fadiga: modelo de navegação coerente.
 *
 * `/frms/tripulante/:id` é PÁGINA independente. O botão "Voltar" só retorna à
 * Ficha do Funcionário quando a página foi aberta a partir dela (`?origem=ficha`);
 * qualquer outra entrada (operação, casos, acesso direto por URL) preserva o
 * comportamento canônico do FRMS.
 */
describe('resolveFrmsFichaBack', () => {
  it('volta para a ficha do funcionário quando origem=ficha', () => {
    expect(resolveFrmsFichaBack('ficha', '30')).toEqual({
      target: '/funcionarios/30',
      label: 'Voltar à ficha',
    });
  });

  it('volta para /frms no acesso direto por URL (sem origem)', () => {
    expect(resolveFrmsFichaBack(null, '30')).toEqual({
      target: '/frms',
      label: 'Voltar',
    });
  });

  it('preserva o destino canônico do FRMS para outras origens', () => {
    expect(resolveFrmsFichaBack('operacao', '30').target).toBe('/frms');
    expect(resolveFrmsFichaBack('casos', '30').target).toBe('/frms');
  });

  it('não constrói rota de ficha com id inválido mesmo com origem=ficha', () => {
    expect(resolveFrmsFichaBack('ficha', undefined).target).toBe('/frms');
    expect(resolveFrmsFichaBack('ficha', 'abc').target).toBe('/frms');
    expect(resolveFrmsFichaBack('ficha', '0').target).toBe('/frms');
  });
});
