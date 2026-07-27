import { describe, expect, it } from 'vitest';
import { isQualificationCheck } from '../isQualificationCheck';
import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
  isCheckCompatibleWithAircraft,
} from '../checkCompatibility';

// ---------------------------------------------------------------------------
// Helper: isQualificationCheck
// ---------------------------------------------------------------------------
describe('isQualificationCheck', () => {
  // --- is_check flag ---
  it('(1) is_check=1 → check', () => {
    expect(isQualificationCheck({ is_check: 1 })).toBe(true);
  });

  it('(2) is_check=true → check', () => {
    expect(isQualificationCheck({ is_check: true })).toBe(true);
  });

  it('(3) is_check="1" → check (legacy payload)', () => {
    expect(isQualificationCheck({ is_check: '1' })).toBe(true);
  });

  it('(4) is_check=0 → not check', () => {
    expect(isQualificationCheck({ is_check: 0 })).toBe(false);
  });

  it('(5) is_check=false → not check', () => {
    expect(isQualificationCheck({ is_check: false })).toBe(false);
  });

  it('(6) is_check=null → not check (unless categoria=CHECK)', () => {
    expect(isQualificationCheck({ is_check: null })).toBe(false);
  });

  it('(7) is_check=undefined → not check (unless categoria=CHECK)', () => {
    expect(isQualificationCheck({})).toBe(false);
  });

  // --- categoria normalization ---
  it('(8) categoria="CHECK" → check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'CHECK' })).toBe(true);
  });

  it('(9) categoria="check" → check (case-insensitive)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'check' })).toBe(true);
  });

  it('(10) categoria="Check" → check (mixed case)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'Check' })).toBe(true);
  });

  it('(11) categoria=" CHECK " → check (trims whitespace)', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: ' CHECK ' })).toBe(true);
  });

  it('(12) categoria="PILOTO" → not check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: 'PILOTO' })).toBe(false);
  });

  it('(13) categoria=null, is_check=0 → not check', () => {
    expect(isQualificationCheck({ is_check: 0, categoria: null })).toBe(false);
  });

  // --- check must NOT appear as Qualificação Principal ---
  it('(14) check not in principal list when is_check=1', () => {
    const all = [
      { id: 1, codigo: 'OPC', is_check: 1, categoria: 'CHECK' },
      { id: 2, codigo: 'ATPL', is_check: 0, categoria: 'PILOTO' },
    ];
    const checks = all.filter(isQualificationCheck);
    const principais = all.filter((q) => !isQualificationCheck(q));
    expect(checks.map((q) => q.id)).toEqual([1]);
    expect(principais.map((q) => q.id)).toEqual([2]);
  });

  it('(15) same item does not appear in both lists', () => {
    const all = [
      { id: 1, codigo: 'OPC', is_check: true, categoria: 'CHECK' },
      { id: 2, codigo: 'FAP6-139', is_check: 1, categoria: null },
    ];
    const checks = all.filter(isQualificationCheck);
    const principais = all.filter((q) => !isQualificationCheck(q));
    const intersection = checks.filter((c) => principais.some((p) => p.id === c.id));
    expect(intersection).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Aircraft compatibility — extended fixture
// ---------------------------------------------------------------------------
describe('checkCompatibility — aircraft isolation', () => {
  it('(16) OPC genérico aparece para AW139', () => {
    expect(isCheckCompatibleWithAircraft('OPC', 'AW139')).toBe(true);
  });

  it('(17) OPC genérico aparece para SK76', () => {
    expect(isCheckCompatibleWithAircraft('OPC', 'SK76')).toBe(true);
  });

  it('(18) IFR-139 aparece somente para AW139', () => {
    expect(isCheckCompatibleWithAircraft('IFR-139', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('IFR-139', 'SK76')).toBe(false);
  });

  it('(19) IFR-SK76 aparece somente para SK76', () => {
    expect(isCheckCompatibleWithAircraft('IFR-SK76', 'SK76')).toBe(true);
    expect(isCheckCompatibleWithAircraft('IFR-SK76', 'AW139')).toBe(false);
  });

  it('(20) FAP6-139 aparece somente para AW139', () => {
    expect(isCheckCompatibleWithAircraft('FAP6-139', 'AW139')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP6-139', 'SK76')).toBe(false);
  });

  it('(21) FAP06-76 aparece somente para SK76', () => {
    expect(isCheckCompatibleWithAircraft('FAP06-76', 'SK76')).toBe(true);
    expect(isCheckCompatibleWithAircraft('FAP06-76', 'AW139')).toBe(false);
  });

  // --- Large fixture: nenhum item truncado ---
  const bigFixture = [
    { id: 1, codigo: 'OPC', is_check: 1 },
    { id: 2, codigo: 'IFR', is_check: true },
    { id: 3, codigo: 'FAP6-139', is_check: 1 },
    { id: 4, codigo: 'IFR-139', is_check: 1 },
    { id: 5, codigo: 'FAP06-76', is_check: 1 },
    { id: 6, codigo: 'IFR-SK76', is_check: 1 },
    { id: 7, codigo: 'CHECK-ROTA', is_check: true },
    { id: 8, codigo: 'CHECK-NOITE', is_check: 1 },
    { id: 9, codigo: 'CHECK-INST', is_check: 1 },
    { id: 10, codigo: 'CHECK-OPS', is_check: 1 },
    { id: 11, codigo: 'CHECK-SIM', is_check: 1 },
    { id: 12, codigo: 'CHECK-CORP', is_check: 1 },
    // non-checks
    { id: 13, codigo: 'ATPL', is_check: 0 },
    { id: 14, codigo: 'PILOTO', is_check: false },
  ] as const;

  it('(22) lista com mais de 10 checks exibe todos os esperados para AW139', () => {
    const allChecks = bigFixture.filter(isQualificationCheck);
    const compativel = filterCompatibleChecks(allChecks, 'AW139');
    const ids = compativel.map((c) => c.id);
    // Genéricos esperados
    expect(ids).toContain(1); // OPC
    expect(ids).toContain(2); // IFR
    expect(ids).toContain(7); // CHECK-ROTA
    expect(ids).toContain(8); // CHECK-NOITE
    // AW139-específico esperado
    expect(ids).toContain(3); // FAP6-139
    expect(ids).toContain(4); // IFR-139
    // SK76-específico NÃO esperado
    expect(ids).not.toContain(5); // FAP06-76
    expect(ids).not.toContain(6); // IFR-SK76
    // non-checks NÃO esperados
    expect(ids).not.toContain(13);
    expect(ids).not.toContain(14);
    // Total mínimo de 10 checks (8 genéricos + 2 AW139)
    expect(compativel.length).toBeGreaterThanOrEqual(10);
  });

  it('(22b) lista com mais de 10 checks exibe todos os esperados para SK76', () => {
    const allChecks = bigFixture.filter(isQualificationCheck);
    const compativel = filterCompatibleChecks(allChecks, 'SK76');
    const ids = compativel.map((c) => c.id);
    expect(ids).toContain(1); // OPC genérico
    expect(ids).toContain(2); // IFR genérico
    expect(ids).toContain(5); // FAP06-76
    expect(ids).toContain(6); // IFR-SK76
    expect(ids).not.toContain(3); // FAP6-139 AW139-specific
    expect(ids).not.toContain(4); // IFR-139 AW139-specific
  });

  it('filterCompatibleCheckIds preserva IDs selecionados compatíveis', () => {
    const allChecks = bigFixture.filter(isQualificationCheck);
    // IDs selecionados que incluem OPC (1) e FAP6-139 (3)
    const selected = [1, 3, 5];
    const result = filterCompatibleCheckIds(selected, allChecks, 'AW139');
    expect(result).toContain(1); // OPC — compatível
    expect(result).toContain(3); // FAP6-139 — compatível AW139
    expect(result).not.toContain(5); // FAP06-76 — incompatível com AW139
  });
});
