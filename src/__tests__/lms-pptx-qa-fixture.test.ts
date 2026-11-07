import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';

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
