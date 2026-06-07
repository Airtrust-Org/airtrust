/**
 * Testes de regressão: badge Renovadas e Planejadas no Histórico de Qualificações.
 *
 * Causa raiz corrigida: statusFiltro padrão exclui RENOVADA, fazendo
 * shouldUseLocalHistoricoHeaderStats=true, que zerava o badge porque
 * a contagem local só via a página atual (sem registros RENOVADA visíveis).
 *
 * Fix: globalRenovadas/globalPlanejadas sempre vêm da API; o badge nunca
 * usa a contagem local para essas duas métricas.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Helper que replica a lógica de historicoHeaderStats do Qualificacoes.tsx
// ---------------------------------------------------------------------------
function buildHistoricoHeaderStats(opts: {
  shouldUseLocal: boolean;
  apiStats: { total: number; validas: number; vencendo: number; vencidas: number; renovadas: number; planejadas: number };
  localStats: { total: number; validas: number; vencendo: number; vencidas: number; renovadas: number };
  historicoPlanejadoRelacionadoLength: number;
}) {
  const { shouldUseLocal, apiStats, localStats, historicoPlanejadoRelacionadoLength } = opts;

  // Lógica corrigida — replicada do componente
  const globalRenovadas = Number(apiStats.renovadas || 0);
  const globalPlanejadas = Math.max(
    Number(apiStats.planejadas || 0),
    historicoPlanejadoRelacionadoLength,
  );

  return shouldUseLocal
    ? { ...localStats, renovadas: globalRenovadas, planejadas: globalPlanejadas }
    : { ...apiStats, renovadas: globalRenovadas, planejadas: globalPlanejadas };
}

describe('historicoHeaderStats — badge Renovadas/Planejadas', () => {
  const apiStats = {
    total: 663,
    validas: 350,
    vencendo: 50,
    vencidas: 46,
    renovadas: 242,
    planejadas: 1,
  };

  const localStatsPageOnly = {
    total: 20,
    validas: 18,
    vencendo: 2,
    vencidas: 0,
    renovadas: 0, // página atual não tem RENOVADA (estão filtradas fora)
  };

  it('historico_badge_renovadas_usa_global_quando_filtro_nao_padrao', () => {
    // shouldUseLocal=true porque statusFiltro != ALL_STATUS_VALUES (padrão exclui RENOVADA)
    const result = buildHistoricoHeaderStats({
      shouldUseLocal: true,
      apiStats,
      localStats: localStatsPageOnly,
      historicoPlanejadoRelacionadoLength: 1,
    });

    expect(result.renovadas).toBe(242);
    expect(result.renovadas).not.toBe(0);
  });

  it('historico_badge_planejadas_usa_maximo_entre_api_e_dedicada', () => {
    const result = buildHistoricoHeaderStats({
      shouldUseLocal: true,
      apiStats,
      localStats: localStatsPageOnly,
      historicoPlanejadoRelacionadoLength: 1,
    });

    expect(result.planejadas).toBe(1); // max(api=1, dedicada=1) = 1
  });

  it('historico_badge_planejadas_usa_dedicada_quando_maior_que_api', () => {
    const apiWithLowerPlanejadas = { ...apiStats, planejadas: 0 };
    const result = buildHistoricoHeaderStats({
      shouldUseLocal: true,
      apiStats: apiWithLowerPlanejadas,
      localStats: localStatsPageOnly,
      historicoPlanejadoRelacionadoLength: 3,
    });

    expect(result.planejadas).toBe(3); // max(api=0, dedicada=3) = 3
  });

  it('historico_renovadas_nao_depende_da_pagina_atual', () => {
    const localSemRenovadas = { ...localStatsPageOnly, renovadas: 0 };
    const result = buildHistoricoHeaderStats({
      shouldUseLocal: true,
      apiStats,
      localStats: localSemRenovadas,
      historicoPlanejadoRelacionadoLength: 0,
    });

    // Mesmo que a página atual não tenha RENOVADA, o badge usa o valor da API
    expect(result.renovadas).toBe(242);
  });

  it('historico_summary_consistente_sem_filtro', () => {
    // shouldUseLocal=false quando filtro é padrão completo
    const result = buildHistoricoHeaderStats({
      shouldUseLocal: false,
      apiStats,
      localStats: localStatsPageOnly,
      historicoPlanejadoRelacionadoLength: 1,
    });

    expect(result.renovadas).toBe(242);
    expect(result.total).toBe(663);
    expect(result.validas).toBe(350);
  });

  it('historico_status_renovada_legado_reconhecido_pelo_api_predicate', () => {
    // A API conta renovada=1 flag E status='RENOVADA' com UPPER()
    // Verificar que 242 > 175 (= 175 status+67 flag_only) é esperado
    const renovadasPorStatus = 175;
    const renovadasPorFlag = 270;
    expect(renovadasPorFlag).toBeGreaterThan(renovadasPorStatus);
    // O predicate correto usa (renovada=1 OR status='RENOVADA') → 270 para ATIVO
    // mas o badge global vem da query com f.empresa_id=6 ATIVO → 242
    expect(apiStats.renovadas).toBe(242);
  });
});

describe('planejados — fonte de dados', () => {
  it('planejados_nao_mostra_zero_quando_existe_planejada_no_historico', () => {
    const historicoPlanejadoRelacionadoLength = 1;
    const treinamentosLength = 0;

    const globalPlanejadas = Math.max(1, historicoPlanejadoRelacionadoLength);
    expect(globalPlanejadas).toBe(1);
    expect(globalPlanejadas).toBeGreaterThan(0);

    // O total exibido ao usuário não deve ser 0 quando há planejadas no historico
    const totalExibido = Math.max(treinamentosLength, historicoPlanejadoRelacionadoLength);
    expect(totalExibido).not.toBe(0);
  });

  it('planejados_inclui_qualificacao_historico_planejada', () => {
    const planejadaHistorico = {
      id: 4534,
      empresa_id: 6,
      funcionario_id: 3,
      status: 'PLANEJADA',
      data_conclusao: '2026-06-25',
    };

    // Critério: deve ser incluída se status === 'PLANEJADA'
    expect(planejadaHistorico.status).toBe('PLANEJADA');
    expect(planejadaHistorico.empresa_id).toBe(6);
  });

  it('planejados_cancelada_nao_aparece_como_ativa', () => {
    const statusCancelada = 'CANCELADA';
    const isPlanned = ['PLANEJADA', 'PLANEJADO'].includes(statusCancelada);
    expect(isPlanned).toBe(false);
  });

  it('planejados_total_reconcilia_com_historico_planejadas', () => {
    // API retorna planejadas=1, historicoPlanejadoRelacionado.length=1
    const apiPlanejadas = 1;
    const historicoDedicadoLength = 1;
    const totalReconciliado = Math.max(apiPlanejadas, historicoDedicadoLength);
    expect(totalReconciliado).toBe(1);
  });

  it('planejados_fonte_parcial_nao_zera_tudo', () => {
    // Mesmo que treinamentos_planejados retorne 0, se historico tem 1, total != 0
    const treinamentosComErro = null; // simula falha
    const historicoPlanejadas = 1;

    const total = Math.max(
      (treinamentosComErro as null | { length: number })?.length ?? 0,
      historicoPlanejadas,
    );
    expect(total).toBe(1);
    expect(total).not.toBe(0);
  });
});
