import { describe, it, expect } from 'vitest';
import {
  formatarAeronave,
  normalizeText,
  normalizeModeloOperacional,
  getFuncaoPreferidaFluxoB,
  isFuncaoCompativelFluxoB,
  funcaoExigeComandante,
  isTripulanteCompativelComFuncao,
  intervaloSobrepoe,
  inferirModoPeriodo,
  getQuinzenaSelecionada,
  getQuinzenaPreset,
  getQuinzenaFiltro,
  getQuinzenaBadge,
  normalizeQuinzena,
  getQuinzenaLabel,
  formatarResumoConflitoSubstituicao,
  getResumoAlocacaoExistente,
  getAvisoQuinzenaCruzada,
  buildFallbackTripulante,
  getSlotGerencialKeysDaFuncao,
  getPrimeiroSlotGerencialDaFuncao,
  getResumoSlotsGerenciaisSelecionados,
} from '../tripulacao-utils';
import { makeAlocacao, makeQuinzena, makeTripulante } from '@/test/mocks/factories/escala.factory';

describe('slot helpers', () => {
  const slots = [
    {
      key: 'q1-pic',
      funcao: 'PIC',
      quinzena: makeQuinzena({
        numero: 1,
        mes: 5,
        data_inicio: '2026-05-01',
        data_fim: '2026-05-15',
      }),
    },
    {
      key: 'q2-pic',
      funcao: 'PIC',
      quinzena: makeQuinzena({
        numero: 2,
        mes: 5,
        data_inicio: '2026-05-16',
        data_fim: '2026-05-31',
      }),
    },
    {
      key: 'q1-sic',
      funcao: 'SIC',
      quinzena: makeQuinzena({
        numero: 1,
        mes: 5,
        data_inicio: '2026-05-01',
        data_fim: '2026-05-15',
      }),
    },
  ];

  it('returns all slot keys for the selected funcao', () => {
    expect(getSlotGerencialKeysDaFuncao(slots, 'PIC')).toEqual(['q1-pic', 'q2-pic']);
  });

  it('returns the first slot of the selected funcao', () => {
    expect(getPrimeiroSlotGerencialDaFuncao(slots, 'sic')?.key).toBe('q1-sic');
  });

  it('builds a readable summary for selected slot keys', () => {
    expect(getResumoSlotsGerenciaisSelecionados(slots, ['q1-pic', 'q2-pic'])).toBe(
      '1Q PIC, 2Q PIC',
    );
  });
});

// ─── formatarAeronave ──────────────────────────────────────────────────────

describe('formatarAeronave', () => {
  it('joins prefixo and modelo with space', () => {
    expect(formatarAeronave('PS-CDV', 'AW139')).toBe('PS-CDV AW139');
  });

  it('returns only prefixo when modelo is null', () => {
    expect(formatarAeronave('PS-CDV', null)).toBe('PS-CDV');
  });

  it('returns only modelo when prefixo is null', () => {
    expect(formatarAeronave(null, 'AW139')).toBe('AW139');
  });

  it('returns "Aeronave" when both are null', () => {
    expect(formatarAeronave(null, null)).toBe('Aeronave');
  });

  it('returns "Aeronave" when both are undefined', () => {
    expect(formatarAeronave()).toBe('Aeronave');
  });

  it('returns "Aeronave" when both are empty strings', () => {
    expect(formatarAeronave('', '')).toBe('Aeronave');
  });
});

// ─── normalizeText ─────────────────────────────────────────────────────────

describe('normalizeText', () => {
  it('trims and uppercases a normal string', () => {
    expect(normalizeText('  joao silva  ')).toBe('JOAO SILVA');
  });

  it('returns empty string for null', () => {
    expect(normalizeText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeText()).toBe('');
  });

  it('uppercases already trimmed string', () => {
    expect(normalizeText('pic')).toBe('PIC');
  });
});

// ─── normalizeModeloOperacional ────────────────────────────────────────────

