import ExcelJS from 'exceljs';

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Qualificações');
sheet.columns = [
  { header: 'tipo', key: 'tipo' },
  { header: 'codigo', key: 'codigo' },
  { header: 'nome', key: 'nome' },
  { header: 'descricao', key: 'descricao' },
  { header: 'categoria', key: 'categoria' },
  { header: 'carga_horaria', key: 'carga_horaria' },
  { header: 'validade', key: 'validade' },
  { header: 'observacoes', key: 'observacoes' },
];
sheet.addRow({
  tipo: 'teste',
  codigo: 'TESTE001',
  nome: 'Teste Básico',
  descricao: 'Tipo de qualificação para testes',
  categoria: 'Geral',
  carga_horaria: '8',
  validade: '180',
  observacoes: 'Arquivo de teste',
});
await workbook.xlsx.writeFile('/tmp/qualificacoes_tipos_teste.xlsx');
console.log('✅ Arquivo XLSX criado: /tmp/qualificacoes_tipos_teste.xlsx');
