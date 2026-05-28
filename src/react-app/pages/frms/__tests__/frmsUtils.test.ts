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
import {
  getComplianceColor,
  getComplianceHex,
  getComplianceLabel,
  getEffectivenessColor,
  getEffectivenessHex,
  getEffectivenessLabel,
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
  it('≥ 90% → Desempenho Pleno', () => {
    expect(getEffectivenessLabel(90, cfg)).toBe('Desempenho Pleno');
    expect(getEffectivenessLabel(100, cfg)).toBe('Desempenho Pleno');
  });

  it('89% → Atenção', () => {
    expect(getEffectivenessLabel(89, cfg)).toBe('Atenção');
  });

  it('77% → Início de Degradação (boundary)', () => {
    expect(getEffectivenessLabel(77, cfg)).toBe('Início de Degradação');
  });

  it('65% → Efetividade severamente degradada (boundary)', () => {
    expect(getEffectivenessLabel(65, cfg)).toBe('Efetividade severamente degradada');
  });

  it('0% → Efetividade severamente degradada', () => {
    expect(getEffectivenessLabel(0, cfg)).toBe('Efetividade severamente degradada');
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

  it('getEffectivenessLabel: 60% → Efetividade severamente degradada com VERMELHO=60 (boundary)', () => {
    expect(getEffectivenessLabel(60, custom)).toBe('Efetividade severamente degradada');
  });

  it('getEffectivenessLabel: 61% → Início de Degradação com VERMELHO=60', () => {
    expect(getEffectivenessLabel(61, custom)).toBe('Início de Degradação');
  });
});
