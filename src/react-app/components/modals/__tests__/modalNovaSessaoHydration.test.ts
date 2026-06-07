/**
 * MODAL NOVA SESSÃO — HYDRATION TESTS
 *
 * Tests for the session edit modal hydration logic.
 * Validates that data flows correctly from prop + detail → form fields,
 * that the merge doesn't overwrite with empty strings, and that
 * cascading fields are resolved deterministically.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveEditModeloSelection,
  filterModelosSessaoForModal,
  deriveSpecialFichaFlags,
  applyModelChangeDefaults,
} from '../modalNovaSessaoRules';

// ==========================================================================
// SESSION DATA MERGE LOGIC TESTS
// (tests the merge that happens between sessao prop and sessaoDetalhe)
// ==========================================================================

describe('Session data merge (prop vs detail)', () => {
  /**
   * Builds a merged session object using the same logic as Phase 1.
   * Extracted here to validate correctness independently of React.
   */
  function buildMergedSession(
    sessao: Record<string, any>,
    sessaoDetalhe: Record<string, any> | null,
  ): Record<string, any> {
    if (!sessaoDetalhe || sessaoDetalhe._fallback) {
      return sessao;
    }

    return {
      ...sessao,
      data: sessaoDetalhe.data || sessao.data,
      horario_inicio: sessaoDetalhe.hora_inicio || sessao.horario_inicio,
      horario_fim: sessaoDetalhe.hora_fim || sessao.horario_fim,
      tipo_sessao_id: sessaoDetalhe.tipo_sessao_id ?? sessao.tipo_sessao_id,
      tipo_sessao_codigo: sessaoDetalhe.tipo_sessao_codigo ?? sessao.tipo_sessao_codigo,
      tema_sessao: sessaoDetalhe.nome || sessao.tema_sessao,
      instrutor_id: sessaoDetalhe.instrutor_id ?? sessao.instrutor_id,
      participantes:
        sessaoDetalhe.alunos?.length > 0
          ? sessaoDetalhe.alunos.map((a: any) => ({
              funcionario_id: a.id as number,
              funcao: (a.funcao as 'PIC' | 'SIC') || 'PIC',
            }))
          : sessao.participantes,
      tipo_aeronave:
        sessaoDetalhe.aeronave_modelo ||
        sessaoDetalhe.simulador_aeronave_codigo ||
        sessaoDetalhe.simulador_tipo ||
        sessao.tipo_aeronave,
    };
  }

  it('detail overrides prop fields (authoritative)', () => {
    const prop = {
      id: 32,
      simulador_id: 16,
      data: '2026-03-01',
      horario_inicio: '06:50',
      horario_fim: '08:50',
      instrutor_id: 33,
      tipo_sessao: 'PER',
      tema_sessao: 'SK76 - PERIÓDICO',
      participantes: [{ funcionario_id: 38, funcao: 'PIC' }],
    };

    const detail = {
      data: '2026-03-01',
      hora_inicio: '06:50',
      hora_fim: '08:50',
      nome: 'SK76 - PERIÓDICO - FULL',
      instrutor_id: 33,
      alunos: [
        { id: 38, funcao: 'PIC' },
        { id: 32, funcao: 'SIC' },
      ],
      aeronave_modelo: 'SK76',
      simulador_aeronave_codigo: 'SK76',
    };

    const merged = buildMergedSession(prop, detail);

    expect(merged.data).toBe('2026-03-01');
    expect(merged.horario_inicio).toBe('06:50');
    expect(merged.horario_fim).toBe('08:50');
    expect(merged.tema_sessao).toBe('SK76 - PERIÓDICO - FULL'); // detail wins
    expect(merged.participantes).toHaveLength(2); // detail alunos
    expect(merged.participantes[0].funcionario_id).toBe(38);
    expect(merged.tipo_aeronave).toBe('SK76');
  });

  it('detail empty string does NOT overwrite prop value', () => {
    const prop = {
      id: 32,
      data: '2026-03-01',
      horario_inicio: '06:50',
      horario_fim: '08:50',
      tema_sessao: 'SK76',
      instrutor_id: 33,
      participantes: [{ funcionario_id: 38, funcao: 'PIC' }],
    };

    const detail = {
      data: '', // empty
      hora_inicio: '', // empty
      hora_fim: null, // null
      nome: '', // empty
      alunos: [], // empty
      aeronave_modelo: null,
    };

    const merged = buildMergedSession(prop, detail);

    // Empty/null from detail should NOT overwrite prop values (|| fallback)
    expect(merged.data).toBe('2026-03-01'); // prop value preserved
    expect(merged.horario_inicio).toBe('06:50'); // prop value preserved
    expect(merged.horario_fim).toBe('08:50'); // prop value preserved
    expect(merged.tema_sessao).toBe('SK76'); // prop value preserved
    expect(merged.instrutor_id).toBe(33); // prop value preserved
    // Empty alunos → falls back to prop participantes
    expect(merged.participantes).toHaveLength(1);
    expect(merged.participantes[0].funcionario_id).toBe(38);
  });

  it('fallback mode uses prop data exclusively', () => {
    const prop = {
      id: 32,
      data: '2026-03-01',
      horario_inicio: '06:50',
      horario_fim: '08:50',
      instrutor_id: 33,
      simulador_id: 16,
      tipo_sessao: 'PER',
      tema_sessao: 'SK76',
      participantes: [{ funcionario_id: 38, funcao: 'PIC' }],
    };

    const fallback = { _fallback: true };

    const merged = buildMergedSession(prop, fallback);

    expect(merged.data).toBe('2026-03-01');
    expect(merged.horario_inicio).toBe('06:50');
    expect(merged.horario_fim).toBe('08:50');
    expect(merged.instrutor_id).toBe(33);
    expect(merged.simulador_id).toBe(16);
    expect(merged.tipo_sessao).toBe('PER');
    expect(merged.participantes).toHaveLength(1);
  });

  it('null detail (not yet fetched) returns prop data', () => {
    const prop = {
      id: 32,
      data: '2026-03-01',
      horario_inicio: '06:50',
    };

    const merged = buildMergedSession(prop, null);

    expect(merged).toBe(prop);
    expect(merged.data).toBe('2026-03-01');
  });

  it('tipo_sessao_id uses nullish coalescing (0 preserved)', () => {
    const prop = { id: 1, tipo_sessao_id: 5 };
    const detail = { tipo_sessao_id: 0 }; // falsy but valid FK

    const merged = buildMergedSession(prop, detail);

    // 0 is a valid tipo_sessao_id, should NOT fall back to prop's 5
    expect(merged.tipo_sessao_id).toBe(0);
  });
});