describe('normalizeModeloOperacional', () => {
  it('normalizes S76 variant to SK76', () => {
    expect(normalizeModeloOperacional('S-76')).toBe('SK76');
    expect(normalizeModeloOperacional('S76')).toBe('SK76');
    expect(normalizeModeloOperacional('sk76')).toBe('SK76');
  });

  it('normalizes AW139 to AW139', () => {
    expect(normalizeModeloOperacional('AW-139')).toBe('AW139');
    expect(normalizeModeloOperacional('aw139')).toBe('AW139');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeModeloOperacional(null)).toBe('');
    expect(normalizeModeloOperacional()).toBe('');
  });

  it('uppercases and strips hyphens/spaces for unknown models', () => {
    expect(normalizeModeloOperacional('Bell 206')).toBe('BELL206');
  });
});

// ─── getFuncaoPreferidaFluxoB ──────────────────────────────────────────────

describe('getFuncaoPreferidaFluxoB', () => {
  it('returns SIC for COP roles', () => {
    expect(getFuncaoPreferidaFluxoB('PILOTO_COP')).toBe('SIC');
    expect(getFuncaoPreferidaFluxoB('cop')).toBe('SIC');
  });

  it('returns PIC for commander roles', () => {
    expect(getFuncaoPreferidaFluxoB('PILOTO_CMT')).toBe('PIC');
  });

  it('returns PIC for null/undefined', () => {
    expect(getFuncaoPreferidaFluxoB(null)).toBe('PIC');
    expect(getFuncaoPreferidaFluxoB()).toBe('PIC');
  });
});

// ─── isFuncaoCompativelFluxoB ──────────────────────────────────────────────

describe('isFuncaoCompativelFluxoB', () => {
  it('COP role is compatible only with SIC', () => {
    expect(isFuncaoCompativelFluxoB('PILOTO_COP', 'SIC')).toBe(true);
    expect(isFuncaoCompativelFluxoB('PILOTO_COP', 'PIC')).toBe(false);
  });

  it('COM role is compatible with PIC and SIC', () => {
    expect(isFuncaoCompativelFluxoB('PILOTO_COM', 'PIC')).toBe(true);
    expect(isFuncaoCompativelFluxoB('PILOTO_COM', 'SIC')).toBe(true);
    expect(isFuncaoCompativelFluxoB('PILOTO_CMT', 'SIC')).toBe(true);
  });

  it('returns false for empty funcao', () => {
    expect(isFuncaoCompativelFluxoB('PILOTO_CMT', '')).toBe(false);
    expect(isFuncaoCompativelFluxoB('PILOTO_CMT', null)).toBe(false);
  });

  it('other roles accept PIC or SIC', () => {
    expect(isFuncaoCompativelFluxoB('INSTRUTOR', 'PIC')).toBe(true);
    expect(isFuncaoCompativelFluxoB('INSTRUTOR', 'SIC')).toBe(true);
  });
});

// ─── funcaoExigeComandante ─────────────────────────────────────────────────

