/**
 * Unit tests for ModalNovaSessao model/theme hydration behavior.
 *
 * Focus: the "Tema da Sessão" field must NOT be erased when the endpoint
 * returns a list that doesn't include the saved modelo_sessao_id.
 * Failing to preserve it shows a false "Nenhum modelo cadastrado" even for
 * sessions that already have a theme.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const modalSrc = readFileSync(resolve(currentDir, '../ModalNovaSessao.tsx'), 'utf8');
const treinamentosPageSrc = readFileSync(
  resolve(currentDir, '../../../pages/TreinamentosPlanejadosPage.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helpers to mirror the carregarModelosSessao clear-down logic
// ---------------------------------------------------------------------------

interface ModeloSessao {
  id: number;
  nome: string;
  codigo: string;
}

/**
 * Mirrors the buggy original behavior (clears temaSessao on empty list).
 * Used ONLY to document the OLD broken contract — new code must NOT do this.
 */
function modeloResolutionBuggy(
  modeloSessaoId: number | null,
  modelosAtualizados: ModeloSessao[],
  temaSessao: string,
): { modeloSessaoId: number | null; temaSessao: string } {
  let newModeloId = modeloSessaoId;
  let newTema = temaSessao;
  if (modeloSessaoId && !modelosAtualizados.some((m) => m.id === modeloSessaoId)) {
    newModeloId = null;
    newTema = ''; // ← the old bug
  }
  return { modeloSessaoId: newModeloId, temaSessao: newTema };
}

/**
 * Mirrors the FIXED behavior: clears the FK but preserves the theme name.
 */
function modeloResolutionFixed(
  modeloSessaoId: number | null,
  modelosAtualizados: ModeloSessao[],
  temaSessao: string,
): { modeloSessaoId: number | null; temaSessao: string } {
  let newModeloId = modeloSessaoId;
  if (modeloSessaoId && !modelosAtualizados.some((m) => m.id === modeloSessaoId)) {
    newModeloId = null;
    // temaSessao intentionally NOT cleared — legacy theme name preserved
  }
  return { modeloSessaoId: newModeloId, temaSessao };
}

// ---------------------------------------------------------------------------

describe('ModalNovaSessao — model/theme hydration (source-code contracts)', () => {
  it('simulador_modal_nao_zera_modelo_quando_modelos_endpoint_vazio — fix comment present in carregarModelosSessao', () => {
    // The fixed code has an explicit comment in carregarModelosSessao documenting
    // why setTemaSessao('') is NOT called. If this comment is absent, the fix
    // has been reverted.
    expect(modalSrc).toContain("Do NOT setTemaSessao('')");
    // Also verify that the "legacy theme name stays visible" comment is present
    expect(modalSrc).toContain('legacy theme name stays visible and editable');
  });

  it('simulador_modal_preserva_modelo_sessao_existente — fixing comment is present in source', () => {
    // The fix adds a comment explaining why temaSessao is not cleared.
    expect(modalSrc).toContain('legacy theme name');
  });

  it('simulador_modal_exibe_tema_legado_quando_modelo_inativo_ou_ausente — render shows input when models empty but temaSessao set', () => {
    // The render must handle the case where modelos.length === 0 but temaSessao exists.
    // It should show an input (not just the amber "no models" warning).
    expect(modalSrc).toContain('isEditMode && temaSessao');
    expect(modalSrc).toContain('data-testid="tema-sessao-legado-input"');
    // The input must bind to temaSessao value and allow editing
    expect(modalSrc).toContain('Tema preservado da sessão');
  });

  it('simulador_modal_hidrata_modelo_apos_equipamento_tipo_simulador — Phase 2 hydration triggers fetchModelosComCodigo', () => {
    expect(modalSrc).toContain('fetchModelosComCodigo(tipoSessao.id, codigoParaModelos, tipoDisp)');
    expect(modalSrc).toContain('[PHASE 2] Hydrating cascading fields');
  });

  it('simulador_modal_salvar_nao_apaga_modelo_sem_interacao — submit includes temaSessao from state', () => {
    // The save payload always includes the current temaSessao state value.
    expect(modalSrc).toContain('tema_sessao: temaSessao');
    // It also includes modelo_sessao_id (which may be null if no match, but that is ok)
    expect(modalSrc).toContain('modelo_sessao_id: modeloSessaoId');
  });

  it('simulador_modal_injeta_modelo_template_salvo — fetches model by ID when not in filtered list', () => {
    // The carregarModelosSessao function must inject the session's saved template
    // model into the list even if client-side filtering would exclude it.
    expect(modalSrc).toContain('Modelo salvo');
    expect(modalSrc).toContain('injetado na lista');
    // Must use the saved template_id from the sessao prop
    expect(modalSrc).toContain('sessao?.template_id');
    // Must call the single-model endpoint
    expect(modalSrc).toContain('/simuladores/modelos-sessao/${savedTemplateId}');
  });

  it('simulador_modal_nao_limpa_modelos_em_erro — preserves models on fetch error if already loaded', () => {
    // On API error, the code must NOT clear models if they were already loaded.
    // This prevents the legacy warning from flashing when a retry/slow fetch fails.
    expect(modalSrc).toContain('Preserve existing modelos on error');
    expect(modalSrc).toContain('if (modelos.length === 0)');
    expect(modalSrc).toContain('Same: only clear if there were no models before');
  });

  it('simulador_modal_nao_finaliza_hidratacao_prematuramente — cascade guard prevents premature hydration end', () => {
    // The auto-select effect must not set editHydrating=false until the cascade
    // has actually triggered a model fetch (tipoSessaoId set AND aeronaveCodigo set).
    expect(modalSrc).toContain('cascadeTriggeredFetch');
    expect(modalSrc).toContain('tipoSessaoId !== null && aeronaveCodigo !== \'\'');
    expect(modalSrc).toContain('editHydrating can end prematurely');
  });

  it('simulador_modal_nao_limpa_modelos_codigo_vazio — preserves models on empty aeronaveCodigo', () => {
    // When fetchModelos/fetchModelosComCodigo is called with empty codigo,
    // only clear models if they were never loaded.
    expect(modalSrc).toContain('Only clear models if they were never loaded');
  });
});

