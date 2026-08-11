import { describe, expect, it } from 'vitest';
import { resolveGuiaLinks } from '../../../scripts/lib/matriz-guia-resolution.mjs';

describe('S-76 guide resolution after /03 nomenclature correction', () => {
  it('canonicalizes a raw /04 session before resolving an already-corrected /03 guide', () => {
    const result = resolveGuiaLinks({
      sessions: [
        {
          codigo_canonico: 'S76-P-01/04-C2',
          aeronave: 'SK76',
          programa: 'Periódico',
          tipo_qualificacao_estruturado: 'PERIODICO',
          ciclo: null,
          html_relpath: 'SK76/html/Guia_Instrutor_Simulador_S76_S76-P-01-04-C2.html',
        },
      ],
      guias: [
        {
          id: 88,
          codigo: 'S76-P-01/03-C2',
          aeronave: 'SK76',
          programa: 'PERIODICO',
          ciclo: null,
        },
      ],
    });

    expect(result).toEqual([
      {
        codigo_canonico: 'S76-P-01/03-C2',
        guia_id: 88,
        match_type: 'EXACT_CODE',
      },
    ]);
  });
});
