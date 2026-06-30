/**
 * T2 — frmsUtils unit tests
 *
 * Cobre getComplianceColor, getComplianceHex, getComplianceLabel,
 * getEffectivenessColor, getEffectivenessHex, getEffectivenessLabel
 *
 * Todos os boundary tests (limites default + limites customizados).
 * Anti-regressão: VIOLACAO_PCT=101 (não 100), separação crítico vs violação.
 */
import { describe, it, expect } from 'vitest';
import { isTripulanteOperacional, getQuinzenaDateRange, getQuinzenasDoMes } from '../frmsUtils';
import {
  getComplianceColor,
  getComplianceHex,
  getComplianceLabel,
  getEffectivenessColor,
  getEffectivenessHex,
  getEffectivenessLabel,
  formatFrmsDate,
} from '../frmsUtils';

// Defaults: AVISO=80, ATENCAO=90, CRITICO=95, VIOLACAO=101
// Defaults: VERDE=90, AMARELO=77, VERMELHO=65
const cfg = null; // usa defaults

// ─── getComplianceColor ──────────────────────────────────────────────

describe('getComplianceColor', () => {
  it('< 80% → text-teal-700', () => {
    expect(getComplianceColor(79.9, cfg)).toBe('text-teal-700');
    expect(getComplianceColor(0, cfg)).toBe('text-teal-700');
  });

  it('85% → text-amber-700 (Aviso)', () => {
    expect(getComplianceColor(85, cfg)).toBe('text-amber-700');
  });

  it('89.9% → text-amber-700', () => {
    expect(getComplianceColor(89.9, cfg)).toBe('text-amber-700');
  });

  it('90% → text-orange-600 (Atenção)', () => {
    expect(getComplianceColor(90, cfg)).toBe('text-orange-600');
  });

  it('94.9% → text-orange-600', () => {
    expect(getComplianceColor(94.9, cfg)).toBe('text-orange-600');
  });

  it('95% → text-orange-800 (Crítico)', () => {
    expect(getComplianceColor(95, cfg)).toBe('text-orange-800');
  });

  it('100% → text-orange-800 (Crítico, NÃO violação)', () => {
    // Anti-regressão: 100% < 101% → ainda é crítico
    expect(getComplianceColor(100, cfg)).toBe('text-orange-800');
    expect(getComplianceColor(100, cfg)).not.toBe('text-red-800');
  });

  it('101% → text-red-800 (Violação boundary)', () => {
    expect(getComplianceColor(101, cfg)).toBe('text-red-800');
  });

  it('200% → text-red-800', () => {
    expect(getComplianceColor(200, cfg)).toBe('text-red-800');
  });
});

// ─── getComplianceHex ───────────────────────────────────────────────

describe('getComplianceHex', () => {
  it('< 80% → #0F766E (teal)', () => {
    expect(getComplianceHex(79.9, cfg)).toBe('#0F766E');
  });

  it('85% → #D97706 (amber)', () => {
    expect(getComplianceHex(85, cfg)).toBe('#D97706');
  });

  it('90% → #EA580C (orange)', () => {
    expect(getComplianceHex(90, cfg)).toBe('#EA580C');
  });

  it('95% → #C2410C (orange-700)', () => {
    expect(getComplianceHex(95, cfg)).toBe('#C2410C');
  });

  it('100% → #C2410C (Crítico)', () => {
    expect(getComplianceHex(100, cfg)).toBe('#C2410C');
    expect(getComplianceHex(100, cfg)).not.toBe('#991B1B');
  });

  it('101% → #991B1B (red-800, Violação)', () => {
    expect(getComplianceHex(101, cfg)).toBe('#991B1B');
  });
});

// ─── getComplianceLabel ─────────────────────────────────────────────