describe('funcaoExigeComandante', () => {
  it.each(['PIC', 'PIC_CHK', 'INSTRUTOR', 'FLEX'])('"%s" requires commander', (funcao) => {
    expect(funcaoExigeComandante(funcao)).toBe(true);
  });

  it('SIC does NOT require commander', () => {
    expect(funcaoExigeComandante('SIC')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(funcaoExigeComandante(null)).toBe(false);
    expect(funcaoExigeComandante()).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(funcaoExigeComandante('pic')).toBe(true);
    expect(funcaoExigeComandante('instrutor')).toBe(true);
  });
});

// ─── isTripulanteCompativelComFuncao ───────────────────────────────────────

describe('isTripulanteCompativelComFuncao', () => {
  it('COP is incompatible with PIC', () => {
    expect(isTripulanteCompativelComFuncao('PILOTO_COP', 'PIC')).toBe(false);
  });

  it('COP is incompatible with INSTRUTOR', () => {
    expect(isTripulanteCompativelComFuncao('PILOTO_COP', 'INSTRUTOR')).toBe(false);
  });

  it('COP is compatible with SIC (not commander)', () => {
    expect(isTripulanteCompativelComFuncao('PILOTO_COP', 'SIC')).toBe(true);
  });

  it('CMT is compatible with PIC', () => {
    expect(isTripulanteCompativelComFuncao('PILOTO_CMT', 'PIC')).toBe(true);
  });

  it('any role is compatible with SIC', () => {
    expect(isTripulanteCompativelComFuncao('PILOTO_CMT', 'SIC')).toBe(true);
    expect(isTripulanteCompativelComFuncao('INSTRUTOR', 'SIC')).toBe(true);
  });
});

// ─── intervaloSobrepoe ─────────────────────────────────────────────────────

describe('intervaloSobrepoe', () => {
  // A: 05–10, B: 08–15 → overlap
  it('overlapping intervals return true', () => {
    expect(intervaloSobrepoe('2026-05-05', '2026-05-10', '2026-05-08', '2026-05-15')).toBe(true);
  });

  // A: 01–16, B: 17–31 → no overlap
  it('adjacent but non-overlapping intervals return false', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-16', '2026-05-17', '2026-05-31')).toBe(false);
  });

  // A: 01–05, B: 06–10 → no overlap
  it('non-overlapping return false', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-05', '2026-05-06', '2026-05-10')).toBe(false);
  });

  // A: 01–31, B: 05–10 → A contains B
  it('A containing B returns true', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-31', '2026-05-05', '2026-05-10')).toBe(true);
  });

  // A: 05–10, B: 01–31 → B contains A
  it('B containing A returns true', () => {
    expect(intervaloSobrepoe('2026-05-05', '2026-05-10', '2026-05-01', '2026-05-31')).toBe(true);
  });

  // A: 05–10, B: 10–15 → touch at boundary
  it('intervals touching at boundary return true', () => {
    expect(intervaloSobrepoe('2026-05-05', '2026-05-10', '2026-05-10', '2026-05-15')).toBe(true);
  });

  // A: 01–01, B: 01–01 → same single day
  it('same single-day interval returns true', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-01', '2026-05-01', '2026-05-01')).toBe(true);
  });

  // A: 01–01, B: 02–02 → different single days
  it('different single-day intervals return false', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-01', '2026-05-02', '2026-05-02')).toBe(false);
  });

  // B ends before A starts
  it('B entirely before A returns false', () => {
    expect(intervaloSobrepoe('2026-05-10', '2026-05-20', '2026-05-01', '2026-05-09')).toBe(false);
  });

  // A ends before B starts
  it('A entirely before B returns false', () => {
    expect(intervaloSobrepoe('2026-05-01', '2026-05-09', '2026-05-10', '2026-05-20')).toBe(false);
  });
});

// ─── inferirModoPeriodo ────────────────────────────────────────────────────

describe('inferirModoPeriodo', () => {
  const quinzenas = [
    makeQuinzena({ numero: 1, mes: 5, data_inicio: '2026-05-01', data_fim: '2026-05-16' }),
    makeQuinzena({
      id: 'q2',
      numero: 2,
      mes: 5,
      data_inicio: '2026-05-17',
      data_fim: '2026-05-31',
    }),
  ];

  it('returns "1q" when dates match first quinzena', () => {
    expect(inferirModoPeriodo('2026-05-01', '2026-05-16', quinzenas, 5)).toBe('1q');
  });

  it('returns "2q" when dates match second quinzena', () => {
    expect(inferirModoPeriodo('2026-05-17', '2026-05-31', quinzenas, 5)).toBe('2q');
  });

  it('returns "custom" for arbitrary date range', () => {
    expect(inferirModoPeriodo('2026-05-03', '2026-05-20', quinzenas, 5)).toBe('custom');
  });

  it('returns "custom" when quinzenas array is empty', () => {
    expect(inferirModoPeriodo('2026-05-01', '2026-05-16', [], 5)).toBe('custom');
  });
});

