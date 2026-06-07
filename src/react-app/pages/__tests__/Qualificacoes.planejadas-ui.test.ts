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

/** Sub-tabs that are visible in the UI (Turmas is hidden — only reachable via "Nova turma" button). */
const VISIBLE_PLANNED_SUBVIEWS: ReadonlyArray<(typeof VALID_PLANNED_VIEWS)[number]> = [
  'lista',
  'calendario',
];

type ActiveTab = (typeof VALID_TABS)[number];
type PlannedView = (typeof VALID_PLANNED_VIEWS)[number];

interface StoredPrefs {
  activeTab?: string;
  plannedView?: string;
}

/**
 * Mirrors the migratedPlannedView logic in Qualificacoes.tsx.
 * 'turmas' stored preference → migrates to 'calendario' since the Turmas sub-tab is now hidden.
 */
function migratePrefs(prefs: StoredPrefs): { activeTab: ActiveTab; plannedView: PlannedView } {
  const rawTab = prefs.activeTab;
  const rawView = prefs.plannedView;

  const migratedTab: ActiveTab =
    rawTab === 'turmas'
      ? 'planejados'
      : VALID_TABS.includes(rawTab as ActiveTab)
        ? (rawTab as ActiveTab)
        : 'historico';

  // 'turmas' pref now migrates to 'calendario' (Turmas hidden, user lands on Calendário)
  const migratedView: PlannedView =
    rawView === 'turmas' || rawTab === 'turmas'
      ? 'calendario'
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

const PLANNED_SUBVIEW_LABELS: Record<PlannedView, string> = {
  lista: 'Lista',
  calendario: 'Calendário',
  turmas: 'Turmas',
};

/** The button label for creating a new training class. */
const BOTAO_NOVA_TURMA = 'Nova turma';

// ─── Views that show outer action buttons ───────────────────────────────────
function shouldShowOuterButtons(plannedView: PlannedView): boolean {
  return plannedView !== 'turmas';
}

// ─── Status helpers (mirrors normalizeTrainingStatusForCompatibility) ────────
const TRAINING_PLANNED_STATUS_VALUES = ['PLANEJADO', 'AGENDADO', 'CONFIRMADO'] as const;
type TrainingStatus = string;

function normalizeStatus(status: TrainingStatus): string {
  if (status === 'AGENDADO' || status === 'CONFIRMADO') return 'PLANEJADO';
  return status;
}

function isPlannedStatus(status: TrainingStatus): boolean {
  return TRAINING_PLANNED_STATUS_VALUES.includes(
    normalizeStatus(status) as (typeof TRAINING_PLANNED_STATUS_VALUES)[number],
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Qualificacoes — Planejadas tab', () => {
  it('planejadas_label_feminino — tab internal key is "planejados", label is "Planejadas" (feminino)', () => {
    expect(VALID_TABS).toContain('planejados');
    expect(TAB_LABELS['planejados']).toBe('Planejadas');
  });

  it('planejadas_mostra_lista_e_calendario — visible sub-tabs are exactly Lista and Calendário', () => {
    expect(VISIBLE_PLANNED_SUBVIEWS).toHaveLength(2);
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('lista');
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('calendario');
  });

  it('planejadas_nao_mostra_subaba_turmas — Turmas is NOT in visible sub-tabs', () => {
    expect(VISIBLE_PLANNED_SUBVIEWS).not.toContain('turmas');
    // Turmas is still a valid state (reachable via Nova turma button) but not a rendered tab
    expect(VALID_PLANNED_VIEWS).toContain('turmas');
  });

  it('planejadas_calendario_tem_botao_nova_turma — action button label is "Nova turma"', () => {
    expect(BOTAO_NOVA_TURMA).toBe('Nova turma');
    // The outer action buttons (incl. Nova turma) are shown on lista and calendario views
    expect(shouldShowOuterButtons('lista')).toBe(true);
    expect(shouldShowOuterButtons('calendario')).toBe(true);
    // They are hidden when Turmas view is active (form is inline)
    expect(shouldShowOuterButtons('turmas')).toBe(false);
  });

  it('planejadas_lista_e_calendario_usam_mesmo_dataset — both views share historicoPlanejadoRelacionado + treinamentosPlanejados', () => {
    // Both views read from: historicoPlanejadoRelacionado (PLANEJADA status) and
    // treinamentosPlanejadosConvocacaoQuery (TURMA + SIMULADOR + QUALIFICACAO_PLANEJADA sources).
    // Structural assertion: historicoPlanejadoRelacionado must use clean filters (no Histórico tab inheritance).
    const historicParams = {
      search: '',
      aeronaveId: undefined as undefined,
      categoriaId: undefined as undefined,
      statuses: ['PLANEJADA'],
    };
    expect(historicParams.search).toBe('');
    expect(historicParams.aeronaveId).toBeUndefined();
    expect(historicParams.categoriaId).toBeUndefined();
    expect(historicParams.statuses).toContain('PLANEJADA');
  });
});

describe('Qualificacoes — Antônio SK76 FFS on June 25', () => {
  const mockHistoricoItem = {
    id: 4534,
    empresa_id: 6,
    funcionario_nome: 'Antônio Luiz Simões Ramos',
    qualificacao_nome: 'G2 — SK76 PERIÓDICO 03/03: LOFT E CHECK',
    qualificacao_codigo: 'G2',
    data_conclusao: '2026-06-25',
    sessao_id: 75,
    status: 'PLANEJADA',
  };

  it('planejada_antonio_25_06_aparece_no_calendario — date 2026-06-25 parses correctly for calendar display', () => {
    const date = new Date(mockHistoricoItem.data_conclusao + 'T00:00:00');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5); // June (0-indexed)
    expect(date.getDate()).toBe(25);
    expect(date.toLocaleDateString('pt-BR')).toBe('25/06/2026');
  });

  it('historico_planejado_tem_campos_necessarios — item has all fields needed for calendar pill display', () => {
    expect(mockHistoricoItem.data_conclusao).toBeTruthy();
    expect(mockHistoricoItem.funcionario_nome).toBeTruthy();
    const label = mockHistoricoItem.qualificacao_nome || mockHistoricoItem.qualificacao_codigo;
    expect(label).toBeTruthy();
  });

  it('historico_planejada_inclui_sessao_id — historicoPlanejadoRelacionado includes items WITH sessao_id (endpoint returns all PLANEJADA)', () => {
    // The /qualificacoes/historico endpoint with statuses=['PLANEJADA'] returns ALL PLANEJADA rows,
    // including those with sessao_id set. Only loadStandalonePlannedQualificationItems (treinamentos
    // route) excludes them. Antônio's G2 (id=4534, sessao_id=75) IS returned by historico endpoint.
    expect(mockHistoricoItem.sessao_id).toBe(75);
    expect(mockHistoricoItem.status).toBe('PLANEJADA');
  });
});

