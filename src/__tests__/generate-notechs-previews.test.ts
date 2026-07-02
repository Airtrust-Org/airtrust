// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import { FICHA_PDF_STYLES } from '@/react-app/services/pdf-ficha-client';

// Re-import only what we need — bypass the browser download path
import {
  NOTECHS_ITENS,
  NOTECHS_GRUPOS,
  NOTECHS_DESCRITORES_POR_FAIXA,
} from '@/react-app/pages/simuladores/fichas/notechs';

const OUTPUT_DIR = path.resolve(process.cwd(), 'docs/analysis/notechs-previews-20260702');

type ManobraPreview = {
  ordem: number;
  codigo: string;
  nome: string;
  descricao: string;
  resultado: number;
  observacoes: string;
  tripulante: string;
};

function buildTecnicas(prefix: string): ManobraPreview[] {
  return Array.from({ length: 18 }, (_, index) => ({
    ordem: index + 1,
    codigo: `${prefix}-${String(index + 1).padStart(2, '0')}`,
    nome: `Manobra ${index + 1} ${prefix}`,
    descricao: `Execucao operacional ${index + 1} para ${prefix}`,
    resultado: ((index % 6) + 5),
    observacoes: index % 5 === 0 ? `Observacao controlada ${index + 1}` : '',
    tripulante: index % 3 === 0 ? 'A' : index % 3 === 1 ? 'B' : 'AB',
  }));
}

function buildNotechs(): ManobraPreview[] {
  return NOTECHS_ITENS.map((item, index) => ({
    ordem: item.ordem,
    codigo: item.codigo,
    nome: item.tituloPt,
    descricao: item.tituloEn,
    resultado: [6, 7, 8, 9, 5][index % 5],
    observacoes: index % 4 === 0 ? 'Feedback CRM' : '',
    tripulante: 'AB',
  }));
}

async function gerarPDFPreview(
  fileName: string,
  sessaoTitulo: string,
  simulador: string,
  tripulanteNome: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - 2 * margin;
  let y = margin;
  const fontSize = 7;
  const lineH = 4.5;

  // Header
  doc.setFontSize(12);
  doc.text(sessaoTitulo, pageW / 2, y, { align: 'center' });
  y += 8;

  // Tripulante / Instrutor / Simulador
  doc.setFontSize(fontSize);
  doc.text(`Tripulante: ${tripulanteNome} (PF)`, margin, y);
  doc.text(`Instrutor: Instrutor Referencia`, margin + 80, y);
  y += lineH;
  doc.text(`Simulador: ${simulador}`, margin, y);
  doc.text(`Data: 2026-07-02  08:00-10:00  2.0h`, margin + 80, y);
  y += lineH + 2;

  // Divider
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  // Técnicas
  doc.setFontSize(8);
  doc.text('MANOBRAS TECNICAS (18)', margin, y);
  y += lineH;

  const tecnicas = buildTecnicas(fileName.replace('.pdf', ''));
  doc.setFontSize(fontSize);
  for (const t of tecnicas) {
    if (y > 260) { doc.addPage(); y = margin; }

    const nota = String(t.resultado || '');
    const linha = `${t.ordem}. ${t.nome}`;
    doc.text(linha, margin, y);
    doc.text(nota, pageW - margin, y, { align: 'right' });

    if (t.observacoes) {
      y += lineH - 1;
      doc.setTextColor(100);
      doc.text(`   ${t.observacoes}`, margin, y, { maxWidth: contentW - 5 });
      doc.setTextColor(0);
    }
    y += lineH;
  }

  // Divider
  y += 2;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 4;

  // NOTECHS
  doc.setFontSize(8);
  doc.text(`NOTECHS — 15 itens fixos`, margin, y);
  y += lineH;

  const notechs = buildNotechs();
  doc.setFontSize(fontSize);
  for (const n of notechs) {
    if (y > 260) { doc.addPage(); y = margin; }

    const nota = String(n.resultado || '');
    const linha = `${n.ordem.toString().slice(-2)}. ${n.nome}`;
    doc.text(linha, margin, y);
    doc.text(nota, pageW - margin, y, { align: 'right' });

    if (n.observacoes) {
      y += lineH - 1;
      doc.setTextColor(100);
      doc.text(`   ${n.observacoes}`, margin, y, { maxWidth: contentW - 5 });
      doc.setTextColor(0);
    }
    y += lineH;
  }

  // Divider
  y += 4;
  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  // Régua
  doc.setFontSize(8);
  doc.text('REGUA DE AVALIACAO (1-2 Insatisfatorio / 3-4 Abaixo / 5-7 Padrao / 8-10 Acima)', margin, y);
  y += lineH + 4;

  // Observações + Assinaturas
  doc.setFontSize(8);
  doc.text('OBSERVACOES GERAIS:', margin, y);
  y += lineH;
  doc.setFontSize(fontSize);
  doc.text('Preview A4 controlado para validacao de layout NOTECHS.', margin, y);
  y += lineH + 6;

  doc.setFontSize(8);
  doc.text('Assinatura Aluno: _________________________  Data: 02/07/2026', margin, y);
  y += lineH + 2;
  doc.text('Assinatura Instrutor: _____________________  Data: 02/07/2026', margin, y);

  const arrayBuffer = doc.output('arraybuffer');
  await writeFile(path.join(OUTPUT_DIR, fileName), Buffer.from(arrayBuffer));
}

describe('generate NOTECHS previews', () => {
  it('generates SK76 INICIAL PDF', async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await gerarPDFPreview(
      'SK76_INICIAL_20260702.pdf',
      'SK76 Inicial',
      'SK76 FTD',
      'Aluno SK76',
    );
  });

  it('generates A139 PERIODICO PDF', async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await gerarPDFPreview(
      'A139_PERIODICO_20260702.pdf',
      'A139 Periodico',
      'AW139 FFS',
      'Aluno AW139',
    );
  });

  it('generates LOFT CHECK PDF', async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    await gerarPDFPreview(
      'LOFT_CHECK_20260702.pdf',
      'LOFT / Check',
      'SK76 FTD',
      'Aluno LOFT',
    );
  });
});
