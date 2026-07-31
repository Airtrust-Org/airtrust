import { describe, expect, it } from 'vitest';

import { selectSupersededPtoRev10Models } from '../../../scripts/prepare-simuladores-pto-rev10-import.mjs';

describe('PTO Rev10 superseded-model scope', () => {
  it('inactivates only legacy codes explicitly named by the canonical packages', () => {
    const active = [
      {
        id: 10,
        codigo: 'A139-P-LOFT/OFFSHORE',
        codigo_canonico: 'A139-P-LOFT/OFFSHORE',
      },
      {
        id: 11,
        codigo: 'CUSTOM-AW139-CHECK',
        codigo_canonico: 'CUSTOM-AW139-CHECK',
      },
      {
        id: 12,
        codigo: 'A139-I-01/12',
        codigo_canonico: 'A139-I-01/12',
      },
    ];
    const projection = {
      aeronaves: {
        AW139: {
          sessoes: [
            {
              codigo: 'A139-P-03/04-C1',
              legacy_source_codes: ['A139-P-LOFT/OFFSHORE'],
            },
            { codigo: 'A139-I-01/12', legacy_source_codes: [] },
          ],
        },
      },
    };

    expect(selectSupersededPtoRev10Models(active, projection)).toEqual([
      {
        id: 10,
        codigo: 'A139-P-LOFT/OFFSHORE',
        codigo_canonico: 'A139-P-LOFT/OFFSHORE',
      },
    ]);
  });

  it('matches an explicit legacy identity through codigo_canonico but preserves unrelated models', () => {
    const result = selectSupersededPtoRev10Models(
      [
        { id: 20, codigo: 'PHYSICAL@V2', codigo_canonico: 'S76-P-CHECK' },
        { id: 21, codigo: 'TRE-INST', codigo_canonico: 'TRE-INST' },
      ],
      {
        aeronaves: {
          S76: {
            sessoes: [
              { codigo: 'S76-P-03/03', legacy_source_codes: ['S76-P-CHECK'] },
            ],
          },
        },
      },
    );

    expect(result.map((row) => row.id)).toEqual([20]);
  });
});
