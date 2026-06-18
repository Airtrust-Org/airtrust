export const FICHA_AVALIACAO_NOTAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface FichaAvaliacaoFaixa {
  rangeLabel: string;
  color: string;
  description: string;
  noteIndexes: number[];
}

export const FICHA_AVALIACAO_FAIXAS: FichaAvaliacaoFaixa[] = [
  {
    rangeLabel: '1-2',
    color: '#c62828',
    description:
      'Padrao Nao Satisfatorio. Ocorreram erros criticos e/ou foram utilizadas tecnicas ou procedimentos incorretos, resultando em desempenho inaceitavel. Voo perigoso.',
    noteIndexes: [0, 1],
  },
  {
    rangeLabel: '3-4',
    color: '#ef6c00',
    description: 'Abaixo da Media. Nao atendeu ao padrao exigido.',
    noteIndexes: [2, 3],
  },
  {
    rangeLabel: '5-7',
    color: '#f4c542',
    description:
      'Padrao de Medio a Bom. Desempenho aceitavel com apenas erros menores e/ou criticos. Sem areas fracas evidentes.',
    noteIndexes: [4, 5, 6],
  },
  {
    rangeLabel: '8-10',
    color: '#2e7d32',
    description:
      'Acima da Media. Exercicios e procedimentos executados com habilidade, utilizando tecnicas corretas. O piloto demonstra proficiencia em todos os aspectos.',
    noteIndexes: [7, 8, 9],
  },
];

export function buildFichaAvaliacaoScaleHtml(): string {
  const cells = FICHA_AVALIACAO_NOTAS.map((nota, index) => {
    const faixa = FICHA_AVALIACAO_FAIXAS.find((candidate) => candidate.noteIndexes.includes(index));
    return `<td style="background:${faixa?.color || '#94a3b8'}">${nota}</td>`;
  }).join('');

  const descriptions = FICHA_AVALIACAO_FAIXAS.map(
    (faixa) => `
      <div class="avaliacao-scale-band">
        <span class="avaliacao-scale-range">${faixa.rangeLabel}</span>
        <span>${faixa.description}</span>
      </div>
    `,
  ).join('');

  return `
    <section class="avaliacao-scale" aria-label="Regua de avaliacao">
      <div class="avaliacao-scale-title">Regua de Avaliacao</div>
      <table class="avaliacao-scale-table" aria-hidden="true">
        <tbody>
          <tr>${cells}</tr>
        </tbody>
      </table>
      <div class="avaliacao-scale-legend">
        ${descriptions}
      </div>
    </section>
  `;
}

export function getFichaAvaliacaoScaleCss(): string {
  return `
    .avaliacao-scale {
      margin: 12px 0 14px;
      page-break-inside: avoid;
    }

    .avaliacao-scale-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
      color: #111827;
    }

    .avaliacao-scale-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      border: 1px solid #111827;
      margin-bottom: 8px;
    }

    .avaliacao-scale-table td {
      border: 1px solid #111827;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      padding: 4px 0;
    }

    .avaliacao-scale-legend {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 10px;
      font-size: 8px;
      line-height: 1.35;
    }

    .avaliacao-scale-band {
      display: flex;
      gap: 6px;
      align-items: flex-start;
      padding: 6px 8px;
      border: 1px solid #d1d5db;
      background: #f8fafc;
    }

    .avaliacao-scale-range {
      min-width: 28px;
      font-weight: 700;
      color: #111827;
    }
  `;
}
