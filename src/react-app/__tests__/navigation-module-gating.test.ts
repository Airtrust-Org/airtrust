import { describe, expect, it } from 'vitest';
import { NAVIGATION_CONFIG } from '../navigation.config';
import { getVisibleNavigationItems } from '../lib/module-access';

describe('navigation module gating', () => {
  it('preserva navegacao principal para empresa sem modulos_ativos', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, null);

    expect(visible.map((item) => item.id)).toContain('lms');
    expect(visible.map((item) => item.id)).toContain('hospedagem');
  });

  it('mostra modulo piloto quando explicitamente ativo', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, [
      'dashboard',
      'funcionarios',
    ]);

    expect(visible.map((item) => item.id)).toContain('dashboard');
    expect(visible.find((item) => item.id === 'pessoas')?.children?.map((item) => item.id)).toEqual([
      'funcionarios',
      'pasta-virtual',
    ]);
  });

  it('oculta modulo beta quando inativo', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, [
      'dashboard',
      'funcionarios',
    ]);

    expect(visible.map((item) => item.id)).not.toContain('lms');
    expect(visible.map((item) => item.id)).not.toContain('hospedagem');
  });

  it('mostra modulo beta quando explicitamente ativo', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, [
      'dashboard',
      'funcionarios',
      'lms',
      'hospedagem',
    ]);

    expect(visible.map((item) => item.id)).toContain('lms');
    expect(visible.map((item) => item.id)).toContain('hospedagem');
  });

  it('nao mostra SIGVOOS sem ativacao explicita', () => {
    expect(getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, ['dashboard'])).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ id: 'sigvoos' })]),
    );
  });

  it('mantem ocultos treinamentos e SGSO no menu principal enquanto nao ha item dedicado', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, [
      'dashboard',
      'funcionarios',
      'lms',
      'sgso',
      'treinamentos_planejados',
    ]);

    expect(visible.map((item) => item.id)).not.toContain('sgso');
    expect(visible.map((item) => item.id)).not.toContain('treinamentos_planejados');
  });
});
