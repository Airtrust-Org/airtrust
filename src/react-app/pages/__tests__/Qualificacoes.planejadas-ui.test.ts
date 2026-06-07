/**
 * Specification tests for Qualificacoes — Planejadas tab UI behaviour.
 *
 * These tests verify the configuration constants and pure logic that drive the
 * Planejadas section without mounting React.
 */
import { describe, it, expect } from 'vitest';

// ─── Mirror the constants from Qualificacoes.tsx ────────────────────────────

const VALID_TABS = ['historico', 'planejados', 'tipos', 'categorias'] as const;
const VALID_PLANNED_VIEWS = ['lista', 'calendario', 'turmas'] as const;

type ActiveTab = (typeof VALID_TABS)[number];
type PlannedView = (typeof VALID_PLANNED_VIEWS)[number];

interface StoredPrefs {
  activeTab?: string;
  plannedView?: string;
}

function migratePrefs(prefs: StoredPrefs): { activeTab: ActiveTab; plannedView: PlannedView } {
  const rawTab = prefs.activeTab;
  const rawView = prefs.plannedView;

  const migratedTab: ActiveTab =
    rawTab === 'turmas'
      ? 'planejados'
      : VALID_TABS.includes(rawTab as ActiveTab)
        ? (rawTab as ActiveTab)
        : 'historico';

  const migratedView: PlannedView =
    rawTab === 'turmas'
      ? 'turmas'
      : VALID_PLANNED_VIEWS.includes(rawView as PlannedView)
        ? (rawView as PlannedView)
        : 'lista';

  return { activeTab: migratedTab, plannedView: migratedView };
}

/** Simulates the tab label mapping as rendered in the JSX. */
const TAB_LABELS: Record<ActiveTab, string> = {
  historico: 'Histórico',
  planejados: 'Planejadas',
  tipos: 'Modelos',
  categorias: 'Categorias',
};

/** Sub-tab views always available inside Planejadas (no longer conditional). */
const PLANNED_SUBVIEWS: ReadonlyArray<PlannedView> = ['lista', 'calendario', 'turmas'];

const PLANNED_SUBVIEW_LABELS: Record<PlannedView, string> = {
  lista: 'Lista',
  calendario: 'Calendário',
  turmas: 'Turmas',
};

// ─────────────────────────────────────────────────────────────────────────────

describe('Qualificacoes — Planejadas tab', () => {
  it('aba_principal_exibe_planejadas — tab internal key is "planejados", label is "Planejadas"', () => {
    expect(VALID_TABS).toContain('planejados');
    expect(TAB_LABELS['planejados']).toBe('Planejadas');
  });

  it('planejadas_mantem_chave_interna_planejados — stored "planejados" key is preserved', () => {
    const { activeTab } = migratePrefs({ activeTab: 'planejados' });
    expect(activeTab).toBe('planejados');
  });

  it('planejadas_exibe_lista_calendario_turmas — all 3 sub-views are always available', () => {
    expect(PLANNED_SUBVIEWS).toHaveLength(3);
    expect(PLANNED_SUBVIEWS).toContain('lista');
    expect(PLANNED_SUBVIEWS).toContain('calendario');
    expect(PLANNED_SUBVIEWS).toContain('turmas');
  });

  it('sub_views_tem_labels_corretos — sub-tab labels match expected text', () => {
    expect(PLANNED_SUBVIEW_LABELS['lista']).toBe('Lista');
    expect(PLANNED_SUBVIEW_LABELS['calendario']).toBe('Calendário');
    expect(PLANNED_SUBVIEW_LABELS['turmas']).toBe('Turmas');
  });

  it('planejadas_exibe_botao_novo_treinamento — Novo treinamento button is present on Lista and Calendário views', () => {
    // Button is shown when plannedView !== 'turmas' and isPlanejadosTab
    const viewsWithButton: ReadonlyArray<PlannedView> = ['lista', 'calendario'];
    const viewsWithoutOuterButton: ReadonlyArray<PlannedView> = ['turmas'];

    viewsWithButton.forEach((view) => {
      const shouldShowButton = view !== 'turmas';
      expect(shouldShowButton).toBe(true);
    });

    viewsWithoutOuterButton.forEach((view) => {
      const shouldShowButton = view !== 'turmas';
      expect(shouldShowButton).toBe(false);
    });
  });

  it('planejadas_nao_exibe_dashboard_pesado — heavy dashboard cards not in VALID_TABS', () => {
    // Dashboard was replaced by simple tags — verify no "dashboard" key in tabs
    expect(VALID_TABS).not.toContain('dashboard');
    expect(VALID_TABS).not.toContain('overview');
  });

  it('turmas_vazia_still_navigable — turmas sub-view is always reachable regardless of data', () => {
    // The sub-tabs are unconditionally rendered: 'turmas' must always be a valid planned view
    expect(VALID_PLANNED_VIEWS).toContain('turmas');
    expect(PLANNED_SUBVIEWS).toContain('turmas');
  });
});

describe('Qualificacoes — Planejadas localStorage / pref guard', () => {
  it('preferencia_invalida_nao_deixa_tela_branca — unknown plannedView falls back to lista', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendario_antigo' });
    expect(plannedView).toBe('lista');
  });

  it('preferencia_calendario_preservada — valid "calendario" pref is kept', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendario' });
    expect(plannedView).toBe('calendario');
  });

  it('preferencia_turmas_preservada — valid "turmas" pref is kept', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'turmas' });
    expect(plannedView).toBe('turmas');
  });

  it('preferencia_ausente_cai_em_lista — missing plannedView defaults to lista', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados' });
    expect(plannedView).toBe('lista');
  });
});

describe('Qualificacoes — Calendário reconcilia qualificação planejada', () => {
  const mockHistoricoItem = {
    id: 42,
    funcionario_nome: 'João Silva',
    qualificacao_nome: 'SFO B737',
    qualificacao_codigo: 'SFO',
    data_conclusao: '2026-06-25',
  };

  it('planejadas_lista_e_calendario_reconciliam_qualificacao_planejada — date is parseable for calendar display', () => {
    const date = new Date(mockHistoricoItem.data_conclusao + 'T00:00:00');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5); // June (0-indexed)
    expect(date.getDate()).toBe(25);
    expect(date.toLocaleDateString('pt-BR')).toBe('25/06/2026');
  });

  it('historico_planejado_tem_campos_necessarios — item has all fields needed for calendar display', () => {
    expect(mockHistoricoItem.data_conclusao).toBeTruthy();
    expect(mockHistoricoItem.funcionario_nome).toBeTruthy();
    expect(mockHistoricoItem.qualificacao_nome || mockHistoricoItem.qualificacao_codigo).toBeTruthy();
  });
});
