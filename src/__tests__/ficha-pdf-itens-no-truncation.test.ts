// @vitest-environment jsdom

/**
 * Regressão: a coluna ITENS da ficha (técnicas + NOTECHS) nunca deve truncar
 * nomes com "...". Nomes longos devem quebrar em até 2 linhas (na largura/fonte
 * atuais da tabela) sem cortar texto. Usa o jsPDF real (não mockado) para que
 * a quebra de linha seja calculada de verdade, ao invés de um fake que sempre
 * devolve o texto como uma única linha.
 */
import { describe, expect, it, vi } from 'vitest';

const { capturedTextsHolder } = vi.hoisted(() => ({
  capturedTextsHolder: { texts: [] as string[] },
}));

vi.mock('jspdf', async () => {
  const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
  class PatchedJsPDF extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args);
      const originalText = this.text.bind(this);
      // @ts-expect-error overriding instance method for test capture
      this.text = (text: string | string[], ...rest: unknown[]) => {
        const arr = Array.isArray(text) ? text : [text];
        capturedTextsHolder.texts.push(...arr.map(String));
        // @ts-expect-error passthrough
        return originalText(text, ...rest);
      };
    }
  }
  return { ...actual, jsPDF: PatchedJsPDF };
});

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: async (opts: { fetcher: () => Promise<Response> }) => {
    await opts.fetcher();
  },
}));

import { gerarPDFFichaCliente, getFichaPdfTableLayout } from '@/react-app/services/pdf-ficha-client';
import { NOTECHS_ITENS } from '@/react-app/pages/simuladores/fichas/notechs';

// Nome real e conhecido (CRED-EXA / EXA-PAD-01) longo o bastante para exigir
// quebra de linha na coluna ITENS — referência do incidente original de corte.
const LONG_ITEM_NAME =
  'Padronização operacional e representatividade da autoridade (rubricas separadas)';

function buildDados(nomes: string[]) {
  return {
    fichaId: 1,
    sessao_titulo: 'Sessão de teste',
    tripulante_nome: 'Fulano',
    tripulante_funcao: 'PILOTO',
    instrutor_nome: 'Instrutor',
    data: '2026-07-05',
    horario_inicio: '08:00',
    horario_fim: '09:00',
    simulador: 'AW139',
    status: 'PENDENTE',
    modoModelo: true,
    manobras: nomes.map((nome, i) => ({
      ordem: i + 1,
      nome,
      descricao: nome,
      codigo: `TEST-${String(i + 1).padStart(2, '0')}`,
      resultado: null,
      tripulante: 'AB' as const,
    })),
  };
}

describe('ficha pdf — ITENS nunca trunca, quebra em ate 2 linhas', () => {
  it('nome longo conhecido (CRED-EXA/EXA-PAD-01) aparece por inteiro, sem "...", em ate 2 linhas', async () => {
    capturedTextsHolder.texts = [];
    await gerarPDFFichaCliente(buildDados([LONG_ITEM_NAME]));

    const texts = capturedTextsHolder.texts;
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
    const itemRelatedTexts = texts.filter((text) =>
      ['Padronização', 'representatividade', 'autoridade', 'rubricas'].some((fragment) =>
        text.includes(fragment),
      ),
    );

    expect(itemRelatedTexts.length).toBeGreaterThan(0);
    expect(itemRelatedTexts.some((t) => t.includes('...'))).toBe(false);
    expect(normalize(texts.join(' '))).toContain(normalize(LONG_ITEM_NAME));

    // A largura real da coluna ITENS deve quebrar esse nome em no maximo 2 linhas.
    const layout = getFichaPdfTableLayout(15);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(LONG_ITEM_NAME, layout.itensWidth);
    expect(lines.length).toBeLessThanOrEqual(2);
  });

  it('todos os 15 titulos NOTECHS quebram em no maximo 2 linhas na largura real da coluna ITENS', async () => {
    const layout = getFichaPdfTableLayout(15);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    NOTECHS_ITENS.forEach((item) => {
      const lines = doc.splitTextToSize(item.tituloPt, layout.itensWidth);
      expect(lines.length).toBeLessThanOrEqual(2);
    });
  });

  it('nome curto continua em 1 linha (nao forca quebra desnecessaria)', async () => {
    capturedTextsHolder.texts = [];
    await gerarPDFFichaCliente(buildDados(['Pouso normal']));

    const layout = getFichaPdfTableLayout(15);
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const lines = doc.splitTextToSize('Pouso normal', layout.itensWidth);
    expect(lines.length).toBe(1);
  });
});
