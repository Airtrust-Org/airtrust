import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const filePath = '/tmp/qualificacoes_tipos_teste.xlsx';
const fileBuffer = fs.readFileSync(filePath);

const formData = new FormData();
formData.append('file', new Blob([fileBuffer], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'qualificacoes_tipos.xlsx');

console.log('📝 Enviando arquivo para validação...');
fetch('http://localhost:8787/api/importacao-v2/validar/qualificacoes_tipos', {
  method: 'POST',
  body: formData
})
  .then(res => res.json())
  .then(data => {
    console.log('✅ Resposta:', JSON.stringify(data, null, 2));
  })
  .catch(err => console.error('❌ Erro:', err.message));