// ─── getQuinzenaSelecionada ────────────────────────────────────────────────

describe('getQuinzenaSelecionada', () => {
  const quinzenas = [
    makeQuinzena({ numero: 1, mes: 5, data_inicio: '2026-05-01', data_fim: '2026-05-16' }),
    makeQuinzena({
      id: 'q2',
      numero: 2,
      mes: 5,
      data_inicio: '2026-05-17',
      data_fim: '2026-05-31',
    }),
  ];

  it('returns first quinzena for mode "1q"', () => {
    const result = getQuinzenaSelecionada('1q', quinzenas, 5, '2026-05-01', '2026-05-16');
    expect(result?.numero).toBe(1);
  });

  it('returns second quinzena for mode "2q"', () => {
    const result = getQuinzenaSelecionada('2q', quinzenas, 5, '2026-05-17', '2026-05-31');
    expect(result?.numero).toBe(2);
  });

  it('returns overlapping quinzena for mode "custom"', () => {
    const result = getQuinzenaSelecionada('custom', quinzenas, 5, '2026-05-05', '2026-05-10');
    expect(result?.numero).toBe(1);
  });

  it('returns null when no quinzena found', () => {
    const result = getQuinzenaSelecionada('1q', [], 5, '2026-05-01', '2026-05-16');
    expect(result).toBeNull();
  });
});

// ─── getQuinzenaPreset ─────────────────────────────────────────────────────

describe('getQuinzenaPreset', () => {
  const quinzenas = [
    makeQuinzena({ numero: 1, mes: 5 }),
    makeQuinzena({
      id: 'q2',
      numero: 2,
      mes: 5,
      data_inicio: '2026-05-17',
      data_fim: '2026-05-31',
    }),
  ];

  it('returns first quinzena for "1q"', () => {
    expect(getQuinzenaPreset('1q', quinzenas, 5)?.numero).toBe(1);
  });

  it('returns second quinzena for "2q"', () => {
    expect(getQuinzenaPreset('2q', quinzenas, 5)?.numero).toBe(2);
  });
});

// ─── getQuinzenaFiltro ─────────────────────────────────────────────────────

describe('getQuinzenaFiltro', () => {
  it('maps "1q" to "primeira"', () => {
    expect(getQuinzenaFiltro('1q')).toBe('primeira');
  });

  it('maps "2q" to "segunda"', () => {
    expect(getQuinzenaFiltro('2q')).toBe('segunda');
  });

  it('maps "custom" to "personalizada"', () => {
    expect(getQuinzenaFiltro('custom')).toBe('personalizada');
  });
});

// ─── normalizeQuinzena ─────────────────────────────────────────────────────

describe('normalizeQuinzena', () => {
  it.each(['primeira', '1', '1q', '1a', '1ª', 'primeira quinzena'])(
    '"%s" → "primeira"',
    (input) => {
      expect(normalizeQuinzena(input)).toBe('primeira');
    },
  );

  it.each(['segunda', '2', '2q', '2a', '2ª', 'segunda quinzena'])('"%s" → "segunda"', (input) => {
    expect(normalizeQuinzena(input)).toBe('segunda');
  });

  it('returns null for unknown values', () => {
    expect(normalizeQuinzena('terceira')).toBeNull();
    expect(normalizeQuinzena(null)).toBeNull();
    expect(normalizeQuinzena()).toBeNull();
  });
});

// ─── getQuinzenaLabel ──────────────────────────────────────────────────────