describe('getComplianceLabel', () => {
  it('< 80% → Dentro do Limite', () => {
    expect(getComplianceLabel(79, cfg)).toBe('Dentro do Limite');
  });

  it('85% → Aviso Preventivo', () => {
    expect(getComplianceLabel(85, cfg)).toBe('Aviso Preventivo');
  });

  it('90% → Nível de Atenção', () => {
    expect(getComplianceLabel(90, cfg)).toBe('Nível de Atenção');
  });

  it('95% → Nível Crítico', () => {
    expect(getComplianceLabel(95, cfg)).toBe('Nível Crítico');
  });

  it('100% → Nível Crítico (NÃO Violação Regulatória)', () => {
    // Anti-regressão: 100% ≠ violação (threshold é 101)
    expect(getComplianceLabel(100, cfg)).toBe('Nível Crítico');
    expect(getComplianceLabel(100, cfg)).not.toBe('Violação Regulatória');
  });

  it('101% → Violação Regulatória (boundary)', () => {
    expect(getComplianceLabel(101, cfg)).toBe('Violação Regulatória');
  });

  it('150% → Violação Regulatória', () => {
    expect(getComplianceLabel(150, cfg)).toBe('Violação Regulatória');
  });
});

// ─── getEffectivenessColor ──────────────────────────────────────────

describe('getEffectivenessColor', () => {
  it('≥ 90% → text-teal-700 (Pleno)', () => {
    expect(getEffectivenessColor(90, cfg)).toBe('text-teal-700');
    expect(getEffectivenessColor(100, cfg)).toBe('text-teal-700');
  });

  it('89% → text-orange-600 (Atenção)', () => {
    expect(getEffectivenessColor(89, cfg)).toBe('text-orange-600');
  });

  it('78% → text-orange-600 (Atenção, logo acima de amarelo)', () => {
    expect(getEffectivenessColor(78, cfg)).toBe('text-orange-600');
  });

  it('77% → text-amber-700 (Início de Degradação, boundary)', () => {
    expect(getEffectivenessColor(77, cfg)).toBe('text-amber-700');
  });

  it('66% → text-amber-700 (logo acima de vermelho)', () => {
    expect(getEffectivenessColor(66, cfg)).toBe('text-amber-700');
  });

  it('65% → text-rose-700 (Degradação severa, boundary)', () => {
    expect(getEffectivenessColor(65, cfg)).toBe('text-rose-700');
  });

  it('0% → text-rose-700', () => {
    expect(getEffectivenessColor(0, cfg)).toBe('text-rose-700');
  });
});

// ─── getEffectivenessHex ────────────────────────────────────────────

describe('getEffectivenessHex', () => {
  it('≥ 90% → #0F766E (teal)', () => {
    expect(getEffectivenessHex(90, cfg)).toBe('#0F766E');
  });

  it('89% → #EA580C (orange, Atenção)', () => {
    expect(getEffectivenessHex(89, cfg)).toBe('#EA580C');
  });

  it('77% → #D97706 (amber, Degradação, boundary)', () => {
    expect(getEffectivenessHex(77, cfg)).toBe('#D97706');
  });

  it('65% → #BE123C (rose, Degradação severa, boundary)', () => {
    expect(getEffectivenessHex(65, cfg)).toBe('#BE123C');
  });
});

// ─── getEffectivenessLabel ──────────────────────────────────────────

describe('getEffectivenessLabel', () => {
  it('≥ 90% → Sem degradação estimada', () => {
    expect(getEffectivenessLabel(90, cfg)).toBe('Sem degradação estimada');
    expect(getEffectivenessLabel(100, cfg)).toBe('Sem degradação estimada');
  });

  it('89% → Atenção operacional', () => {
    expect(getEffectivenessLabel(89, cfg)).toBe('Atenção operacional');
  });

  it('77% → Degradação estimada moderada (boundary)', () => {
    expect(getEffectivenessLabel(77, cfg)).toBe('Degradação estimada moderada');
  });

  it('65% → Degradação estimada elevada (boundary)', () => {
    expect(getEffectivenessLabel(65, cfg)).toBe('Degradação estimada elevada');
  });

  it('0% → Degradação estimada elevada', () => {
    expect(getEffectivenessLabel(0, cfg)).toBe('Degradação estimada elevada');
  });
});

// ─── Limites customizados ───────────────────────────────────────────

