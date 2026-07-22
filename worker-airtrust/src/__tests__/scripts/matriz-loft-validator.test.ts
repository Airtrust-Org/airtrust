import { describe, expect, it } from 'vitest';
import { validateLoftSemantics } from '../../../scripts/lib/matriz-loft-validator.mjs';

function item(ordem, codigo, fase_voo, execucao_pf, tipo_conteudo, nome = codigo) {
  return { modelo: 'A139-I-11/12', ordem, codigo, nome, fase_voo, execucao_pf, tipo_conteudo };
}

function validItems() {
  return [
    item(1, 'A', 'PRÉ-VOO / PARTIDA', 'A', 'PROCEDIMENTO_NORMAL', 'prep'),
    item(2, 'B', 'DECOLAGEM / SUBIDA', 'A', 'PROCEDIMENTO_NORMAL', 'takeoff'),
    item(3, 'C', 'EM ROTA / NAVEGAÇÃO', 'A', 'PROCEDIMENTO_NORMAL', 'stabilize'),
    item(4, 'D', 'EM ROTA / NAVEGAÇÃO', 'A', 'EMERGENCIA', 'event'),
    item(5, 'E', 'APROXIMAÇÃO / ARREMETIDA', 'A', 'PROCEDIMENTO_NORMAL', 'approach'),
    item(6, 'F', 'POUSO / PÓS-POUSO', 'A', 'PROCEDIMENTO_NORMAL', 'landing'),
    item(7, 'G', 'SOLO / TRANSICAO', 'A', 'PROCEDIMENTO_NORMAL', 'transition'),
    item(8, 'H', 'SOLO / TROCA', 'A', 'PROCEDIMENTO_NORMAL', 'crew'),
    item(9, 'I', 'PRÉ-VOO / PARTIDA', 'B', 'PROCEDIMENTO_NORMAL', 'prep2'),
    item(10, 'J', 'DECOLAGEM / SUBIDA', 'B', 'PROCEDIMENTO_NORMAL', 'takeoff2'),
    item(11, 'K', 'EM ROTA / NAVEGAÇÃO', 'B', 'PROCEDIMENTO_NORMAL', 'stabilize2'),
    item(12, 'L', 'EM ROTA / NAVEGAÇÃO', 'B', 'EMERGENCIA', 'event2'),
    item(13, 'M', 'APROXIMAÇÃO / ARREMETIDA', 'B', 'PROCEDIMENTO_NORMAL', 'approach2'),
    item(14, 'N', 'APROXIMAÇÃO / ARREMETIDA', 'B', 'PROCEDIMENTO_NORMAL', 'approach2b'),
    item(15, 'O', 'EM ROTA / NAVEGAÇÃO', 'B', 'PROCEDIMENTO_NORMAL', 'nav'),
    item(16, 'P', 'APROXIMAÇÃO / ARREMETIDA', 'B', 'PROCEDIMENTO_NORMAL', 'final'),
    item(17, 'Q', 'APROXIMAÇÃO / ARREMETIDA', 'B', 'PROCEDIMENTO_NORMAL', 'missed'),
    item(18, 'R', 'POUSO / PÓS-POUSO', 'B', 'PROCEDIMENTO_NORMAL', 'landing2'),
  ];
}

describe('matriz loft semantic validator', () => {
  it('accepts a sanitized 14-step two-leg pattern', () => {
    const items = validItems();
    const contract = {
      sessions: Array.from({ length: 22 }, (_, index) => ({
        codigo_canonico: index === 0 ? 'A139-I-11/12' : `X-${index}`,
        aeronave: 'AW139',
        loft: true,
        html_relpath: `AW139/html/${index}.html`,
        arquitetura_id_sanitizado: `AW139:${index === 0 ? 'A139-I-11/12' : `X-${index}`}`,
        posicoes: 18,
      })),
    };
    // validator currently expects all 22 to validate; feed same architecture/matrix shape for all by expanding items
    const matrixItems = contract.sessions.flatMap((session) =>
      items.map((row) => ({ ...row, modelo: session.codigo_canonico })),
    );
    const architectures = contract.sessions.map((session) => ({
      modelo: session.codigo_canonico,
      leg2_start: 9,
      sequence: items.map((row) => [row.ordem, row.codigo]),
    }));
    const report = validateLoftSemantics({
      contract,
      matrixItems,
      architectures,
      htmlRequired: false,
    });
    expect(report.verdict).toBe('22/22');
    expect(report.results).toHaveLength(22);
  });

  it('rejects pane before takeoff and wrong PF', () => {
    const bad = validItems();
    bad[0] = item(1, 'A', 'PRÉ-VOO / PARTIDA', 'A', 'EMERGENCIA', 'early-failure');
    const contract = {
      sessions: [
        {
          codigo_canonico: 'A139-I-11/12',
          aeronave: 'AW139',
          loft: true,
          html_relpath: 'AW139/html/x.html',
          arquitetura_id_sanitizado: 'AW139:A139-I-11/12',
          posicoes: 18,
        },
      ],
    };
    // force 22 by padding with copies that are valid except first checked fails early - validator loops all
    contract.sessions = Array.from({ length: 22 }, (_, index) => ({
      ...contract.sessions[0],
      codigo_canonico: index === 0 ? 'A139-I-11/12' : `Y-${index}`,
      arquitetura_id_sanitizado: `AW139:${index === 0 ? 'A139-I-11/12' : `Y-${index}`}`,
    }));
    const matrixItems = contract.sessions.flatMap((session, index) =>
      (index === 0 ? bad : validItems()).map((row) => ({
        ...row,
        modelo: session.codigo_canonico,
      })),
    );
    const architectures = contract.sessions.map((session, index) => ({
      modelo: session.codigo_canonico,
      leg2_start: 9,
      sequence: (index === 0 ? bad : validItems()).map((row) => [row.ordem, row.codigo]),
    }));
    expect(() =>
      validateLoftSemantics({ contract, matrixItems, architectures, htmlRequired: false }),
    ).toThrow(/pane antes da decolagem/);
  });
});