describe('getQuinzenaLabel', () => {
  it('returns "1Q" for numero 1', () => {
    expect(getQuinzenaLabel(1)).toBe('1Q');
  });

  it('returns "2Q" for numero 2', () => {
    expect(getQuinzenaLabel(2)).toBe('2Q');
  });

  it('returns null for other values', () => {
    expect(getQuinzenaLabel(0)).toBeNull();
    expect(getQuinzenaLabel(null)).toBeNull();
    expect(getQuinzenaLabel(undefined)).toBeNull();
  });
});

// ─── getQuinzenaBadge ──────────────────────────────────────────────────────

describe('getQuinzenaBadge', () => {
  it('returns badge with label "Q1" for "primeira"', () => {
    const badge = getQuinzenaBadge('primeira');
    expect(badge).not.toBeNull();
    expect(badge?.label).toBe('Q1');
  });

  it('returns badge with label "Q2" for "segunda"', () => {
    const badge = getQuinzenaBadge('segunda');
    expect(badge?.label).toBe('Q2');
  });

  it('returns null for null/undefined', () => {
    expect(getQuinzenaBadge(null)).toBeNull();
    expect(getQuinzenaBadge(undefined)).toBeNull();
  });
});

// ─── getResumoAlocacaoExistente ────────────────────────────────────────────

describe('getResumoAlocacaoExistente', () => {
  it('returns null when tripulante has no existing allocation', () => {
    const tripulante = makeTripulante({ ja_alocado_em: null });
    expect(getResumoAlocacaoExistente(tripulante)).toBeNull();
  });

  it('builds a full summary with quinzena + aeronave + funcao + dates', () => {
    const tripulante = makeTripulante({
      ja_alocado_em: makeAlocacao({
        quinzena_numero: 1,
        aeronave_prefixo: 'PR-BGE',
        funcao: 'PIC',
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
      }) as any,
    });
    const result = getResumoAlocacaoExistente(tripulante);
    expect(result).toContain('Já alocado em');
    expect(result).toContain('1Q');
    expect(result).toContain('PR-BGE');
    expect(result).toContain('PIC');
    expect(result).toContain('01/05/2026');
    expect(result).toContain('16/05/2026');
  });

  it('builds summary without quinzena when quinzena_numero is null', () => {
    const tripulante = makeTripulante({
      ja_alocado_em: makeAlocacao({
        quinzena_numero: null,
        aeronave_prefixo: 'PR-BGE',
        funcao: 'SIC',
        data_inicio: '2026-05-01',
        data_fim: '2026-05-16',
      }) as any,
    });
    const result = getResumoAlocacaoExistente(tripulante);
    expect(result).toContain('PR-BGE');
    expect(result).not.toContain('1Q');
  });

  it('returns null for blocking situacoes so the explicit motivo is shown', () => {
    const tripulante = makeTripulante({
      pode_ser_alocado: false,
      ja_alocado_em: makeAlocacao({
        origem: 'funcionario_ferias',
        situacao_tipo: 'FERIAS',
        situacao_nome: 'Férias',
        quinzena_numero: null,
        aeronave_prefixo: null,
        funcao: null,
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
      }) as any,
    });

    expect(getResumoAlocacaoExistente(tripulante)).toBeNull();
  });

  it('builds summary for substituivel ferias when the tripulante can still be selected', () => {
    const tripulante = makeTripulante({
      pode_ser_alocado: true,
      ja_alocado_em: makeAlocacao({
        origem: 'funcionario_ferias',
        situacao_tipo: 'FERIAS',
        situacao_nome: 'Férias',
        quinzena_numero: null,
        aeronave_prefixo: null,
        funcao: null,
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
      }) as any,
    });

    expect(getResumoAlocacaoExistente(tripulante)).toBe(
      'Já alocado em Férias · 17/05/2026 → 31/05/2026',
    );
  });
});