describe('frmsUtils — limites customizados', () => {
  const custom = {
    ALERTA_AVISO_PCT: 80,
    ALERTA_ATENCAO_PCT: 85,
    ALERTA_CRITICO_PCT: 90,
    ALERTA_VIOLACAO_PCT: 100,
    EFFECTIV_VERDE_MIN: 95,
    EFFECTIV_AMARELO_MAX: 80,
    EFFECTIV_VERMELHO_MAX: 60,
  };

  it('getComplianceColor: 100% → text-red-700 com VIOLACAO=100', () => {
    expect(getComplianceColor(100, custom)).toBe('text-red-800');
  });

  it('getComplianceLabel: 99% → Nível Crítico com VIOLACAO=100', () => {
    expect(getComplianceLabel(99, custom)).toBe('Nível Crítico');
  });

  it('getEffectivenessColor: 94% → text-orange-600 com VERDE=95', () => {
    expect(getEffectivenessColor(94, custom)).toBe('text-orange-600');
  });

  it('getEffectivenessColor: 95% → text-teal-700 com VERDE=95 (boundary)', () => {
    expect(getEffectivenessColor(95, custom)).toBe('text-teal-700');
  });

  it('getEffectivenessLabel: 60% → Degradação estimada elevada com VERMELHO=60 (boundary)', () => {
    expect(getEffectivenessLabel(60, custom)).toBe('Degradação estimada elevada');
  });

  it('getEffectivenessLabel: 61% → Degradação estimada moderada com VERMELHO=60', () => {
    expect(getEffectivenessLabel(61, custom)).toBe('Degradação estimada moderada');
  });
});

describe('formatFrmsDate', () => {
  it('converte ISO para DD/MM/YYYY', () => {
    expect(formatFrmsDate('2026-05-30')).toBe('30/05/2026');
  });

  it('mantém entrada inválida sem quebrar', () => {
    expect(formatFrmsDate('30/05/2026')).toBe('30/05/2026');
    expect(formatFrmsDate(null)).toBe('—');
  });
});

describe('isTripulanteOperacional', () => {
  it('retorna true para PILOTO', () => {
    expect(isTripulanteOperacional('PILOTO')).toBe(true);
  });

  it('retorna true para COPILOTO', () => {
    expect(isTripulanteOperacional('COPILOTO')).toBe(true);
  });

  it('retorna true para COMANDANTE', () => {
    expect(isTripulanteOperacional('COMANDANTE')).toBe(true);
  });

  it('retorna true para PIC', () => {
    expect(isTripulanteOperacional('PIC')).toBe(true);
  });

  it('retorna true para SIC', () => {
    expect(isTripulanteOperacional('SIC')).toBe(true);
  });

  it('retorna true com case insensitive', () => {
    expect(isTripulanteOperacional('piloto')).toBe(true);
    expect(isTripulanteOperacional('Piloto')).toBe(true);
    expect(isTripulanteOperacional('  COMANDANTE  ')).toBe(true);
  });

  it('retorna false para null/undefined/vazio', () => {
    expect(isTripulanteOperacional(null)).toBe(false);
    expect(isTripulanteOperacional(undefined)).toBe(false);
    expect(isTripulanteOperacional('')).toBe(false);
  });

  it('retorna false para funcoes nao tripulantes', () => {
    expect(isTripulanteOperacional('INVA')).toBe(false);
    expect(isTripulanteOperacional('MECANICO')).toBe(false);
    expect(isTripulanteOperacional('MANUTENCAO')).toBe(false);
    expect(isTripulanteOperacional('ADMINISTRATIVO')).toBe(false);
  });
});

describe('getQuinzenaDateRange', () => {
  it('Q1 de junho 2026: 01/06 a 15/06', () => {
    const range = getQuinzenaDateRange('2026-06', 'Q1');
    expect(range.start).toBe('2026-06-01');
    expect(range.end).toBe('2026-06-15');
    expect(range.label).toContain('Q1');
  });

  it('Q2 de junho 2026: 16/06 a 30/06', () => {
    const range = getQuinzenaDateRange('2026-06', 'Q2');
    expect(range.start).toBe('2026-06-16');
    expect(range.end).toBe('2026-06-30');
    expect(range.label).toContain('Q2');
  });

  it('Q2 de fevereiro 2026: 16/02 a 28/02 (ano nao bissexto)', () => {
    const range = getQuinzenaDateRange('2026-02', 'Q2');
    expect(range.start).toBe('2026-02-16');
    expect(range.end).toBe('2026-02-28');
  });
});

describe('getQuinzenasDoMes', () => {
  it('retorna ambas quinzenas para junho 2026', () => {
    const { q1, q2 } = getQuinzenasDoMes('2026-06');
    expect(q1.start).toBe('2026-06-01');
    expect(q1.end).toBe('2026-06-15');
    expect(q2.start).toBe('2026-06-16');
    expect(q2.end).toBe('2026-06-30');
  });
});
