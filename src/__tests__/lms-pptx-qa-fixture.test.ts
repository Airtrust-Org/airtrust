import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { resolvePptxQaLmsCategoryId } from '../../scripts/staging/resolve-pptx-qa-category.mjs';

describe('versioned staging PPTX QA fixtures', () => {
  it.each(['a', 'b'])('contains three distinct PresentationML slides in edition %s', (edition) => {
    const content = readFileSync(`scripts/staging/fixtures/qa-pptx-3-slides-${edition}.pptx`);
    const zip = unzipSync(new Uint8Array(content));
    const slides = Object.keys(zip).filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key));
    expect(slides).toHaveLength(3);
    for (const index of [1, 2, 3]) {
      const xml = strFromU8(zip[`ppt/slides/slide${index}.xml`]);
      expect(xml).toContain(`AirTrust QA PPTX ${edition.toUpperCase()}`);
      expect(xml).toContain(`slide ${index} de 3`);
    }
    expect(zip['ppt/presentation.xml']).toBeDefined();
    expect(zip['[Content_Types].xml']).toBeDefined();
  });
});

describe('staging PPTX qualifying category contract', () => {
  it('uses the only active LMS-integrated tenant category, not one merely called EAD', () => {
    expect(resolvePptxQaLmsCategoryId([
      { id: 12, nome: 'EAD', ativo: true, lms_integrada: false },
      { id: 41, nome: 'Treinamento', ativo: true, lms_integrada: true },
      { id: 42, nome: 'Arquivo', ativo: false, lms_integrada: true },
    ])).toBe(41);
  });
  it('refuses missing/ambiguous integration instead of creating another category', () => {
    expect(() => resolvePptxQaLmsCategoryId([
      { id: 12, nome: 'EAD', ativo: true, lms_integrada: false },
    ])).toThrow('PPTX_QA_CANONICAL_LMS_CATEGORY_NOT_UNIQUE');
    expect(() => resolvePptxQaLmsCategoryId([
      { id: 12, ativo: true, lms_integrada: true },
      { id: 41, ativo: true, lms_integrada: true },
    ])).toThrow('PPTX_QA_CANONICAL_LMS_CATEGORY_NOT_UNIQUE');
    expect(() => resolvePptxQaLmsCategoryId([
      { id: 0, ativo: true, lms_integrada: true },
    ])).toThrow('PPTX_QA_CANONICAL_LMS_CATEGORY_INVALID_ID');
  });
});