describe('formatarResumoConflitoSubstituicao', () => {
  it('builds a detailed summary with quinzena, funcao, origem and period', () => {
    expect(
      formatarResumoConflitoSubstituicao({
        quinzena_numero: 2,
        funcao: 'PIC',
        aeronave_prefixo: null,
        aeronave_modelo: null,
        situacao_nome: null,
        situacao_tipo: null,
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
      }),
    ).toBe('2Q · PIC · Sem aeronave · 17/05/2026 → 31/05/2026');
  });

  it('prefers the situacao name when the conflict is a blocking situation', () => {
    expect(
      formatarResumoConflitoSubstituicao({
        quinzena_numero: null,
        funcao: null,
        aeronave_prefixo: 'PS-CDV',
        aeronave_modelo: 'AW139',
        situacao_nome: 'Férias',
        situacao_tipo: 'FERIAS',
        data_inicio: '2026-05-17',
        data_fim: '2026-05-31',
      }),
    ).toBe('Férias · 17/05/2026 → 31/05/2026');
  });
});

// ─── getAvisoQuinzenaCruzada ───────────────────────────────────────────────

describe('getAvisoQuinzenaCruzada', () => {
  it('returns null when tripulante is null', () => {
    expect(getAvisoQuinzenaCruzada(null, 'primeira')).toBeNull();
  });

  it('returns null when quinzenaSelecionada is null', () => {
    const tripulante = makeTripulante({ quinzena: 'primeira' });
    expect(getAvisoQuinzenaCruzada(tripulante, null)).toBeNull();
  });

  it('returns null when quinzenaSelecionada is "personalizada"', () => {
    const tripulante = makeTripulante({ quinzena: 'primeira' });
    expect(getAvisoQuinzenaCruzada(tripulante, 'personalizada')).toBeNull();
  });

  it('returns null when quinzenas match', () => {
    const tripulante = makeTripulante({ quinzena: 'primeira' });
    expect(getAvisoQuinzenaCruzada(tripulante, 'primeira')).toBeNull();
  });

  it('returns warning when tripulante quinzena differs from selecionada', () => {
    const tripulante = makeTripulante({ nome_guerra: 'Silva', quinzena: 'primeira' });
    const result = getAvisoQuinzenaCruzada(tripulante, 'segunda');
    expect(result).toBeTruthy();
    expect(result).toContain('Silva');
    expect(result).toContain('1Q');
    expect(result).toContain('2Q');
  });

  it('uses nome when nome_guerra is not set', () => {
    const tripulante = makeTripulante({
      nome: 'João Ferreira',
      nome_guerra: undefined,
      quinzena: 'segunda',
    });
    const result = getAvisoQuinzenaCruzada(tripulante, 'primeira');
    expect(result).toContain('João Ferreira');
  });
});

// ─── buildFallbackTripulante ───────────────────────────────────────────────

describe('buildFallbackTripulante', () => {
  it('returns null when alocacao is undefined', () => {
    expect(buildFallbackTripulante(undefined)).toBeNull();
  });

  it('builds TripulanteOperacional from EscalaAlocacao data', () => {
    const alocacao = makeAlocacao({
      funcionario_id: '99',
      funcionario_nome: 'Pedro Costa',
      funcionario_guerra: 'Costa',
      funcionario_matricula: 'MAT099',
      funcionario_role: 'PILOTO_CMT',
    });
    const result = buildFallbackTripulante(alocacao);

    expect(result).not.toBeNull();
    expect(result?.funcionario_id).toBe('99');
    expect(result?.nome).toBe('Pedro Costa');
    expect(result?.nome_guerra).toBe('Costa');
    expect(result?.matricula).toBe('MAT099');
    expect(result?.role).toBe('PILOTO_CMT');
    expect(result?.ja_alocado_nesta_escala).toBe(true);
    expect(result?.pode_ser_alocado).toBe(true);
  });

  it('falls back to funcao when funcionario_role is null', () => {
    const alocacao = makeAlocacao({ funcionario_role: null, funcao: 'PIC' });
    const result = buildFallbackTripulante(alocacao);
    expect(result?.role).toBe('PIC');
  });
});
