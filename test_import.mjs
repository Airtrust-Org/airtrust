import * as XLSX from 'xlsx';
import fs from 'fs';

// Criar uma workbook com dados de teste
const data = [
  {
    tipo: 'teste',
    codigo: 'TESTE001',
    nome: 'Teste Básico',
    descricao: 'Tipo de qualificação para testes',
    categoria: 'Geral',
    carga_horaria: '8',
    validade: '180',
    observacoes: 'Arquivo de teste'
  }
];

const ws = XLSX.utils.json_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Qualificações');
XLSX.writeFile(wb, '/tmp/qualificacoes_tipos_teste.xlsx');

console.log('✅ Arquivo XLSX criado: /tmp/qualificacoes_tipos_teste.xlsx');
