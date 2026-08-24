/**
 * Gerador de PDF da proposta CAE Planning V3.
 *
 * Usa pdf-lib (já dependência do projeto, mesma stack de pdf-ficha.service.ts
 * e controle-voos/rdv-pdf.ts) — nenhuma engine de PDF nova.
 *
 * Representa exatamente o SNAPSHOT aprovado/vigente da proposta. Nunca
 * recalcula dados — os valores já vêm prontos do chamador (a rota lê o
 * snapshot e as colunas de aprovação de treinamentos_planejados e monta
 * este objeto tipado).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { wrapText } from './controle-voos/rdv-pdf';

export interface CaeProposalPdfParticipant {
  funcionario_id: number;
  funcionario_nome: string;
  qualificacao_nome: string | null;
  qualificacao_vencimento: string | null;
  modelo_codigo: string | null;
  modelo_nome: string | null;
}

export interface CaeProposalPdfData {
  proposal_id: number;
  empresa_nome: string;
  status: string;
  approval_status: string;
  mode: 'NORMAL' | 'COMPARTILHADA';
  generated_at: string;
  cae_slot: {
    equipment: string;
    date: string;
    start_time: string;
    end_time: string;
  } | null;
  simulator_id: number | null;
  instructor_id: number | null;
  escala_considerada: string | null;
  participants: CaeProposalPdfParticipant[];
  warnings: string[];
  aprovador_nome: string | null;
  aprovado_em: string | null;
  observacoes: string | null;
}

const PAGE_W = 595.28; // A4 portrait, pt
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export async function gerarCaePlanningPropostaPdf(data: CaeProposalPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawText = (text: string, size: number, useFont: PDFFont, color = rgb(0, 0, 0)) => {
    const lines = wrapText(text, useFont, size, CONTENT_W);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, { x: MARGIN, y, size, font: useFont, color });
      y -= size + 4;
    }
  };

  const drawSectionTitle = (title: string) => {
    ensureSpace(28);
    y -= 6;
    page.drawText(title, { x: MARGIN, y, size: 12, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 14;
  };

  const drawField = (label: string, value: string) => {
    drawText(`${label}: ${value || '—'}`, 10, font);
  };

  // Cabeçalho
  page.drawText('Proposta de Planejamento CAE', { x: MARGIN, y, size: 16, font: bold });
  y -= 22;
  drawField('Empresa', data.empresa_nome);
  drawField('Proposta', `#${data.proposal_id}`);
  drawField('Modo', data.mode === 'COMPARTILHADA' ? 'COMPARTILHADA' : 'NORMAL');
  drawField('Status do planejamento', data.status);
  drawField('Status de aprovação', data.approval_status);
  drawField('Gerado em', data.generated_at);
  y -= 6;

  // Slot CAE
  drawSectionTitle('Slot CAE');
  if (data.cae_slot) {
    drawField('Equipamento', data.cae_slot.equipment);
    drawField('Data', fmtDate(data.cae_slot.date));
    drawField('Horário', `${data.cae_slot.start_time}–${data.cae_slot.end_time}`);
  } else {
    drawText('Nenhum slot CAE selecionado.', 10, font);
  }

  // Recursos
  drawSectionTitle('Recursos');
  drawField('Simulador', data.simulator_id != null ? `#${data.simulator_id}` : 'pendente');
  drawField('Instrutor/Examinador', data.instructor_id != null ? `#${data.instructor_id}` : 'pendente');

  // Tripulantes / currículo individual
  drawSectionTitle('Tripulantes e currículo individual');
  if (data.participants.length === 0) {
    drawText('Nenhum participante.', 10, font);
  }
  for (const participant of data.participants) {
    ensureSpace(16);
    page.drawText(participant.funcionario_nome, { x: MARGIN, y, size: 11, font: bold });
    y -= 15;
    drawField('  Qualificação', participant.qualificacao_nome || '—');
    drawField('  Vencimento', fmtDate(participant.qualificacao_vencimento));
    drawField(
      '  Modelo/sessão',
      participant.modelo_nome
        ? `${participant.modelo_codigo ? participant.modelo_codigo + ' — ' : ''}${participant.modelo_nome}`
        : '—',
    );
    y -= 4;
  }

  // Escala considerada
  drawSectionTitle('Escala considerada');
  drawText(data.escala_considerada || 'Nenhum estado de escala registrado no snapshot.', 10, font);

  // Warnings
  drawSectionTitle('Avisos');
  if (data.warnings.length === 0) {
    drawText('Nenhum aviso.', 10, font);
  } else {
    for (const warning of data.warnings) {
      drawText(`• ${warning}`, 10, font, rgb(0.6, 0.3, 0));
    }
  }

  // Aprovação
  drawSectionTitle('Aprovação');
  drawField('Aprovador/responsável', data.aprovador_nome || '—');
  drawField('Data da decisão', data.aprovado_em ? data.aprovado_em : '—');
  drawText(`Observações: ${data.observacoes || '—'}`, 10, font);

  return doc.save();
}