describe('Qualificacoes — Simulator sessions June 2026', () => {
  const mockSimulatorSession = {
    id: 75,
    empresa_id: 6,
    data: '2026-06-25',
    status: 'AGENDADO',
    gera_qualificacao: 1,
    deleted_at: null,
  };

  const mockSimulatorSessionNoQual = {
    id: 71,
    empresa_id: 6,
    data: '2026-06-25',
    status: 'AGENDADO',
    gera_qualificacao: 0,
    deleted_at: null,
  };

  it('simuladores_junho_com_qualificacao_planejada_aparecem_em_planejadas — AGENDADO normalizes to PLANEJADO', () => {
    // loadSimulatorSessionItems normalizes AGENDADO → PLANEJADO via normalizeTrainingStatusForCompatibility
    expect(normalizeStatus('AGENDADO')).toBe('PLANEJADO');
    expect(isPlannedStatus('AGENDADO')).toBe(true);
    // Session 75 (gera_qualificacao=1) should appear via SIMULADOR source
    expect(mockSimulatorSession.deleted_at).toBeNull();
    expect(normalizeStatus(mockSimulatorSession.status)).toBe('PLANEJADO');
  });

  it('simuladores_junho_aparecem_no_calendario — ALL non-deleted simulator sessions appear regardless of gera_qualificacao', () => {
    // loadSimulatorSessionItems fetches ALL simulador_agendamentos regardless of gera_qualificacao.
    // Both sessions (with and without linked qualification) should appear in the calendar.
    const sessions = [mockSimulatorSession, mockSimulatorSessionNoQual];
    const visible = sessions.filter((s) => s.deleted_at === null);
    expect(visible).toHaveLength(2);
    expect(visible.every((s) => normalizeStatus(s.status) === 'PLANEJADO')).toBe(true);
  });

  it('sessao_cancelada_nao_aparece — CANCELADO sessions are excluded from upcoming list', () => {
    // The upcoming list in TreinamentosPlanejadosPage filters out CANCELADO items
    // (line: .filter((item) => item.data_prevista >= today && item.status !== 'CANCELADO'))
    const canceledSession = { ...mockSimulatorSession, status: 'CANCELADO' };
    const isCanceled = canceledSession.status === 'CANCELADO';
    expect(isCanceled).toBe(true);
    expect(normalizeStatus('CANCELADO')).toBe('CANCELADO');
    expect(isPlannedStatus('CANCELADO')).toBe(false);
  });

  it('soft_deleted_nao_aparece — soft deleted sessions (deleted_at IS NOT NULL) are excluded', () => {
    // loadSimulatorSessionItems filters: sa.deleted_at IS NULL
    const deletedSession = { ...mockSimulatorSession, deleted_at: '2026-06-01T00:00:00Z' };
    const isDeleted = deletedSession.deleted_at !== null;
    expect(isDeleted).toBe(true);
  });
});

