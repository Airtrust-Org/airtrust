import { describe, expect, it } from 'vitest';
import {
  CSV_DATA,
  parseCSV,
  normalizeDate,
  normalizeCursoName,
  compareQualificacoes,
} from '../../../../scripts/compare-qualificacoes-csv';
import * as operationalCsv from '../../../../scripts/operacionais/compare-qualificacoes-csv';
import { FULL_CSV_DATA } from '../../../../scripts/csv-data-full';
import { FULL_CSV_DATA as operationalFullCsv } from '../../../../scripts/operacionais/csv-data-full';

describe('operational CSV compatibility paths', () => {
  it('exposes the same canonical data without keeping a second tracked fixture', () => {
    expect(operationalFullCsv).toBe(FULL_CSV_DATA);
    expect(operationalCsv.CSV_DATA).toBe(CSV_DATA);
  });

  it('preserves helper identity and CSV comparison exports', () => {
    expect(operationalCsv.parseCSV).toBe(parseCSV);
    expect(operationalCsv.normalizeDate).toBe(normalizeDate);
    expect(operationalCsv.normalizeCursoName).toBe(normalizeCursoName);
    expect(operationalCsv.compareQualificacoes).toBe(compareQualificacoes);
    expect(operationalCsv.normalizeDate('1/31/2026')).toBe('2026-01-31');
  });
});
