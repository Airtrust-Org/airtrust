export type TrainingCompliancePendingRow = {
  funcionario_id: number;
  funcionario_nome: string;
  matricula: string | null;
  setor_id: number | null;
  setor_nome: string | null;
  funcao_id: number | null;
  funcao_nome: string | null;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string | null;
  qualificacao_tipo_codigo: string | null;
  status_compliance: 'VENCIDO' | 'NAO_REALIZADO' | 'VENCENDO' | 'EM_ANDAMENTO' | 'CONFORME';
  data_validade: string | null;
  dias_para_vencer: number | null;
  ultima_data: string | null;
  critico_operacional: boolean;
  referencia_normativa: string | null;
  curso_ead_titulo: string | null;
  tem_email: boolean;
  tem_whatsapp: boolean;
  avisos_enviados: number;
  ultimo_aviso_em: string | null;
  ultimo_canal: string | null;
  ultimo_status_envio: string | null;
};

export type TrainingComplianceReportSummary = {
  pessoas: number;
  requisitos_obrigatorios: number;
  conformes: number;
  vencendo: number;
  vencidos: number;
  nao_realizados: number;
  em_andamento: number;
  compliance_pct: number | null;
};

export type TrainingComplianceReportContext = {
  empresaNome: string;
  usuarioNome: string;
  setorNome?: string | null;
  funcaoNome?: string | null;
  generatedAt?: Date;
};

function safeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 70) || 'relatorio';
}

function dateBr(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function complianceStatusLabel(row: TrainingCompliancePendingRow): string {
  if (row.status_compliance === 'NAO_REALIZADO') return 'Nunca realizou';
  if (row.status_compliance === 'EM_ANDAMENTO') return 'Em andamento';
  if (row.status_compliance === 'VENCENDO') {
    return row.dias_para_vencer == null ? 'Vencendo' : `Vence em ${row.dias_para_vencer} dia(s)`;
  }
  if (row.status_compliance === 'VENCIDO') {
    const days = Math.abs(row.dias_para_vencer || 0);
    return days ? `Vencido há ${days} dia(s)` : 'Vencido';
  }
  return 'Conforme';
}

export function buildComplianceNarrative(
  summary: TrainingComplianceReportSummary,
  rows: TrainingCompliancePendingRow[],
  context: TrainingComplianceReportContext,
): string {
  const peopleWithPending = new Set(rows.map((row) => row.funcionario_id)).size;
  const scope = context.setorNome ? `O setor ${context.setorNome}` : 'A organização';
  if (rows.length === 0) {
    return `${scope} não apresenta pendências de treinamento obrigatório nos filtros atuais.`;
  }
  const critical = rows.filter((row) => row.critico_operacional).length;
  const parts = [
    `${scope} possui ${peopleWithPending} colaborador(es) com ao menos uma pendência obrigatória.`,
    `${summary.vencidos} requisito(s) estão vencidos e ${summary.nao_realizados} ainda não foram realizados.`,
  ];
  if (summary.vencendo > 0) parts.push(`${summary.vencendo} requisito(s) estão próximos do vencimento.`);
  if (critical > 0) parts.push(`${critical} pendência(s) estão marcadas como críticas para a operação.`);
  return parts.join(' ');
}

export async function generateTrainingCompliancePdf(
  rows: TrainingCompliancePendingRow[],
  summary: TrainingComplianceReportSummary,
  context: TrainingComplianceReportContext,
): Promise<{ base64: string; filename: string; blob: Blob }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const generatedAt = context.generatedAt || new Date();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 10;
  const columns = [36, 30, 28, 49, 31, 24, 22, 30];
  const headers = ['Funcionário', 'Setor', 'Cargo', 'Treinamento', 'Situação', 'Vencimento', 'Avisos', 'Último aviso'];
  const tableWidth = columns.reduce((sum, current) => sum + current, 0);

  const title = context.setorNome
    ? `Compliance de Treinamentos — ${context.setorNome}`
    : 'Compliance de Treinamentos — Relatório Executivo';

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(title, margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Empresa: ${context.empresaNome}`, margin, 19);
    doc.text(`Emitido por: ${context.usuarioNome}`, margin, 24);
    doc.text(`Emissão: ${generatedAt.toLocaleString('pt-BR')}`, margin, 29);
    const filters = [context.setorNome ? `Setor: ${context.setorNome}` : null, context.funcaoNome ? `Cargo: ${context.funcaoNome}` : null]
      .filter(Boolean)
      .join(' | ');
    doc.text(filters || 'Escopo: organização', margin, 34);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(
      `Compliance: ${summary.compliance_pct == null ? '—' : `${summary.compliance_pct}%`}   |   Pessoas: ${summary.pessoas}   |   Vencidos: ${summary.vencidos}   |   Nunca realizados: ${summary.nao_realizados}   |   Vencendo: ${summary.vencendo}`,
      margin,
      40,
    );
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const narrative = doc.splitTextToSize(buildComplianceNarrative(summary, rows, context), width - margin * 2);
    doc.text(narrative, margin, 46);
    return 48 + Math.max(1, narrative.length) * 4;
  };

  const drawTableHeader = (startY: number) => {
    doc.setFillColor(232, 237, 243);
    doc.rect(margin, startY, tableWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    let x = margin;
    headers.forEach((header, index) => {
      doc.text(header, x + 1.3, startY + 4.7);
      x += columns[index];
    });
    return startY + 7;
  };

  let y = drawTableHeader(drawHeader());
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);

  rows.forEach((row) => {
    const cells = [
      row.funcionario_nome,
      row.setor_nome || 'Sem setor',
      row.funcao_nome || 'Sem cargo',
      row.qualificacao_tipo_nome || row.qualificacao_tipo_codigo || 'Treinamento',
      complianceStatusLabel(row),
      dateBr(row.data_validade),
      String(row.avisos_enviados || 0),
      row.ultimo_aviso_em ? new Date(row.ultimo_aviso_em).toLocaleString('pt-BR') : 'Nunca',
    ];
    const wrapped = cells.map((cell, index) => doc.splitTextToSize(String(cell), columns[index] - 2.5));
    const lines = Math.max(...wrapped.map((value) => value.length), 1);
    const rowHeight = Math.max(6, lines * 3.2 + 2);
    if (y + rowHeight > height - 14) {
      doc.addPage();
      y = drawTableHeader(12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
    }
    let x = margin;
    wrapped.forEach((cellLines, index) => {
      doc.text(cellLines, x + 1.2, y + 3.5);
      x += columns[index];
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
    y += rowHeight;
  });

  if (!rows.length) {
    doc.setFontSize(9);
    doc.text('Nenhuma pendência de treinamento obrigatório encontrada para o filtro selecionado.', margin, y + 8);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(
      `Documento de acompanhamento de treinamentos regulamentares e obrigatórios — página ${page}/${pages}`,
      margin,
      height - 6,
    );
    doc.setTextColor(0);
  }

  const filename = `compliance-treinamentos-${safeFilePart(context.setorNome || context.empresaNome)}-${generatedAt.toISOString().slice(0, 10)}.pdf`;
  const arrayBuffer = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  const base64 = btoa(binary);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return { base64, filename, blob };
}

export function downloadTrainingCompliancePdf(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
