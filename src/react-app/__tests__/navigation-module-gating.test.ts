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
    expect(visible.find((item) => item.id === 'pessoas')?.children?.map((item) => item.id)).toEqual(
      ['funcionarios', 'pasta-virtual'],
    );
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

  it('oculta modulos de desenvolvimento para admin nao allowlisted', () => {
    const visible = getVisibleNavigationItems(
      NAVIGATION_CONFIG.main_menu,
      ['dashboard', 'mro', 'controle_voos'],
      {
        user: {
          email: 'admin@empresa.com',
          role: 'ADMINISTRADOR',
        },
      },
    );

    expect(visible.map((item) => item.id)).not.toContain('mro');
    expect(visible.map((item) => item.id)).not.toContain('controle_voos');
  });

  it('exibe dashboard operacional para gestor setorial', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, ['dashboard'], {
      user: {
        email: 'gestor@empresa.com',
        role: 'GESTOR',
      },
    });

    expect(visible.map((item) => item.id)).toContain('dashboard');
  });

  it('exibe modulos de desenvolvimento para admin principal allowlisted', () => {
    const visible = getVisibleNavigationItems(
      NAVIGATION_CONFIG.main_menu,
      ['dashboard', 'mro', 'controle_voos'],
      {
        user: {
          email: 'filipe.daumas@icloud.com',
          role: 'ADMINISTRADOR',
        },
      },
    );

    expect(visible.map((item) => item.id)).toContain('mro');
    expect(visible.map((item) => item.id)).toContain('controle_voos');
  });

  it('exibe dashboard administrativo para admin principal allowlisted', () => {
    const visible = getVisibleNavigationItems(NAVIGATION_CONFIG.main_menu, ['dashboard'], {
      user: {
        email: 'filipe.daumas@icloud.com',
        role: 'ADMINISTRADOR',
      },
    });

    expect(visible.map((item) => item.id)).toContain('dashboard');
  });
});
