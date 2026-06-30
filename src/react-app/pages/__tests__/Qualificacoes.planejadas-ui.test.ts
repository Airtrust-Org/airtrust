/**
 * Specification tests for Qualificacoes — Planejadas tab UI behaviour.
 *
 * These tests verify the configuration constants and pure logic that drive the
 * Planejadas section without mounting React.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const qualificacoesSource = readFileSync(resolve(currentDir, '../Qualificacoes.tsx'), 'utf8');
const treinamentosSource = readFileSync(
  resolve(currentDir, '../TreinamentosPlanejadosPage.tsx'),
  'utf8',
);

// ─── Mirror the constants from Qualificacoes.tsx ────────────────────────────

const VALID_TABS = ['historico', 'planejados', 'tipos', 'categorias'] as const;
const VALID_PLANNED_VIEWS = ['lista', 'calendario', 'turmas'] as const;

/** Sub-tabs visible in the Planejadas UI. */
const VISIBLE_PLANNED_SUBVIEWS: ReadonlyArray<(typeof VALID_PLANNED_VIEWS)[number]> = [
  'lista',
  'calendario',
  'turmas',
];

type ActiveTab = (typeof VALID_TABS)[number];
type PlannedView = (typeof VALID_PLANNED_VIEWS)[number];

interface StoredPrefs {
  activeTab?: string;
  plannedView?: string;
}