// ==========================================================================
// MODELO SELECTION TESTS
// ==========================================================================

describe('resolveEditModeloSelection', () => {
  const modelos = [
    { id: 1, nome: 'SK76 - INICIAL' },
    { id: 2, nome: 'SK76 - PERIÓDICO' },
    { id: 3, nome: 'AW139 - CHECK' },
  ];

  it('returns null when not in edit mode', () => {
    const result = resolveEditModeloSelection({
      modelos,
      modeloSessaoId: null,
      isEditMode: false,
      temaSessao: 'SK76 - PERIÓDICO',
    });
    expect(result).toBeNull();
  });

  it('returns null when modeloSessaoId already set', () => {
    const result = resolveEditModeloSelection({
      modelos,
      modeloSessaoId: 2,
      isEditMode: true,
      temaSessao: 'SK76 - PERIÓDICO',
    });
    expect(result).toBeNull();
  });

  it('matches model by template_id', () => {
    const result = resolveEditModeloSelection({
      modelos,
      modeloSessaoId: null,
      isEditMode: true,
      templateId: 2,
      temaSessao: 'SK76 - PERIÓDICO',
    });
    expect(result).toEqual({
      id: 2,
      temaSessao: 'SK76 - PERIÓDICO',
      source: 'template_id',
    });
  });

  it('matches model by tema (name) when no template_id', () => {
    const result = resolveEditModeloSelection({
      modelos,
      modeloSessaoId: null,
      isEditMode: true,
      templateId: null,
      temaSessao: 'SK76 - PERIÓDICO',
    });
    expect(result).toEqual({
      id: 2,
      temaSessao: 'SK76 - PERIÓDICO',
      source: 'tema',
    });
  });

  it('returns null when tema does not match any model name', () => {
    const result = resolveEditModeloSelection({
      modelos,
      modeloSessaoId: null,
      isEditMode: true,
      templateId: null,
      temaSessao: 'NONEXISTENT THEME',
    });
    expect(result).toBeNull();
  });

  it('returns null when modelos list is empty', () => {
    const result = resolveEditModeloSelection({
      modelos: [],
      modeloSessaoId: null,
      isEditMode: true,
      templateId: 2,
      temaSessao: 'SK76 - PERIÓDICO',
    });
    expect(result).toBeNull();
  });

  it('template_id takes precedence over tema match when both exist', () => {
    const modelosWithDup = [
      { id: 1, nome: 'AW139 - CHECK' },
      { id: 5, nome: 'AW139 - CHECK' }, // duplicate name, different id
    ];
    const result = resolveEditModeloSelection({
      modelos: modelosWithDup,
      modeloSessaoId: null,
      isEditMode: true,
      templateId: 5,
      temaSessao: 'AW139 - CHECK',
    });
    expect(result).toEqual({
      id: 5,
      temaSessao: 'AW139 - CHECK',
      source: 'template_id',
    });
  });
});

// ==========================================================================
// MODEL FILTERING TESTS
// ==========================================================================

