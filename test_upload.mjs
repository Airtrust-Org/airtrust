import fs from 'fs';

const filePath = '/tmp/qualificacoes_tipos_teste.xlsx';
const fileBuffer = fs.readFileSync(filePath);

const formData = new FormData();
const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
formData.append('file', blob, 'qualificacoes_tipos.xlsx');

console.log('📝 Enviando arquivo para validação...');

try {
  const response = await fetch('http://localhost:8787/api/importacao-v2/validar/qualificacoes_tipos', {
    method: 'POST',
    body: formData
  });

  const data = await response.json();
  console.log('✅ Resposta:', JSON.stringify(data, null, 2));
} catch (error) {
  console.error('❌ Erro:', error.message);
}
