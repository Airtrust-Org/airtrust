import type { HistoricoQualificacao } from '@/react-app/hooks/useQualificacoesExt';
import { apiEnvelope } from '@/react-app/lib/api-contract';

export const QUALIFICATION_REPORT_STATUS_OPTIONS = [
  { value: 'VENCIDA', label: 'Vencidas' },
  { value: 'VENCENDO_30', label: 'Em vencimento' },
  { value: 'VALIDA', label: 'Vigentes' },
] as const;

export type QualificationReportStatus =
  (typeof QUALIFICATION_REPORT_STATUS_OPTIONS)[number]['value'];

export interface QualificationHistoryReportFilters {
  search?: string;
  statuses: QualificationReportStatus[];
  setorIds?: number[];
  funcionarioId?: number;
  tipoId?: number;
  aeronaveId?: number;
  categoria?: string;
  categoriaId?: number;
  funcao?: string;
  vencimentoInicio?: string;
  vencimentoFim?: string;
  conclusaoInicio?: string;
  conclusaoFim?: string;
}

export interface QualificationHistoryReportContext {
  empresaNome?: string;
  usuarioNome?: string;
  filterLabels?: string[];
  generatedAt?: Date;
}

interface HistoricoMeta {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
}

export interface QualificationHistoryReportRow {
  id: number;
  funcionario: string;
  setor: string;
  funcao: string;
  aeronave: string;
  qualificacao: string;
  codigo: string;
  categoria: string;
  status: string;
  statusLabel: string;
  dataConclusao: string;
  dataVencimento: string;
}

function isoDate(value?: string): string {
  return String(value || '')
    .trim()
    .slice(0, 10);
}

export function formatDateBr(value?: string): string {
  const date = isoDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '-';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function qualificationStatusLabel(status?: string): string {
  switch (
    String(status || '')
      .trim()
      .toUpperCase()
  ) {
    case 'VENCIDA':
      return 'Vencida';
    case 'VENCENDO_30':
      return 'Em vencimento';
    case 'VALIDA':
      return 'Vigente';
    case 'RENOVADA':
      return 'Renovada';
    case 'PLANEJADA':
      return 'Planejada';
    case 'CANCELADA':
      return 'Cancelada';
    case 'INDETERMINADA':
    case 'INDEFINIDA':
      return 'Indeterminada';
    default:
      return status ? String(status) : 'Indeterminada';
  }
}

export function buildQualificationHistoryReportQuery(
  filters: QualificationHistoryReportFilters,
  page = 1,
  limit = 500,
): string {
  const query = new URLSearchParams({
    page: String(Math.max(1, page)),
    limit: String(Math.min(500, Math.max(1, limit))),
    stats: 'false',
    orderBy: 'data_vencimento',
    order: 'ASC',
  });

  if (filters.search?.trim()) query.set('search', filters.search.trim());
  if (filters.statuses.length > 0) query.set('statuses', filters.statuses.join(','));
  if (filters.setorIds?.length) query.set('setor_ids', filters.setorIds.join(','));
  if (filters.funcionarioId) query.set('funcionario_id', String(filters.funcionarioId));
  if (filters.tipoId) query.set('tipo_id', String(filters.tipoId));
  if (filters.aeronaveId) query.set('aeronave_id', String(filters.aeronaveId));
  if (filters.categoriaId) query.set('categoria_id', String(filters.categoriaId));
  else if (filters.categoria?.trim()) query.set('categoria', filters.categoria.trim());

  return `/api/qualificacoes/historico?${query.toString()}`;
}

function withinDateRange(value: string | undefined, start?: string, end?: string): boolean {
  if (!start && !end) return true;
  const date = isoDate(value);
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function applyQualificationHistoryReportClientFilters(
  rows: HistoricoQualificacao[],
  filters: QualificationHistoryReportFilters,
): HistoricoQualificacao[] {
  const functionNeedle = filters.funcao?.trim().toLocaleLowerCase('pt-BR') || '';

  return rows.filter((row) => {
    const rowFunction = String(
      row.funcionario_funcao || row.funcionario_cargo || '',
    ).toLocaleLowerCase('pt-BR');
    if (functionNeedle && !rowFunction.includes(functionNeedle)) return false;
    if (!withinDateRange(row.data_vencimento, filters.vencimentoInicio, filters.vencimentoFim))
      return false;
    if (!withinDateRange(row.data_conclusao, filters.conclusaoInicio, filters.conclusaoFim))
      return false;
    return true;
  });
}

export async function fetchQualificationHistoryReport(
  filters: QualificationHistoryReportFilters,
): Promise<HistoricoQualificacao[]> {
  const allRows: HistoricoQualificacao[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const envelope = await apiEnvelope<HistoricoQualificacao[]>(
      buildQualificationHistoryReportQuery(filters, page, 500),
      { headers: { 'Cache-Control': 'no-cache' } },
    );
    if (Array.isArray(envelope.data)) allRows.push(...envelope.data);
    const meta = envelope.meta as HistoricoMeta | undefined;
    totalPages = Math.max(1, Number(meta?.total_pages || 1));
    page += 1;
  } while (page <= totalPages);

  return applyQualificationHistoryReportClientFilters(allRows, filters);
}

export function buildQualificationHistoryReportRows(
  source: HistoricoQualificacao[],
): QualificationHistoryReportRow[] {
  return source.map((row) => {
    const status = String(row.status || '')
      .trim()
      .toUpperCase();
    return {
      id: row.id,
      funcionario: row.funcionario_nome || '-',
      setor: row.funcionario_setor || '-',
      funcao: row.funcionario_funcao || row.funcionario_cargo || '-',
      aeronave: row.funcionario_aeronave || '-',
      qualificacao: row.qualificacao_nome || row.qualificacao_desc || row.tipo || '-',
      codigo: row.qualificacao_codigo || row.codigo || '-',
      categoria: row.qualificacao_categoria || row.categoria || '-',
      status,
      statusLabel: qualificationStatusLabel(status),
      dataConclusao: formatDateBr(row.data_conclusao),
      dataVencimento: formatDateBr(row.data_vencimento),
    };
  });
}

function summarize(rows: QualificationHistoryReportRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.status === 'VENCIDA') acc.vencidas += 1;
      if (row.status === 'VENCENDO_30') acc.vencendo += 1;
      if (row.status === 'VALIDA') acc.vigentes += 1;
      return acc;
    },
    { total: 0, vencidas: 0, vencendo: 0, vigentes: 0 },
  );
}

function safeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportQualificationHistoryExcel(
  source: HistoricoQualificacao[],
  context: QualificationHistoryReportContext = {},
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const rows = buildQualificationHistoryReportRows(source);
  const stats = summarize(rows);
  const generatedAt = context.generatedAt || new Date();

  workbook.creator = 'AirTrust';
  workbook.created = generatedAt;

  const summary = workbook.addWorksheet('Resumo');
  summary.columns = [{ width: 26 }, { width: 80 }];
  summary.addRows([
    ['Relatório', 'Relatório de Histórico de Qualificações'],
    ['Empresa', context.empresaNome || 'Empresa atual'],
    ['Emitido por', context.usuarioNome || 'Usuário autenticado'],
    ['Emitido em', generatedAt.toLocaleString('pt-BR')],
    ['Total', stats.total],
    ['Vencidas', stats.vencidas],
    ['Em vencimento', stats.vencendo],
    ['Vigentes', stats.vigentes],
    ['Filtros', (context.filterLabels || []).join(' | ') || 'Sem filtros adicionais'],
  ]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getColumn(1).font = { bold: true };

  const sheet = workbook.addWorksheet('Qualificações', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Status', key: 'statusLabel', width: 18 },
    { header: 'Funcionário', key: 'funcionario', width: 36 },
    { header: 'Setor', key: 'setor', width: 28 },
    { header: 'Função', key: 'funcao', width: 28 },
    { header: 'Aeronave', key: 'aeronave', width: 18 },
    { header: 'Categoria', key: 'categoria', width: 24 },
    { header: 'Código', key: 'codigo', width: 18 },
    { header: 'Qualificação', key: 'qualificacao', width: 42 },
    { header: 'Conclusão', key: 'dataConclusao', width: 15 },
    { header: 'Vencimento', key: 'dataVencimento', width: 15 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: 'A1', to: 'J1' };

  const sourceById = new Map(source.map((item) => [item.id, item]));
  for (const row of rows) {
    const excelRow = sheet.addRow(row);
    const original = sourceById.get(row.id);
    const completion = isoDate(original?.data_conclusao);
    const expiry = isoDate(original?.data_vencimento);
    if (completion) {
      excelRow.getCell('dataConclusao').value = new Date(`${completion}T12:00:00`);
      excelRow.getCell('dataConclusao').numFmt = 'dd/mm/yyyy';
    }
    if (expiry) {
      excelRow.getCell('dataVencimento').value = new Date(`${expiry}T12:00:00`);
      excelRow.getCell('dataVencimento').numFmt = 'dd/mm/yyyy';
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const datePart = generatedAt.toISOString().slice(0, 10);
  downloadBlob(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `historico-qualificacoes-${safeFilePart(context.empresaNome || 'empresa')}-${datePart}.xlsx`,
  );
}

export async function exportQualificationHistoryPdf(
  source: HistoricoQualificacao[],
  context: QualificationHistoryReportContext = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rows = buildQualificationHistoryReportRows(source);
  const stats = summarize(rows);
  const generatedAt = context.generatedAt || new Date();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const widths = [26, 42, 30, 30, 57, 25, 25];
  const headers = [
    'Status',
    'Funcionário',
    'Setor',
    'Função',
    'Qualificação',
    'Conclusão',
    'Vencimento',
  ];
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);

  const drawDocumentHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Relatório de Histórico de Qualificações', margin, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Empresa: ${context.empresaNome || 'Empresa atual'}`, margin, 19);
    doc.text(`Emitido por: ${context.usuarioNome || 'Usuário autenticado'}`, margin, 24);
    doc.text(`Emissão: ${generatedAt.toLocaleString('pt-BR')}`, margin, 29);
    doc.text(
      `Total: ${stats.total}  |  Vencidas: ${stats.vencidas}  |  Em vencimento: ${stats.vencendo}  |  Vigentes: ${stats.vigentes}`,
      margin,
      34,
    );
    const filterLines = doc.splitTextToSize(
      `Filtros: ${(context.filterLabels || []).join(' | ') || 'sem filtros adicionais'}`,
      pageWidth - margin * 2,
    );
    doc.text(filterLines, margin, 39);
    return 41 + Math.max(1, filterLines.length) * 4;
  };

  const drawTableHeader = (startY: number) => {
    let x = margin;
    doc.setFillColor(232, 237, 243);
    doc.rect(margin, startY, tableWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    headers.forEach((header, index) => {
      doc.text(header, x + 1.5, startY + 4.8);
      x += widths[index];
    });
    return startY + 7;
  };

  let y = drawTableHeader(drawDocumentHeader());
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  rows.forEach((row) => {
    const cells = [
      row.statusLabel,
      row.funcionario,
      row.setor,
      row.funcao,
      row.qualificacao,
      row.dataConclusao,
      row.dataVencimento,
    ];
    const wrapped = cells.map((cell, index) =>
      doc.splitTextToSize(String(cell), widths[index] - 3),
    );
    const maxLines = Math.max(...wrapped.map((lines) => lines.length), 1);
    const rowHeight = Math.max(6, maxLines * 3.4 + 2);

    if (y + rowHeight > pageHeight - 12) {
      doc.addPage();
      y = drawTableHeader(12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }

    let x = margin;
    wrapped.forEach((lines, index) => {
      doc.text(lines, x + 1.5, y + 3.7);
      x += widths[index];
    });
    doc.setDrawColor(220, 224, 230);
    doc.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
    y += rowHeight;
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 5, {
      align: 'right',
    });
    doc.text('AirTrust', margin, pageHeight - 5);
  }

  const datePart = generatedAt.toISOString().slice(0, 10);
  doc.save(
    `historico-qualificacoes-${safeFilePart(context.empresaNome || 'empresa')}-${datePart}.pdf`,
  );
}
