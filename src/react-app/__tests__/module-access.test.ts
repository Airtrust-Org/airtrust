import { describe, expect, it } from 'vitest';
import {
  canAccessModule,
  expandActiveModuleKeys,
  getModuleKeyForPath,
  hasExplicitModuleConfig,
  isLegacyPresetConfig,
} from '../lib/module-access';

describe('module access helper', () => {
  it('permite acesso legado quando modulos_ativos e null ou undefined', () => {
    expect(canAccessModule('dashboard', null)).toBe(true);
    expect(canAccessModule('funcionarios', undefined)).toBe(true);
  });

  it('bloqueia modulo nao listado quando modulos_ativos e array', () => {
    expect(canAccessModule('lms', ['dashboard', 'funcionarios'])).toBe(false);
    expect(canAccessModule('funcionarios', ['dashboard', 'funcionarios'])).toBe(true);
    expect(canAccessModule('sgso', ['dashboard', 'funcionarios'])).toBe(false);
    expect(canAccessModule('hospedagem', ['dashboard', 'funcionarios'])).toBe(false);
    expect(canAccessModule('treinamentos_planejados', ['dashboard', 'funcionarios'])).toBe(false);
  });

  it('mantem SIGVOOS bloqueado sem regra interna explicita', () => {
    expect(canAccessModule('sigvoos', null)).toBe(false);
    expect(canAccessModule('sigvoos', ['sigvoos'])).toBe(false);
    expect(canAccessModule('sigvoos', ['sigvoos'], { allowBlocked: true })).toBe(true);
  });

  it('normaliza preset legado sem bloquear tenant existente por acidente', () => {
    const expanded = expandActiveModuleKeys(['treinamento', 'compliance']);

    expect(isLegacyPresetConfig(['treinamento', 'compliance'])).toBe(true);
    expect(expanded.has('dashboard')).toBe(true);
    expect(expanded.has('lms')).toBe(true);
    expect(expanded.has('sgso')).toBe(true);
    expect(canAccessModule('sigvoos', ['treinamento', 'compliance'])).toBe(false);
  });

  it('identifica config explicita sem tratar null como bloqueio', () => {
    expect(hasExplicitModuleConfig(['dashboard'])).toBe(true);
    expect(hasExplicitModuleConfig([])).toBe(true);
    expect(hasExplicitModuleConfig(null)).toBe(false);
  });

  it('mapeia rotas diretas para chaves canonicas', () => {
    expect(getModuleKeyForPath('/lms/cursos/123')).toBe('lms');
    expect(getModuleKeyForPath('/sgso/relatos/1')).toBe('sgso');
    expect(getModuleKeyForPath('/configuracoes/integracoes/sigvoos')).toBe('sigvoos');
    expect(getModuleKeyForPath('/hospedagem/quartos/7')).toBe('hospedagem');
    expect(getModuleKeyForPath('/treinamentos/planejados/31')).toBe('treinamentos_planejados');
    expect(getModuleKeyForPath('/')).toBeNull();
  });

  it('mantem modulos beta visiveis quando explicitamente ativos', () => {
    expect(canAccessModule('lms', ['dashboard', 'lms'])).toBe(true);
    expect(canAccessModule('sgso', ['dashboard', 'sgso'])).toBe(true);
    expect(canAccessModule('hospedagem', ['dashboard', 'hospedagem'])).toBe(true);
    expect(canAccessModule('treinamentos_planejados', ['dashboard', 'treinamentos_planejados'])).toBe(
      true,
    );
  });
});
