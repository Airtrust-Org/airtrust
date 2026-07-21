#!/usr/bin/env node
/**
 * Prepares a tenant-scoped simulator-matrix import from the private instructor
 * packages. Source workbooks/guides are deliberately never copied into git.
 *
 * This command is intentionally a planner: applying the generated plan must
 * be done by the controlled local D1 procedure after the snapshot is reviewed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import XLSX from 'xlsx';
import { createDeterministicPlan, sha256 } from './lib/matriz-import-plan.mjs';

const EXPECTED = { AW139: { modelos: 30, itens: 540, loft: 14 }, SK76: { modelos: 21, itens: 378, loft: 8 } };

function fail(message) { throw new Error(`Importação de matriz recusada: ${message}`); }
function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function text(value) { return String(value ?? '').trim(); }
function key(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
function headerIndex(rows) {
  const index = rows.findIndex((row) => {
    const normalized = row.map(key);
    return normalized.includes('modelo') && normalized.includes('ordem') && normalized.includes('codigo');
  });
  if (index < 0) fail('cabeçalho Matriz Completa não encontrado');
  return index;
}
function worksheetRows(file, sheet) {
  const workbook = XLSX.readFile(file, { cellDates: false });
  if (!workbook.Sheets[sheet]) fail(`aba ${sheet} ausente em ${path.basename(file)}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '' });
}
function readMatrix(file, aircraft) {
  const rows = worksheetRows(file, 'Matriz Completa');
  const headerRow = headerIndex(rows);
  const headers = rows[headerRow].map(text);
  const records = rows.slice(headerRow + 1).map((row) => Object.fromEntries(headers.map((header, index) => [header, text(row[index])]))).filter((row) => row.Modelo && row.Código);
  const models = new Map();
  const items = [];
  for (const row of records) {
    const ordem = Number(row.Ordem);
    if (!Number.isInteger(ordem) || ordem < 1) fail(`${aircraft}/${row.Modelo}: ordem inválida ${row.Ordem}`);
    const model = models.get(row.Modelo) || {
      codigo: row.Modelo,
      programa: row.Programa,
      ciclo: row.Ciclo || null,
      titulo: row.Título || row['Título / foco'] || null,
      aeronave: aircraft,
    };
    models.set(row.Modelo, model);
    items.push({
      modelo: row.Modelo, ordem, codigo: row.Código, nome: row['Manobra / competência'],
      execucao_pf: row['Execução PF'] || null, categoria: row.Categoria || null,
      fase_voo: row['Fase de voo'] || null, tipo_conteudo: row['Tipo de conteúdo'] || null,
      cenario: row['Cenário / observação'] || row['IOS / cenário'] || null,
      configuracao_ios: row['Configuração / inserção'] || null,
      desempenho_esperado: row['Explicação para avaliação'] || row['Desempenho esperado'] || null,
      foco_instrutor: row['Foco de avaliação'] || row['Foco do instrutor'] || null,
      como_observar: row['Como observar'] || null,
      referencia_tecnica: row['Referência técnica'] || null,
      rastreabilidade_interna: row['Rastreabilidade de programa — não procedimental'] || row.Rastreabilidade || null,
      criterios: { '1-2': row['Nota 1-2'] || null, '3-5': row['Nota 3-5'] || null, '6-8': row['Nota 6-8'] || null, '9-10': row['Nota 9-10'] || null },
    });
  }
  return { models: [...models.values()], items };
}
function validateMatrix(matrix, aircraft) {
  const expected = EXPECTED[aircraft];
  if (matrix.models.length !== expected.modelos) fail(`${aircraft}: esperados ${expected.modelos} modelos; encontrados ${matrix.models.length}`);
  if (matrix.items.length !== expected.itens) fail(`${aircraft}: esperados ${expected.itens} vínculos; encontrados ${matrix.items.length}`);
  const codes = new Set();
  for (const model of matrix.models) {
    const items = matrix.items.filter((item) => item.modelo === model.codigo).sort((a, b) => a.ordem - b.ordem);
    if (items.length !== 18) fail(`${aircraft}/${model.codigo}: exige 18 posições; encontradas ${items.length}`);
    const orders = items.map((item) => item.ordem).join(',');
    if (orders !== '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18') fail(`${aircraft}/${model.codigo}: ordens não são 1–18 (${orders})`);
    for (const item of items) {
      if (!item.codigo || !item.nome) fail(`${aircraft}/${model.codigo}/${item.ordem}: código ou nome ausente`);
      const key = `${model.codigo}:${item.codigo}:${item.ordem}`;
      if (codes.has(key)) fail(`${aircraft}/${model.codigo}: vínculo duplicado ${item.codigo}/${item.ordem}`);
      codes.add(key);
    }
  }
}
function validateLoft(sourceDir, aircraft, matrix) {
  const file = aircraft === 'AW139' ? 'CORRECAO_LOFT_DECOLAGEM_PFB.json' : 'arquitetura_loft_duas_pernas.json';
  const loft = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
  const entries = Array.isArray(loft) ? loft : (loft.lofts || loft.sessoes || []);
  if (entries.length !== EXPECTED[aircraft].loft) fail(`${aircraft}: esperados ${EXPECTED[aircraft].loft} LOFT; encontrados ${entries.length}`);
  for (const entry of entries) {
    const modelCode = text(entry.modelo || entry.model || '').replace(/\.html$/, '');
    const sequence = entry.sequence || entry.sequencia || [];
    if (Array.isArray(sequence) && sequence.length && sequence.length !== 18) fail(`${aircraft}/${modelCode || 'LOFT'}: sequência LOFT sem 18 itens`);
  }
  return entries.length;
}
function requireCanonicalSources(directory, aircraft, expectedHtml) {
  const required = aircraft === 'AW139'
    ? ['Matriz_AW139_CORRIGIDA_LOFT.xlsx', 'CORRECAO_LOFT_DECOLAGEM_PFB.json', 'VALIDACAO_FINAL.json', 'criterios_avaliacao_especificos_1a10.json']
    : ['Matriz_S76_Novo_Padrao.xlsx', 'Matriz_S76_Novo_Padrao.csv', 'arquitetura_loft_duas_pernas.json', 'VALIDACAO_FINAL.json', 'criterios_avaliacao_especificos_1a10.json', 'Alteracoes_AirTrust_Recomendadas_S76.csv'];
  for (const file of required) if (!fs.existsSync(path.join(directory, file))) fail(`${aircraft}: fonte canônica ausente (${file})`);
  const htmlDir = path.join(directory, 'html');
  const htmlFiles = fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir).filter((file) => file.endsWith('.html')) : [];
  if (htmlFiles.length !== expectedHtml) fail(`${aircraft}: esperados ${expectedHtml} guias HTML; encontrados ${htmlFiles.length}`);
  const validation = JSON.parse(fs.readFileSync(path.join(directory, 'VALIDACAO_FINAL.json'), 'utf8'));
  if (validation.todos_loft_decolagem_antes_evento === false) fail(`${aircraft}: validação final reprova LOFT`);
  return required;
}
function compareS76Csv(csvFile, matrix) {
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(csvFile).Sheets.Sheet1, { header: 1, defval: '' });
  const header = headerIndex(rows);
  const keys = rows[header].map(key);
  const csv = rows.slice(header + 1).map((row) => Object.fromEntries(keys.map((column, index) => [column, text(row[index])]))).filter((row) => row.modelo && row.codigo);
  const left = new Set(matrix.items.map((item) => `${item.modelo}|${item.ordem}|${item.codigo}`));
  const right = new Set(csv.map((item) => `${item.modelo}|${item.ordem}|${item.codigo}`));
  const onlyWorkbook = [...left].filter((item) => !right.has(item));
  const onlyCsv = [...right].filter((item) => !left.has(item));
  if (onlyWorkbook.length || onlyCsv.length) fail(`S-76 XLSX/CSV divergem: XLSX-only=${onlyWorkbook.length}; CSV-only=${onlyCsv.length}`);
}

const aw139 = arg('--aw139');
const sk76 = arg('--sk76');
const empresaId = Number(arg('--empresa-id'));
const out = arg('--out') || 'tmp/simuladores-matriz-import';
if (!aw139 || !sk76 || !Number.isInteger(empresaId) || empresaId <= 0) {
  fail('uso: --aw139 <diretório> --sk76 <diretório> --empresa-id <tenant> [--out <diretório>]');
}
const awRequired = requireCanonicalSources(aw139, 'AW139', 30);
const s76Required = requireCanonicalSources(sk76, 'SK76', 21);
const aw = readMatrix(path.join(aw139, 'Matriz_AW139_CORRIGIDA_LOFT.xlsx'), 'AW139');
const s76 = readMatrix(path.join(sk76, 'Matriz_S76_Novo_Padrao.xlsx'), 'SK76');
validateMatrix(aw, 'AW139'); validateMatrix(s76, 'SK76');
compareS76Csv(path.join(sk76, 'Matriz_S76_Novo_Padrao.csv'), s76);
const loftAw = validateLoft(aw139, 'AW139', aw);
const loftS76 = validateLoft(sk76, 'SK76', s76);
fs.mkdirSync(out, { recursive: true });
const sourceFiles = [
  ...awRequired.map((file) => [aw139, `AW139/${file}`]),
  ...s76Required.map((file) => [sk76, `SK76/${file}`]),
];
const sourceHashes = Object.fromEntries(sourceFiles.map(([directory, label]) => {
  const file = label.split('/').at(-1);
  return [label, sha256(fs.readFileSync(path.join(directory, file)))];
}));
const deterministic = createDeterministicPlan({ empresaId, sourceHashes, aw139: aw, sk76: s76, loft: loftAw + loftS76 });
const plan = { generated_at: new Date().toISOString(), mode: 'DRY_RUN', ...deterministic, safeguards: ['tenant obrigatório', 'não aplica DML', 'requer snapshot e revisão antes de aplicar', 'modelos históricos devem ser versionados, não sobrescritos'] };
fs.writeFileSync(path.join(out, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, out: path.resolve(out), empresa_id: empresaId, ...plan.totals }, null, 2));
