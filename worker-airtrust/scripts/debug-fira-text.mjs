import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText } from 'unpdf';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Uso: node scripts/debug-fira-text.mjs <caminho-do-pdf>');
  process.exit(1);
}

const abs = path.resolve(process.cwd(), filePath);
const buff = await fs.readFile(abs);
const { text } = await extractText(new Uint8Array(buff), { mergePages: true });

const linhas = String(text || '')
  .split(/\r?\n/)
  .map((l) => l.replace(/\s+/g, ' ').trim())
  .filter(Boolean);

const canacRegex = /(?<!\d)(\d(?:[\s.-]?\d){4,6})(?!\d)/g;
const hhmmRegex = /\b\d{1,3}:\d{2}\b/g;

console.log('===== RESUMO =====');
console.log('Arquivo:', abs);
console.log('Chars extraídos:', String(text || '').length);
console.log('Linhas limpas:', linhas.length);

console.log('\n===== LINHAS (1..220) =====');
linhas.slice(0, 220).forEach((l, i) => {
  console.log(String(i + 1).padStart(4, ' '), l);
});

console.log('\n===== CANDIDATOS CANAC =====');
for (let i = 0; i < linhas.length; i++) {
  const line = linhas[i];
  const matches = [...line.matchAll(canacRegex)]
    .map((m) => m[1]?.replace(/\D/g, ''))
    .filter(Boolean);
  if (matches.length > 0) {
    console.log(String(i + 1).padStart(4, ' '), matches.join(', '), '::', line);
  }
}

console.log('\n===== LINHAS COM HORÁRIOS =====');
for (let i = 0; i < linhas.length; i++) {
  const line = linhas[i];
  if (hhmmRegex.test(line)) {
    const horas = line.match(hhmmRegex) || [];
    console.log(String(i + 1).padStart(4, ' '), `[${horas.join(', ')}]`, '::', line);
  }
}