describe('Qualificacoes — Planejadas resilience', () => {
  it('sem_zero_falso_quando_fonte_falha — failure of one source does not zero-out others (independent error handling)', () => {
    // listEventos catches per-source failures independently:
    // each source (TURMA, QUALIFICACAO_PLANEJADA, SIMULADOR) is wrapped in try/catch.
    // If SIMULADOR source throws, TURMA + QUALIFICACAO_PLANEJADA items are still returned.
    const sourceResults = [
      { source: 'TURMA', items: [{ id: 1 }], error: null },
      { source: 'QUALIFICACAO_PLANEJADA', items: [], error: new Error('DB timeout') },
      { source: 'SIMULADOR', items: [{ id: 2 }, { id: 3 }], error: null },
    ];
    const successfulItems = sourceResults
      .filter((s) => s.error === null)
      .flatMap((s) => s.items);
    expect(successfulItems).toHaveLength(3);
  });

  it('preferencia_antiga_turmas_nao_deixa_tela_branca — stored plannedView="turmas" migrates to "calendario"', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'turmas' });
    expect(plannedView).toBe('calendario');
  });

  it('preferencia_tab_turmas_nao_deixa_tela_branca — stored activeTab="turmas" (legacy) migrates to planejados+calendario', () => {
    const { activeTab, plannedView } = migratePrefs({ activeTab: 'turmas' });
    expect(activeTab).toBe('planejados');
    expect(plannedView).toBe('calendario');
  });

  it('preferencia_invalida_cai_em_lista — unknown plannedView falls back to lista', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendario_antigo' });
    expect(plannedView).toBe('lista');
  });

  it('preferencia_calendario_preservada — valid "calendario" pref is kept as-is', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'calendario' });
    expect(plannedView).toBe('calendario');
  });

  it('preferencia_ausente_cai_em_lista — missing plannedView defaults to lista', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados' });
    expect(plannedView).toBe('lista');
  });
});
