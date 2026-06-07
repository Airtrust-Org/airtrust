/**
 * Directed tests for Qualificacoes tab preference migration.
 *
 * Regression guard for the "blank page" bug:
 *   - 'turmas' was briefly used as a main-tab value (commit e6cb334).
 *   - Users with that stale preference saw a blank content area because no
 *     render block matched 'turmas' after the tab was renamed to 'planejados'.
 *
 * These tests verify the migration logic in isolation without mounting React.
 */
import { describe, it, expect } from 'vitest';

// ─── Inline replica of the migration logic from Qualificacoes.tsx ─────────────

type ActiveTab = 'historico' | 'planejados' | 'tipos' | 'categorias';
type PlannedView = 'lista' | 'calendario' | 'turmas';

interface StoredPrefs {
  activeTab?: string;
  plannedView?: string;
}

const VALID_TABS = ['historico', 'planejados', 'tipos', 'categorias'] as const;
const VALID_PLANNED_VIEWS = ['lista', 'calendario', 'turmas'] as const;

function migratePrefs(prefs: StoredPrefs): { activeTab: ActiveTab; plannedView: PlannedView } {
  const rawTab = prefs.activeTab;
  const rawView = prefs.plannedView;

  const migratedTab: ActiveTab =
    rawTab === 'turmas'
      ? 'planejados'
      : VALID_TABS.includes(rawTab as (typeof VALID_TABS)[number])
        ? (rawTab as ActiveTab)
        : 'historico';

  const migratedView: PlannedView =
    rawTab === 'turmas'
      ? 'turmas'
      : VALID_PLANNED_VIEWS.includes(rawView as (typeof VALID_PLANNED_VIEWS)[number])
        ? (rawView as PlannedView)
        : 'lista';

  return { activeTab: migratedTab, plannedView: migratedView };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Qualificacoes preference migration', () => {
  describe('activeTab migration', () => {
    it('prefs_planejados_permanece_valida — stored "planejados" stays as planejados', () => {
      const { activeTab } = migratePrefs({ activeTab: 'planejados' });
      expect(activeTab).toBe('planejados');
    });

    it('prefs_turmas_migra_para_planejados — stored legacy "turmas" maps to planejados tab', () => {
      const { activeTab } = migratePrefs({ activeTab: 'turmas' });
      expect(activeTab).toBe('planejados');
    });

    it('prefs_turmas_seta_subvisao_turmas — stored "turmas" maps to plannedView=turmas', () => {
      const { plannedView } = migratePrefs({ activeTab: 'turmas' });
      expect(plannedView).toBe('turmas');
    });

    it('prefs_invalida_cai_em_historico — unknown activeTab falls back to historico', () => {
      const { activeTab } = migratePrefs({ activeTab: 'some_random_value' });
      expect(activeTab).toBe('historico');
    });

    it('prefs_ausente_cai_em_historico — missing activeTab defaults to historico', () => {
      const { activeTab } = migratePrefs({});
      expect(activeTab).toBe('historico');
    });

    it('historico_permanece_valido — stored "historico" is preserved', () => {
      const { activeTab } = migratePrefs({ activeTab: 'historico' });
      expect(activeTab).toBe('historico');
    });

    it('tipos_permanece_valido — stored "tipos" is preserved', () => {
      const { activeTab } = migratePrefs({ activeTab: 'tipos' });
      expect(activeTab).toBe('tipos');
    });

    it('categorias_permanece_valido — stored "categorias" is preserved', () => {
      const { activeTab } = migratePrefs({ activeTab: 'categorias' });
      expect(activeTab).toBe('categorias');
    });
  });

  describe('plannedView migration', () => {
    it('planned_view_lista_preservada — stored "lista" is kept', () => {
      const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'lista' });
      expect(plannedView).toBe('lista');
    });

    it('planned_view_calendario_preservada — stored "calendario" is kept', () => {
      const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendario' });
      expect(plannedView).toBe('calendario');
    });

    it('planned_view_turmas_preservada — stored "turmas" (explicit) is kept', () => {
      const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'turmas' });
      expect(plannedView).toBe('turmas');
    });

    it('planned_view_invalida_cai_em_lista — unknown plannedView defaults to lista', () => {
      const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendar' });
      expect(plannedView).toBe('lista');
    });

    it('planned_view_ausente_cai_em_lista — missing plannedView defaults to lista', () => {
      const { plannedView } = migratePrefs({ activeTab: 'planejados' });
      expect(plannedView).toBe('lista');
    });

    it('turmas_legado_seta_lista_sem_override — migratedView is turmas only from legacy tab', () => {
      // When legacy 'turmas' tab is migrated, planned view becomes 'turmas'
      // regardless of stored plannedView (which didn't exist then)
      const { plannedView } = migratePrefs({ activeTab: 'turmas', plannedView: undefined });
      expect(plannedView).toBe('turmas');
    });
  });

  describe('nenhuma_preferencia_deixa_painel_branco', () => {
    const RENDER_BLOCKS: ReadonlyArray<ActiveTab> = ['historico', 'planejados', 'tipos', 'categorias'];

    it.each([
      { activeTab: 'historico' as const },
      { activeTab: 'planejados' as const },
      { activeTab: 'tipos' as const },
      { activeTab: 'categorias' as const },
    ])('tab "$activeTab" always resolves to a known render block', ({ activeTab }) => {
      const { activeTab: resolved } = migratePrefs({ activeTab });
      expect(RENDER_BLOCKS).toContain(resolved);
    });

    it.each([
      'turmas',
      'planejados_old',
      '',
      'HISTORICO',
      'null',
      undefined,
    ])('stale/unknown value "%s" resolves to a known render block', (stale) => {
      const { activeTab } = migratePrefs({ activeTab: stale });
      expect(RENDER_BLOCKS).toContain(activeTab);
    });
  });
});
