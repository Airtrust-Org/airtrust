// @vitest-environment jsdom

/**
 * Regressão de conteúdo da Ficha Modelo (PDF de impressão de "Fichas Modelo
 * para Impressão", gerado por gerarPDFFichaCliente + buildFichaModeloPdfData).
 *
 * Intercepta jsPDF para capturar todo texto/cor efetivamente desenhado, sem
 * depender de parsing de PDF binário. Cobre a sessão real A139-I-01/12
 * (AW139 Inicial 01/12) citada no incidente de produção.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { capturedTexts, capturedFillColors, capturedTextColors, addPageCalls } = vi.hoisted(() => ({
  capturedTexts: [] as string[],
  capturedFillColors: [] as (string | number)[],
  capturedTextColors: [] as (string | number)[],
  addPageCalls: { count: 0 },
}));

vi.mock('jspdf', () => {
  class FakeJsPDF {
    internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    };
    setFont() {}
    setFontSize() {}
    setLineWidth() {}
    setDrawColor() {}
    setFillColor(color: string | number) {
      capturedFillColors.push(color);
    }
    setTextColor(color: string | number) {
      capturedTextColors.push(color);
    }
    rect() {}
    roundedRect() {}
    line() {}
    addPage() {
      addPageCalls.count += 1;
    }
    addImage() {}
    getImageProperties() {
      return { width: 100, height: 100 };
    }
    getTextWidth(t: string) {
      return String(t).length * 2;
    }
    splitTextToSize(text: string) {
      return [text];
    }
    text(text: string | string[]) {
      const arr = Array.isArray(text) ? text : [text];
      capturedTexts.push(...arr.map(String));
    }
    output(type: string) {
      if (type === 'blob') return new Blob(['fake-pdf'], { type: 'application/pdf' });
      return new ArrayBuffer(0);
    }
  }
  return { jsPDF: FakeJsPDF };
});

vi.mock('@/react-app/utils/pdfPreview', () => ({
  previewPdfBeforeDownload: async () => {},
}));

import { gerarPDFFichaCliente } from '@/react-app/services/pdf-ficha-client';
import {
  buildFichaModeloPdfData,
  type ModeloSessaoManobra,
} from '@/react-app/pages/simuladores/fichas/fichaModeloPdf';
import { NOTECHS_ITENS } from '@/react-app/pages/simuladores/fichas/notechs';

const A139_I_01_12_MANOBRAS: ModeloSessaoManobra[] = [
  {
    ordem: 1,
    manobra_codigo: 'A139-CAB-01',
    manobra_nome: 'Cabine AW139 e power-up',
    tripulante: 'AB',
    observacoes:
      'tipo_item=tecnica; fase_voo=pre_voo_cockpit; carater=treinamento; fap_refs=FAP05.2basico/normais; nota=Familiarizacao antes de qualquer manobra.; matriz_v6_modelo=A139-I-01/12',
  },
  {
    ordem: 2,
    manobra_codigo: 'A139-CKL-01',
    manobra_nome: 'Normal checklist',
    tripulante: 'AB',
    observacoes:
      'tipo_item=tecnica; fase_voo=pre_partida; carater=treinamento; matriz_v6_modelo=A139-I-01/12',
  },
  {
    ordem: 3,
    manobra_codigo: 'A139-CAS-01',
    manobra_nome: 'Leitura e reconhecimento basico de CAS',
    tripulante: 'AB',
  },
  {
    ordem: 4,
    manobra_codigo: 'A139-QRH-01',
    manobra_nome: 'Localizacao guiada de procedimento no QRH',
    tripulante: 'AB',
  },
  {
    ordem: 5,
    manobra_codigo: 'A139-AFC-01',
    manobra_nome: 'Engajamento e desconexao normal do AFCS',
    tripulante: 'AB',
  },
  {
    ordem: 6,
    manobra_codigo: 'A139-TAX-01',
    manobra_nome: 'Taxi e deslocamento em solo e heliponto',
    tripulante: 'AB',
  },
  { ordem: 7, manobra_codigo: 'FLY-BAS-X3', manobra_nome: 'Hover e taxi', tripulante: 'AB' },
  {
    ordem: 8,
    manobra_codigo: 'A139-PWR-01',
    manobra_nome: 'Controle normal de potencia e parametros',
    tripulante: 'AB',
  },
  { ordem: 9, manobra_codigo: 'OPS-NRM-X2', manobra_nome: 'Decolagem normal', tripulante: 'AB' },
  { ordem: 10, manobra_codigo: 'FLY-BAS-X1', manobra_nome: 'Controle geral VFR', tripulante: 'AB' },
  {
    ordem: 11,
    manobra_codigo: 'OPS-NRM-X1',
    manobra_nome: 'Procedimentos normais',
    tripulante: 'AB',
  },
  {
    ordem: 12,
    manobra_codigo: 'A139-FMA-01',
    manobra_nome: 'Monitoramento basico de FMA',
    tripulante: 'AB',
  },
  {
    ordem: 13,
    manobra_codigo: 'OPS-NRM-X3',
    manobra_nome: 'Circuito de trafego',
    tripulante: 'AB',
  },
  {
    ordem: 14,
    manobra_codigo: 'A139-STB-01',
    manobra_nome: 'Aproximacao visual estabilizada',
    tripulante: 'AB',
  },
  { ordem: 15, manobra_codigo: 'A139-ARN-01', manobra_nome: 'Arremetida normal', tripulante: 'AB' },
  { ordem: 16, manobra_codigo: 'A139-PNO-01', manobra_nome: 'Pouso normal', tripulante: 'AB' },
  {
    ordem: 17,
    manobra_codigo: 'A139-EST-01',
    manobra_nome: 'Estacionamento e corte de motores',
    tripulante: 'AB',
  },
  {
    ordem: 18,
    manobra_codigo: 'FLY-BAS-X4',
    manobra_nome: 'Recuperacao de atitudes anormais basica',
    tripulante: 'AB',
  },
];

function buildA139Modelo() {
  return buildFichaModeloPdfData(
    {
      id: 501,
      codigo: 'A139-I-01/12',
      nome: '01/12 - Familiarizacao / Checklist Normal / Voo Normal',
      tipo_sessao_nome: 'INICIAL',
      modelo_aeronave: 'AW139',
    },
    A139_I_01_12_MANOBRAS,
  );
}

describe('ficha modelo pdf — conteudo A139-I-01/12', () => {
  beforeEach(() => {
    capturedTexts.length = 0;
    capturedFillColors.length = 0;
    capturedTextColors.length = 0;
    addPageCalls.count = 0;
  });

  it('nao contem regua de avaliacao, descritores longos ou metadados internos', async () => {
    const dadosPDF = buildA139Modelo();
    await gerarPDFFichaCliente(dadosPDF);

    const allText = capturedTexts.join('\n');

    expect(allText).not.toMatch(/REGUA DE AVALIACAO/i);
    expect(allText).not.toMatch(/R[ée]gua NOTECHS/i);
    expect(allText).not.toMatch(/Descritores Completos/i);
    expect(allText).not.toMatch(/tipo_item\s*[:=]/i);
    expect(allText).not.toMatch(/fase_voo\s*[:=]/i);
    expect(allText).not.toMatch(/carater\s*[:=]/i);
    expect(allText).not.toMatch(/fap_refs\s*[:=]/i);
    expect(allText).not.toMatch(/matriz_v6_modelo\s*[:=]/i);
    expect(allText).not.toMatch(/\(CRM\)/i);
    expect(allText).not.toContain('NOTECHS — Habilidades Nao Tecnicas (CRM)');

    // sem página extra de descritores NOTECHS na ficha modelo
    expect(addPageCalls.count).toBe(0);
  });

  it('contem a sessao A139-I-01/12, itens tecnicos e os 15 NOTECHS um por item com codigos', async () => {
    const dadosPDF = buildA139Modelo();
    await gerarPDFFichaCliente(dadosPDF);

    const allText = capturedTexts.join('\n');

    expect(allText).toContain('A139-I-01/12');
    expect(allText).toMatch(/NOTECHS/);

    // itens tecnicos esperados da sessao real
    expect(allText).toContain('Cabine AW139 e power-up');
    expect(allText).toContain('Normal checklist');
    expect(allText).toContain('Arremetida normal');
    expect(allText).toContain('Pouso normal');

    // 15 titulos NOTECHS, cada um desenhado
    NOTECHS_ITENS.forEach((item) => {
      expect(allText).toContain(item.tituloPt);
    });
    expect(NOTECHS_ITENS).toHaveLength(15);

    // NOTECHS codes visiveis categorizados (COO-01..04, LID-05..08, CSA-09..11, TMD-12..15)
    const expectedCodes = [
      'NOTECHS-COO-01',
      'NOTECHS-COO-02',
      'NOTECHS-COO-03',
      'NOTECHS-COO-04',
      'NOTECHS-LID-05',
      'NOTECHS-LID-06',
      'NOTECHS-LID-07',
      'NOTECHS-LID-08',
      'NOTECHS-CSA-09',
      'NOTECHS-CSA-10',
      'NOTECHS-CSA-11',
      'NOTECHS-TMD-12',
      'NOTECHS-TMD-13',
      'NOTECHS-TMD-14',
      'NOTECHS-TMD-15',
    ];
    for (const code of expectedCodes) {
      expect(allText).toContain(code);
    }
  });

  it('mostra header NOTECHS como banner de secao, sem subtitulos de grupo', async () => {
    const dadosPDF = buildA139Modelo();
    await gerarPDFFichaCliente(dadosPDF);

    const allText = capturedTexts.join('\n');

    // Single-line header presente
    expect(allText).toContain(
      'NOTECHS \u2014 Non-Technical Skills / Habilidades N\u00E3o T\u00E9cnicas e Comportamentais',
    );

    // 15 codigos categorizados presentes
    for (const code of [
      'NOTECHS-COO-01', 'NOTECHS-COO-02', 'NOTECHS-COO-03', 'NOTECHS-COO-04',
      'NOTECHS-LID-05', 'NOTECHS-LID-06', 'NOTECHS-LID-07', 'NOTECHS-LID-08',
      'NOTECHS-CSA-09', 'NOTECHS-CSA-10', 'NOTECHS-CSA-11',
      'NOTECHS-TMD-12', 'NOTECHS-TMD-13', 'NOTECHS-TMD-14', 'NOTECHS-TMD-15',
    ]) {
      expect(allText).toContain(code);
    }

    // Category dividers removidos
    expect(allText).not.toMatch(/COO \u2014 Coopera/);
    expect(allText).not.toMatch(/LID \u2014 Lideran/);
    expect(allText).not.toMatch(/CSA \u2014 Consci/);
    expect(allText).not.toMatch(/TMD \u2014 Tomada/);

    // No CRM, no Notecs
    expect(allText).not.toMatch(/\(CRM\)/i);
    expect(allText).not.toMatch(/\bNotecs\b/);
    expect(addPageCalls.count).toBe(0);
  });

  it('usa cor cinza (nao roxo/rosa) no bloco NOTECHS', async () => {
    const dadosPDF = buildA139Modelo();
    await gerarPDFFichaCliente(dadosPDF);

    expect(capturedFillColors).not.toContain('#7c3aed');
    expect(capturedTextColors).not.toContain('#7c3aed');
  });

  it('mantem regua e pagina de descritores para ficha real (nao-modelo) com NOTECHS', async () => {
    const dadosPDF = buildA139Modelo();
    dadosPDF.modoModelo = false;
    dadosPDF.templateVersion = 'legacy'; // ficha antiga (pre-V6.2) preserva régua
    dadosPDF.manobras = dadosPDF.manobras.map((m) => ({ ...m, resultado: 8 }));

    await gerarPDFFichaCliente(dadosPDF);

    const allText = capturedTexts.join('\n');
    expect(allText).toMatch(/REGUA DE AVALIACAO/i);
    expect(allText).toMatch(/Descritores Completos/i);
    expect(addPageCalls.count).toBeGreaterThan(0);
  });

  it('ficha real nova V6.2 nao mostra regua nem pagina extra de descritores', async () => {
    const dadosPDF = buildA139Modelo();
    dadosPDF.modoModelo = false;
    dadosPDF.templateVersion = 'v6'; // ficha nova V6.2 — sem régua
    dadosPDF.manobras = dadosPDF.manobras.map((m) => ({ ...m, resultado: 8 }));

    await gerarPDFFichaCliente(dadosPDF);

    const allText = capturedTexts.join('\n');
    expect(allText).not.toMatch(/REGUA DE AVALIACAO/i);
    expect(allText).not.toMatch(/Descritores Completos/i);
    expect(addPageCalls.count).toBe(0);
    // NOTECHS ainda aparece integrado na tabela
    expect(allText).toMatch(/NOTECHS/);
    expect(allText).toContain('NOTECHS-COO-01');
    expect(allText).toContain('NOTECHS-TMD-15');
  });
});
