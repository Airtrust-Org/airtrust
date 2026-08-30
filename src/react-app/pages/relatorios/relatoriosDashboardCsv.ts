export interface RelatoriosDashboardCsvData {
  certMes: Array<{ mes?: string; total?: number }>;
  complianceSetor: Array<{ setor?: string; taxa_compliance?: number }>;
  simUso: Array<{ nome?: string; total_sessoes?: number }>;
  treinCat: Array<{ categoria?: string; total?: number }>;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  if (!/[;"\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildRelatoriosDashboardCsv(data: RelatoriosDashboardCsvData): string {
  const rows: Array<Array<string | number | null | undefined>> = [
    ['Seção', 'Categoria', 'Valor'],
    ...data.certMes.map((item) => ['Certificações por mês', item.mes ?? '-', item.total ?? 0]),
    ...data.complianceSetor.map((item) => [
      'Compliance por setor',
      item.setor ?? '-',
      item.taxa_compliance ?? 0,
    ]),
    ...data.simUso.map((item) => [
      'Uso de simuladores',
      item.nome ?? '-',
      item.total_sessoes ?? 0,
    ]),
    ...data.treinCat.map((item) => [
      'Treinamentos por categoria',
      item.categoria ?? '-',
      item.total ?? 0,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(';')).join('\n');
}

export function downloadRelatoriosDashboardCsv(data: RelatoriosDashboardCsvData): void {
  const csv = buildRelatoriosDashboardCsv(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorios-airtrust-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
