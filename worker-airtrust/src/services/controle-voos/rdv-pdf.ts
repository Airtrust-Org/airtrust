/**
 * Gerador do "Relatório de Voo" (RDV) no layout de referência do contrato
 * Petrobras. Usa o mesmo layout de PDF (pdf-lib, A4) já adotado em
 * `pdf-generator.ts`. Todos os totais recebidos aqui já foram calculados
 * pelo backend — este módulo apenas apresenta os dados, nunca recalcula.
 *
 * Nesta entrega (N1, dados fictícios, sem homologação ANAC), toda saída
 * carrega marca d'água "TESTE — NÃO ENVIAR À PETROBRAS" em todas as
 * páginas. Não há flag para suprimi-la.
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont, degrees } from 'pdf-lib';

export interface RelatorioPetrobrasEtapa {
  numero_etapa: number;
  origem_icao: string | null;
  destino_icao: string | null;
  horario_motor_ligado: string | null;
  horario_decolagem: string | null;
  horario_pouso: string | null;
  horario_motor_desligado: string | null;
  tempo_decolagem_pouso: string | null;
  tempo_total: string | null;
  pousos_diurnos: number | null;
  pousos_noturnos: number | null;
  pax: number | null;
  payload: number | null;
  combustivel_inicio: number | null;
  combustivel_fim: number | null;
}

export interface RelatorioPetrobrasTripulante {
  nome: string;
  codigo_anac: string | null;
  funcao: string;
}

export interface RelatorioPetrobrasAbastecimento {
  fornecedor: string | null;
  localidade: string | null;
  combustivel_abastecido: number | null;
  unidade: string;
  numero_ce: string | null;
  data_hora: string;
}

export interface RelatorioPetrobrasAprovacao {
  tipo_aprovacao: string;
  status: string;
  created_at: string;
}

export interface RelatorioPetrobrasData {
  empresa_nome: string;
  base: string | null;
  contrato: string | null;
  cliente: string | null;
  data_voo: string;
  prefixo: string;
  modelo_aeronave: string | null;
  numero_voo: string | null;
  numero_relatorio: string;
  numero_sap: string | null;
  tripulantes: RelatorioPetrobrasTripulante[];
  etapas: RelatorioPetrobrasEtapa[];
  abastecimentos: RelatorioPetrobrasAbastecimento[];
  totais: {
    horas_voadas: number | null;
    numero_pousos: number | null;
    ciclos: number | null;
    combustivel_decolagem: number | null;
    combustivel_pouso: number | null;
    combustivel_consumo: number | null;
    pob: number | null;
    carga_kg: number | null;
  };
  ocorrencias: string | null;
  divergencias: string | null;
  aprovacoes: RelatorioPetrobrasAprovacao[];
  status_workflow: string;
  versao: number;
  gerado_em: string;
  identificador_interno: string;
  hash_integridade: string;
}

const COLORS = {
  primary: rgb(0, 0.23, 0.44),
  textMain: rgb(0.13, 0.13, 0.13),
  textMuted: rgb(0.4, 0.4, 0.4),
  borderSoft: rgb(0.83, 0.86, 0.9),
  bgSoft: rgb(0.96, 0.97, 0.98),
  watermark: rgb(0.82, 0.15, 0.15),
  white: rgb(1, 1, 1),
};

const PAGE_SIZE: [number, number] = [841.89, 595.28]; // A4 landscape (tabelas largas)
const MARGIN = 32;

function drawWatermark(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  const text = 'TESTE — NÃO ENVIAR À PETROBRAS';
  const fontSize = 28;
  page.drawText(text, {
    x: width / 2 - (font.widthOfTextAtSize(text, fontSize) / 2) * Math.SQRT1_2 - 40,
    y: height / 2,
    size: fontSize,
    font,
    color: COLORS.watermark,
    opacity: 0.28,
    rotate: degrees(30),
  });
}

function drawHeader(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  data: RelatorioPetrobrasData,
  pageNumber: number,
  totalPages: number,
) {
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  page.drawRectangle({
    x: 0,
    y: height - 64,
    width,
    height: 64,
    color: COLORS.primary,
  });
  page.drawText('RELATÓRIO DE VOO (RDV) — REFERÊNCIA CONTRATUAL PETROBRAS', {
    x: MARGIN,
    y: height - 30,
    size: 13,
    font: fontBold,
    color: COLORS.white,
  });
  page.drawText(
    `${data.empresa_nome}  |  Base: ${data.base || '-'}  |  Contrato: ${data.contrato || '-'}  |  Cliente: ${data.cliente || '-'}`,
    { x: MARGIN, y: height - 48, size: 9, font: fontRegular, color: COLORS.white },
  );

  y = height - 84;
  const fields = [
    ['Data do voo', data.data_voo],
    ['Prefixo', data.prefixo],
    ['Modelo', data.modelo_aeronave || '-'],
    ['Nº voo', data.numero_voo || '-'],
    ['Nº relatório', data.numero_relatorio],
    ['Nº SAP', data.numero_sap || '-'],
  ];
  const colWidth = (width - MARGIN * 2) / fields.length;
  fields.forEach(([label, value], index) => {
    const x = MARGIN + index * colWidth;
    page.drawText(String(label), { x, y, size: 8, font: fontRegular, color: COLORS.textMuted });
    page.drawText(String(value), { x, y: y - 13, size: 10, font: fontBold, color: COLORS.textMain });
  });

  page.drawText(`Página ${pageNumber} de ${totalPages}`, {
    x: width - MARGIN - 70,
    y: MARGIN - 8,
    size: 8,
    font: fontRegular,
    color: COLORS.textMuted,
  });
}

function drawFooter(page: PDFPage, fontRegular: PDFFont, data: RelatorioPetrobrasData) {
  const { width } = page.getSize();
  page.drawLine({
    start: { x: MARGIN, y: MARGIN + 18 },
    end: { x: width - MARGIN, y: MARGIN + 18 },
    thickness: 0.5,
    color: COLORS.borderSoft,
  });
  page.drawText(
    `Versão ${data.versao} · Gerado em ${data.gerado_em} · ID interno ${data.identificador_interno} · Integridade ${data.hash_integridade.slice(0, 16)}`,
    { x: MARGIN, y: MARGIN + 4, size: 7, font: fontRegular, color: COLORS.textMuted },
  );
  page.drawText(
    'Documento interno de operação AirTrust. Não constitui assinatura digital, validação ou homologação regulatória.',
    { x: MARGIN, y: MARGIN - 6, size: 6.5, font: fontRegular, color: COLORS.textMuted },
  );
}

function drawTable(
  page: PDFPage,
  fontBold: PDFFont,
  fontRegular: PDFFont,
  startY: number,
  headers: string[],
  rows: string[][],
  colWidths: number[],
): number {
  let y = startY;
  const rowHeight = 16;

  let x = MARGIN;
  headers.forEach((header, i) => {
    page.drawRectangle({ x, y: y - rowHeight, width: colWidths[i], height: rowHeight, color: COLORS.bgSoft });
    page.drawText(header, { x: x + 3, y: y - rowHeight + 5, size: 7.5, font: fontBold, color: COLORS.textMain });
    x += colWidths[i];
  });
  y -= rowHeight;

  for (const row of rows) {
    x = MARGIN;
    row.forEach((cell, i) => {
      page.drawText(cell || '-', { x: x + 3, y: y - rowHeight + 5, size: 7.5, font: fontRegular, color: COLORS.textMain });
      x += colWidths[i];
    });
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight },
      end: { x: MARGIN + colWidths.reduce((a, b) => a + b, 0), y: y - rowHeight },
      thickness: 0.4,
      color: COLORS.borderSoft,
    });
    y -= rowHeight;
  }

  return y;
}

export async function gerarRelatorioPetrobrasPdf(data: RelatorioPetrobrasData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const etapaRowsPerPage = 14;
  const totalEtapaPages = Math.max(1, Math.ceil(data.etapas.length / etapaRowsPerPage));
  const totalPages = totalEtapaPages;

  for (let pageIndex = 0; pageIndex < totalEtapaPages; pageIndex += 1) {
    const page = pdfDoc.addPage(PAGE_SIZE);
    drawHeader(page, fontBold, fontRegular, data, pageIndex + 1, totalPages);
    drawWatermark(page, fontBold);

    let y = page.getSize().height - 150;

    if (pageIndex === 0) {
      page.drawText('TRIPULAÇÃO', { x: MARGIN, y, size: 9, font: fontBold, color: COLORS.primary });
      y -= 14;
      y = drawTable(
        page,
        fontBold,
        fontRegular,
        y,
        ['Nome', 'Código ANAC', 'Função'],
        data.tripulantes.map((t) => [t.nome, t.codigo_anac || '-', t.funcao]),
        [300, 150, 100],
      );
      y -= 20;
    }

    const pageEtapas = data.etapas.slice(
      pageIndex * etapaRowsPerPage,
      pageIndex * etapaRowsPerPage + etapaRowsPerPage,
    );
    page.drawText('TRECHOS', { x: MARGIN, y, size: 9, font: fontBold, color: COLORS.primary });
    y -= 14;
    y = drawTable(
      page,
      fontBold,
      fontRegular,
      y,
      ['#', 'Origem', 'Destino', 'Decolagem', 'Pouso', 'Tempo total', 'Pax', 'Carga', 'Comb. ini', 'Comb. fim'],
      pageEtapas.map((e) => [
        String(e.numero_etapa),
        e.origem_icao || '-',
        e.destino_icao || '-',
        e.horario_decolagem || '-',
        e.horario_pouso || '-',
        e.tempo_total || '-',
        e.pax !== null ? String(e.pax) : '-',
        e.payload !== null ? String(e.payload) : '-',
        e.combustivel_inicio !== null ? String(e.combustivel_inicio) : '-',
        e.combustivel_fim !== null ? String(e.combustivel_fim) : '-',
      ]),
      [30, 70, 70, 70, 70, 80, 40, 60, 70, 70],
    );

    if (pageIndex === totalEtapaPages - 1) {
      y -= 20;
      page.drawText('TOTAIS (calculados pelo backend)', { x: MARGIN, y, size: 9, font: fontBold, color: COLORS.primary });
      y -= 14;
      const totals = data.totais;
      const totalsLine = [
        `Horas voadas: ${totals.horas_voadas ?? '-'}`,
        `Pousos: ${totals.numero_pousos ?? '-'}`,
        `Ciclos: ${totals.ciclos ?? '-'}`,
        `Comb. decolagem: ${totals.combustivel_decolagem ?? '-'}`,
        `Comb. pouso: ${totals.combustivel_pouso ?? '-'}`,
        `Consumo: ${totals.combustivel_consumo ?? '-'}`,
        `POB: ${totals.pob ?? '-'}`,
        `Carga (kg): ${totals.carga_kg ?? '-'}`,
      ].join('   ·   ');
      page.drawText(totalsLine, { x: MARGIN, y, size: 8, font: fontRegular, color: COLORS.textMain });
      y -= 20;

      if (data.abastecimentos.length > 0) {
        page.drawText('ABASTECIMENTOS', { x: MARGIN, y, size: 9, font: fontBold, color: COLORS.primary });
        y -= 14;
        y = drawTable(
          page,
          fontBold,
          fontRegular,
          y,
          ['Data/hora', 'Fornecedor', 'Localidade', 'Qtd', 'Unid.', 'Nº CE'],
          data.abastecimentos.map((a) => [
            a.data_hora,
            a.fornecedor || '-',
            a.localidade || '-',
            a.combustivel_abastecido !== null ? String(a.combustivel_abastecido) : '-',
            a.unidade,
            a.numero_ce || '-',
          ]),
          [110, 150, 150, 60, 50, 80],
        );
        y -= 20;
      }

      if (data.ocorrencias || data.divergencias) {
        page.drawText('OBSERVAÇÕES / OCORRÊNCIAS', { x: MARGIN, y, size: 9, font: fontBold, color: COLORS.primary });
        y -= 14;
        if (data.ocorrencias) {
          page.drawText(`Ocorrências: ${data.ocorrencias}`.slice(0, 180), {
            x: MARGIN,
            y,
            size: 8,
            font: fontRegular,
            color: COLORS.textMain,
          });
          y -= 12;
        }
        if (data.divergencias) {
          page.drawText(`Divergências: ${data.divergencias}`.slice(0, 180), {
            x: MARGIN,
            y,
            size: 8,
            font: fontRegular,
            color: COLORS.textMain,
          });
          y -= 12;
        }
        y -= 8;
      }

      page.drawText('APROVAÇÕES (registro interno, não é assinatura digital)', {
        x: MARGIN,
        y,
        size: 9,
        font: fontBold,
        color: COLORS.primary,
      });
      y -= 14;
      y = drawTable(
        page,
        fontBold,
        fontRegular,
        y,
        ['Tipo', 'Status', 'Data'],
        data.aprovacoes.map((a) => [a.tipo_aprovacao, a.status, a.created_at]),
        [200, 200, 200],
      );
    }

    drawFooter(page, fontRegular, data);
  }

  return pdfDoc.save();
}

export async function computeIntegrityHash(payload: unknown): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