describe('filterModelosSessaoForModal', () => {
  const modelos = [
    {
      id: 1,
      nome: 'SK76 Inicial',
      tipo_sessao_id: 1,
      modelo_aeronave: 'SK76',
      tipo: 'SIMULADOR',
    },
    {
      id: 2,
      nome: 'SK76 Periódico',
      tipo_sessao_id: 2,
      modelo_aeronave: 'SK76',
      tipo: 'SIMULADOR',
    },
    {
      id: 3,
      nome: 'AW139 Check',
      tipo_sessao_id: 3,
      modelo_aeronave: 'AW139',
      tipo: 'SIMULADOR',
    },
    {
      id: 4,
      nome: 'AW139 Aeronave',
      tipo_sessao_id: 3,
      modelo_aeronave: 'AW139',
      tipo: 'AERONAVE',
    },
  ];

  it('filters by equipamento (aeronave model)', () => {
    const result = filterModelosSessaoForModal({
      modelos,
      tipoSessao: { id: 2 },
      equipamento: 'SK76',
    });
    expect(result).toHaveLength(1);
    expect(result[0].nome).toBe('SK76 Periódico');
  });

  it('filters by tipo_dispositivo AERONAVE', () => {
    const result = filterModelosSessaoForModal({
      modelos,
      tipoSessao: { id: 3 },
      equipamento: 'AW139',
      tipoDispositivo: 'AERONAVE',
    });
    expect(result).toHaveLength(1);
    expect(result[0].nome).toBe('AW139 Aeronave');
  });

  it('filters by tipo_dispositivo SIMULADOR (excludes AERONAVE)', () => {
    const result = filterModelosSessaoForModal({
      modelos,
      tipoSessao: { id: 3 },
      equipamento: 'AW139',
      tipoDispositivo: 'SIMULADOR',
    });
    expect(result).toHaveLength(1);
    expect(result[0].nome).toBe('AW139 Check');
  });

  it('returns empty when no match', () => {
    const result = filterModelosSessaoForModal({
      modelos,
      tipoSessao: { id: 99 },
      equipamento: 'NONEXISTENT',
    });
    expect(result).toHaveLength(0);
  });

  it('returns all SIMULADOR modelos when no filters applied (default tipoDispositivo=SIMULADOR)', () => {
    const result = filterModelosSessaoForModal({ modelos });
    expect(result).toHaveLength(3); // 4th is AERONAVE type, excluded by default
    expect(result.every((m) => m.tipo !== 'AERONAVE')).toBe(true);
  });
});

// ==========================================================================
// SPECIAL FICHA FLAGS
// ==========================================================================

describe('deriveSpecialFichaFlags', () => {
  const tiposCheck = [
    { id: 101, codigo: 'FAP07A' },
    { id: 102, codigo: 'FAP13A' },
    { id: 103, codigo: 'FAP14' },
  ];

  it('auto-enables ficha instrutor when FAP07 selected', () => {
    const result = deriveSpecialFichaFlags({
      checksSelecionados: [101],
      tiposCheck,
      gerarFichaInstrutorManual: false,
      gerarFichaExaminadorManual: false,
    });
    expect(result.hasFap07Selecionada).toBe(true);
    expect(result.gerarFichaInstrutorEfetivo).toBe(true);
    expect(result.gerarFichaExaminadorEfetivo).toBe(false);
  });

  it('auto-enables ficha examinador when FAP13 selected', () => {
    const result = deriveSpecialFichaFlags({
      checksSelecionados: [102],
      tiposCheck,
      gerarFichaInstrutorManual: false,
      gerarFichaExaminadorManual: false,
    });
    expect(result.hasFap13Selecionada).toBe(true);
    expect(result.gerarFichaExaminadorEfetivo).toBe(true);
    expect(result.gerarFichaInstrutorEfetivo).toBe(false);
  });

  it('manual flags work independently', () => {
    const result = deriveSpecialFichaFlags({
      checksSelecionados: [],
      tiposCheck,
      gerarFichaInstrutorManual: true,
      gerarFichaExaminadorManual: true,
    });
    expect(result.gerarFichaInstrutorEfetivo).toBe(true);
    expect(result.gerarFichaExaminadorEfetivo).toBe(true);
  });

  it('manual flag is superseded by auto-flag (OR logic)', () => {
    const result = deriveSpecialFichaFlags({
      checksSelecionados: [101],
      tiposCheck,
      gerarFichaInstrutorManual: false, // manual off, but auto-on from FAP07
      gerarFichaExaminadorManual: false,
    });
    expect(result.gerarFichaInstrutorEfetivo).toBe(true);
  });
});

// ==========================================================================
// MODEL CHANGE DEFAULTS
// ==========================================================================

describe('applyModelChangeDefaults', () => {
  it('returns null when same model selected', () => {
    const result = applyModelChangeDefaults({
      modeloAnteriorId: 1,
      modeloId: 1,
      checksPadrao: [101],
    });
    expect(result).toBeNull();
  });

  it('resets checks when model changes', () => {
    const result = applyModelChangeDefaults({
      modeloAnteriorId: 1,
      modeloId: 2,
      checksPadrao: [101, 102],
    });
    expect(result).toEqual({
      checksSelecionados: [101, 102],
      gerarFichaInstrutor: false,
      gerarFichaExaminador: false,
    });
  });

  it('sets empty checks when new model has none', () => {
    const result = applyModelChangeDefaults({
      modeloAnteriorId: 1,
      modeloId: 2,
      checksPadrao: [],
    });
    expect(result).toEqual({
      checksSelecionados: [],
      gerarFichaInstrutor: false,
      gerarFichaExaminador: false,
    });
  });
});