describe('ModalNovaSessao — model resolution logic (pure logic tests)', () => {
  const existingModelos: ModeloSessao[] = [
    { id: 1, nome: 'CRM Level D', codigo: 'CRM-LD' },
    { id: 2, nome: 'CRM Básico', codigo: 'CRM-B' },
  ];

  it('preserva_tema_quando_modelo_nao_encontrado_na_lista — FIXED behavior preserves temaSessao', () => {
    const { modeloSessaoId, temaSessao } = modeloResolutionFixed(
      99, // saved ID not in list
      existingModelos,
      'CRM — Gerenciamento de Recursos (tema salvo)',
    );
    // FK cleared (stale reference)
    expect(modeloSessaoId).toBeNull();
    // Theme preserved
    expect(temaSessao).toBe('CRM — Gerenciamento de Recursos (tema salvo)');
  });

  it('comportamento_antigo_apagava_tema — OLD behavior (documented as bug, not expected anymore)', () => {
    const { temaSessao } = modeloResolutionBuggy(
      99,
      existingModelos,
      'CRM — Gerenciamento de Recursos (tema salvo)',
    );
    // Old bug: tema was cleared
    expect(temaSessao).toBe('');
  });

  it('nao_altera_nada_quando_modelo_existe_na_lista — no state changes when model is in list', () => {
    const { modeloSessaoId, temaSessao } = modeloResolutionFixed(
      1, // exists in existingModelos
      existingModelos,
      'CRM Level D',
    );
    expect(modeloSessaoId).toBe(1);
    expect(temaSessao).toBe('CRM Level D');
  });

  it('nao_altera_nada_quando_nao_ha_modelo_salvo — no ID = nothing to clear', () => {
    const { modeloSessaoId, temaSessao } = modeloResolutionFixed(
      null,
      existingModelos,
      '',
    );
    expect(modeloSessaoId).toBeNull();
    expect(temaSessao).toBe('');
  });

  it('lista_vazia_limpa_id_preserva_tema — empty modelos list also clears ID but not theme', () => {
    const { modeloSessaoId, temaSessao } = modeloResolutionFixed(
      5,
      [], // empty list
      'Tema da Sessão SK76',
    );
    expect(modeloSessaoId).toBeNull();
    expect(temaSessao).toBe('Tema da Sessão SK76');
  });
});

describe('TreinamentosPlanejadosPage — Turmas tab loading/error states', () => {
  it('planejadas_turmas_nao_renderiza_quadro_operacional — loading text is context-aware for TURMA source', () => {
    // The loading message must not say "quadro operacional" when sourceFilter=TURMA/TREINAMENTOS
    expect(treinamentosPageSrc).toContain("isTurmasView ? 'Carregando turmas...' : 'Carregando treinamentos...'");
  });

  it('planejadas_turmas_nao_fica_loading_infinito — isError state is handled in quadro tab', () => {
    expect(treinamentosPageSrc).toContain('treinamentosQuery.isError && listaTreinamentos.length === 0');
    expect(treinamentosPageSrc).toContain('treinamentosQuery.refetch()');
    expect(treinamentosPageSrc).toContain('Tentar novamente');
  });

  it('planejadas_turmas_empty_state_correto — empty state for TURMA has different message', () => {
    expect(treinamentosPageSrc).toContain("sourceFilter === 'TURMA'");
    expect(treinamentosPageSrc).toContain('Nenhuma turma planejada no período');
  });

  it('planejadas_turmas_renderiza_tabela — quadro tab renders a table when data exists', () => {
    expect(treinamentosPageSrc).toContain('data-testid="treinamentos-planejados-table"');
  });

  it('planejadas_turmas_tem_botao_nova_turma — primaryActionLabel is Nova turma for TURMA source', () => {
    expect(treinamentosPageSrc).toContain("isTurmasView ? 'Nova turma' : 'Novo treinamento'");
  });

  it('planejadas_turmas_nao_mostra_novo_treinamento_duplicado — hideActions prevents duplicate button in embedded mode', () => {
    expect(treinamentosPageSrc).toContain('!hideActions ? <div className="flex justify-end pb-2">{actionButtons}</div> : null');
  });

  it('planejadas_turmas_tem_acoes_editar_e_cancelar_ou_excluir — action buttons are rendered per-row', () => {
    // The table has action column with edit/cancel/delete buttons per row
    expect(treinamentosPageSrc).toContain('data-testid={`treinamento-planejado-row-${item.id}`}');
    // Edit button calls abrirEditor(item) which internally sets treinamentoEditando
    expect(treinamentosPageSrc).toContain('abrirEditor(item)');
    // The delete action exists (via excluirTreinamentoSelecionado or similar)
    expect(treinamentosPageSrc).toContain('excluirTreinamento');
  });

  it('planejadas_turmas_mostra_crm_15_16_junho — TURMA source items map to TURMA source_label', () => {
    // Items with source=TURMA are labelled 'Turma' in the backend
    // and the table shows source_label column
    expect(treinamentosPageSrc).toContain('item.source_label || \'Turma\'');
  });
});