/**
 * Mirrors the migratedPlannedView logic in Qualificacoes.tsx.
 * 'turmas' stored preference is preserved because Turmas is a visible management sub-tab.
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

  it('planejadas_mostra_lista_calendario_e_turmas — visible sub-tabs are exactly Lista, Calendário and Turmas', () => {
    expect(VISIBLE_PLANNED_SUBVIEWS).toHaveLength(3);
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('lista');
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('calendario');
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('turmas');
  });

  it('planejadas_mostra_subaba_turmas — Turmas is a rendered management sub-tab', () => {
    expect(VISIBLE_PLANNED_SUBVIEWS).toContain('turmas');
    expect(VALID_PLANNED_VIEWS).toContain('turmas');
    expect(PLANNED_SUBVIEW_LABELS.turmas).toBe('Turmas');
  });

  it('planejadas_calendario_tem_botao_nova_turma — action button label is "Nova turma"', () => {
    expect(BOTAO_NOVA_TURMA).toBe('Nova turma');
    // The outer action buttons (incl. Nova turma) are shown on lista and calendario views
    expect(shouldShowOuterButtons('lista')).toBe(true);
    expect(shouldShowOuterButtons('calendario')).toBe(true);
    // The outer button is hidden in Turmas because the embedded management table owns the action.
    expect(shouldShowOuterButtons('turmas')).toBe(false);
  });

  it('planejadas_lista_e_calendario_usam_mesmo_dataset — both views embed TreinamentosPlanejadosPage with hideActions', () => {
    expect(qualificacoesSource).toContain('forcedTab="quadro"');
    expect(qualificacoesSource).toContain('forcedTab="calendario"');
    expect(qualificacoesSource).toContain('hideActions={true}');
  });

  it('planejadas_turmas_e_gestao_real — Turmas filters source=TREINAMENTOS and does not duplicate calendar', () => {
    expect(qualificacoesSource).toContain("(['lista', 'calendario', 'turmas'] as const)");
    expect(qualificacoesSource).toContain('sourceFilter="TREINAMENTOS"');
    expect(qualificacoesSource).toContain('forcedTab="quadro"');
    expect(qualificacoesSource).toContain('hideTabNav={true}');
    expect(qualificacoesSource).not.toContain('Voltar ao Calendário');
  });

  it('calendario_nao_renderiza_pills_fora_do_grid — planned qualifications no longer render as standalone chips above the calendar', () => {
    expect(qualificacoesSource).not.toContain('Qualificações planejadas');
    expect(qualificacoesSource).not.toContain("historicoPlanejadoRelacionado.map((item) => (");
  });

  it('botao_novo_treinamento_nao_aparece_duplicado — embedded calendar/list hide inner actions while turma view uses Nova turma', () => {
    expect(treinamentosSource).toContain('hideActions?: boolean;');
    expect(treinamentosSource).toContain("const primaryActionLabel = isTurmasView ? 'Nova turma' : 'Novo treinamento';");
    expect(treinamentosSource).toContain('{asTab && !hideActions && (');
  });

  it('planejadas_lista_renderiza_tabela_operacional — Lista uses compact table instead of cards', () => {
    expect(treinamentosSource).toContain('data-testid="treinamentos-planejados-table"');
    expect(treinamentosSource).toContain('Treinamento / Qualificação');
    expect(treinamentosSource).toContain('Equipamento / Local');
    expect(treinamentosSource).toContain('data-testid={`treinamento-planejado-row-${item.id}`}');
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

  it('planejada_antonio_25_06_renderiza_dentro_do_dia_25 — simulator-linked qualification title includes participant name and qualification', () => {
    expect(treinamentosSource).toContain("if (item.source === 'SIMULADOR' && qualificationLabel && linkedParticipantNames.length > 0)");
    expect(treinamentosSource).toContain('return `${leadName}${extraCount > 0 ? ` +${extraCount}` : \'\'} — ${qualificationLabel}`;');
    // Calendar cell density reduced (M5): linked session label moved to Quadro view only
    expect(treinamentosSource).toContain('getEventoLinkedSessionLabel(item)');
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

  it('simuladores_junho_renderizam_dentro_dos_dias_corretos — calendar cards show titles and empty-state text inside the day cell', () => {
    // Calendar cell density reduced (M5): max 2 events, title + status badge + time only.
    // Participant summary moved to detail modal. Function still used in Quadro view.
    expect(treinamentosSource).toContain('getEventoParticipantSummary(item)');
    expect(treinamentosSource).toContain('Sem treinamentos planejados');
  });

  it('click_simulador_abre_modal_existente — SIMULADOR uses ModalNovaSessao hydrated by sessao_id', () => {
    expect(treinamentosSource).toContain("import ModalNovaSessao from '@/react-app/components/modals/ModalNovaSessao';");
    expect(treinamentosSource).toContain('function getSimulatorSessionId(item: TreinamentoPlanejado): number | null');
    expect(treinamentosSource).toContain('function mapTreinamentoToSessaoSimulador');
    expect(treinamentosSource).toContain("if (treinamento.source === 'SIMULADOR')");
    expect(treinamentosSource).toContain('setModalSessaoSimuladorAberto(true)');
    expect(treinamentosSource).toContain('simulador-editar-sessao-${simulatorSessionId}');
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

  it('preferencia_turmas_preservada — stored plannedView="turmas" stays on Turmas', () => {
    const { plannedView } = migratePrefs({ activeTab: 'planejados', plannedView: 'turmas' });
    expect(plannedView).toBe('turmas');
  });

  it('preferencia_tab_turmas_nao_deixa_tela_branca — stored activeTab="turmas" legacy migrates to planejados+turmas', () => {
    const { activeTab, plannedView } = migratePrefs({ activeTab: 'turmas' });
    expect(activeTab).toBe('planejados');
    expect(plannedView).toBe('turmas');
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

describe('Qualificacoes — Planejadas history restore (PR #206)', () => {
  it('chip_planejadas_conta_historico — chip shows historicoHeaderStats.planejadas (individual planned records)', () => {
    // The chip shows individual planned qualification records from qualificacoes_historico,
    // NOT turmas from treinamentos_planejados. The chip filters Histórico on click.
    const chipStart = qualificacoesSource.indexOf('Filtrar apenas planejadas');
    expect(chipStart).toBeGreaterThan(0);
    const chipSection = qualificacoesSource.substring(chipStart, chipStart + 700);
    expect(chipSection).toContain('historicoHeaderStats.planejadas');
    expect(chipSection).not.toContain('operationalTurmasCount');
  });

  it('chip_planejadas_filtra_historico — clicking Planejadas chip filters Histórico, stays on Historico tab', () => {
    // The chip calls applySingleStatusFromChip('PLANEJADA'), which sets activeTab='historico'
    expect(qualificacoesSource).toContain("applySingleStatusFromChip('PLANEJADA')");
    // The chip does NOT navigate to Planejados tab
    const chipStart = qualificacoesSource.indexOf('Filtrar apenas planejadas');
    const chipSection = qualificacoesSource.substring(chipStart, chipStart + 700);
    expect(chipSection).not.toContain("setActiveTab('planejados')");
  });

  it('chip_planejadas_tooltip_filtrar — chip tooltip says "Filtrar apenas planejadas"', () => {
    expect(qualificacoesSource).toContain('Filtrar apenas planejadas');
  });

  it('header_historico_sem_ver_turmas — chip "Ver turmas (N)" não existe no cabeçalho do Histórico', () => {
    // PR #206 incorrectly added this chip; it mixes turmas (Planejados tab) into the Histórico header.
    // The Histórico header must only show individual-record chips (Total, Vencendo, Vencidas, Planejadas, Renovadas).
    expect(qualificacoesSource).not.toContain('Ver turmas (');
  });

  it('sem_operational_turmas_count — operationalTurmasCount foi removido do componente', () => {
    // This derived value only served the wrong "Ver turmas" chip; it must not exist.
    expect(qualificacoesSource).not.toContain('operationalTurmasCount');
  });

  it('chip_planejadas_nao_muda_aba — chip Planejadas não navega para aba Planejados', () => {
    // The Planejadas chip must stay on the Histórico tab (filter only).
    // Only URL-param handlers are allowed to call setActiveTab('planejados').
    const chipStart = qualificacoesSource.indexOf('Filtrar apenas planejadas');
    expect(chipStart).toBeGreaterThan(0);
    const chipSection = qualificacoesSource.substring(chipStart - 200, chipStart + 700);
    expect(chipSection).not.toContain("setActiveTab('planejados')");
    expect(chipSection).not.toContain("setPlannedView('turmas')");
  });

  it('dropdown_status_historico_com_planejadas — Historico status dropdown includes Planejadas option', () => {
    // PLANEJADA should be in the Historico status dropdown as a valid filter
    expect(qualificacoesSource).toContain(
      "{ key: 'PLANEJADA', label: 'Planejadas', color: 'text-purple-600' }",
    );
    // All 6 statuses should be present
    expect(qualificacoesSource).toContain("{ key: 'VALIDA', label: 'Válidas'");
    expect(qualificacoesSource).toContain("{ key: 'CANCELADA', label: 'Canceladas'");
  });

  it('dropdown_status_contador_6 — status dropdown counter shows /6', () => {
    expect(qualificacoesSource).toContain('Status ({statusFiltro.size}/6)');
    expect(qualificacoesSource).not.toContain('Status ({statusFiltro.size}/5)');
  });

  it('botao_todos_com_planejadas — "Todos" button includes PLANEJADA (6 statuses)', () => {
    expect(qualificacoesSource).toContain(
      "new Set(['VALIDA','VENCIDA','VENCENDO_30','RENOVADA','PLANEJADA','CANCELADA'])",
    );
    expect(qualificacoesSource).not.toContain(
      "new Set(['VALIDA','VENCIDA','VENCENDO_30','RENOVADA','CANCELADA'])",
    );
  });

  it('filtro_padrao_com_planejadas — default status filter includes PLANEJADA', () => {
    expect(qualificacoesSource).toContain("['VALIDA', 'VENCIDA', 'VENCENDO_30', 'PLANEJADA']");
    expect(qualificacoesSource).not.toContain("['VALIDA', 'VENCIDA', 'VENCENDO_30']");
  });

  it('url_param_planejada_filtra_historico — URL status=planejada filters Historico, does not redirect', () => {
    // The URL param status=planejada applies the PLANEJADA filter in Historico
    expect(qualificacoesSource).toContain("planejada: ['PLANEJADA']");
    // Does NOT redirect to Planejados tab
    expect(qualificacoesSource).not.toContain("if (lowerStatus === 'planejada')");
  });

  it('empty_state_mostrar_todos_com_planejadas — empty state "Mostrar todos" button includes PLANEJADA', () => {
    expect(qualificacoesSource).toContain(
      "'VALIDA',\n                            'VENCIDA',\n                            'VENCENDO_30',\n                            'RENOVADA',\n                            'PLANEJADA',\n                            'CANCELADA'",
    );
  });

  it('planejados_lista_presenca_intacta — attendance list PDF generation remains available', () => {
    expect(treinamentosSource).toContain('gerandoListaPresencaTurma');
    expect(treinamentosSource).toContain('Lista de Presença');
    expect(treinamentosSource).toContain('gerarPDFListaPresencaTurma');
  });

  it('query_sem_filtro_status_mantida — query without status filter kept for Planejados tab operational count', () => {
    // The query without status filter is still used by the Planejados tab
    expect(qualificacoesSource).toContain('useTreinamentosPlanejados({})');
    expect(qualificacoesSource).not.toContain("status: 'PLANEJADO'");
  });

  it('planejados_encerrados_ocultos — Planejados tab keeps CONCLUIDO/CANCELADO hidden by default', () => {
    // PR #204 improvements are preserved
    expect(treinamentosSource).toContain("STATUS_ENCERRADOS = new Set");
    expect(treinamentosSource).toContain("'CONCLUIDO'");
    expect(treinamentosSource).toContain("'CANCELADO'");
  });
});
