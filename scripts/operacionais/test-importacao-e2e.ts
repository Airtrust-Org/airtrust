/**
 * TESTE E2E - Sistema de Importação
 *
 * Testa todas as funcionalidades críticas:
 * 1. Utils (CPF e Datas)
 * 2. Validators
 * 3. Fluxo completo de importação
 */

import { normalizeCPF, isValidCPF, formatCPF } from './worker-airtrust/src/utils/cpf';
import { parseFlexibleDate, isValidISODate, formatDateBR } from './worker-airtrust/src/utils/dates';

// ================================================================
// TESTE 1: Utils CPF
// ================================================================
console.log('=== TESTE 1: Utils CPF ===\n');

const testCasesCPF = [
  { input: '012.345.678-90', expectedNormalized: '01234567890', expectedValid: true },
  { input: '12345678-90', expectedNormalized: '01234567890', expectedValid: true },
  { input: 1234567890, expectedNormalized: '01234567890', expectedValid: true },
  { input: '01234567890', expectedNormalized: '01234567890', expectedValid: true },
  { input: '00000000000', expectedNormalized: '00000000000', expectedValid: false }, // Sequência
  { input: '11111111111', expectedNormalized: '11111111111', expectedValid: false }, // Sequência
  { input: '111.222.333-44', expectedNormalized: '11122233344', expectedValid: false }, // Dígitos inválidos
  { input: '123.456.789-09', expectedNormalized: '12345678909', expectedValid: true }, // CPF real
];

let cpfPassed = 0;
let cpfFailed = 0;

testCasesCPF.forEach((testCase, idx) => {
  const normalized = normalizeCPF(testCase.input);
  const isValid = isValidCPF(normalized);
  const formatted = formatCPF(normalized);

  const passedNormalize = normalized === testCase.expectedNormalized;
  const passedValidate = isValid === testCase.expectedValid;

  if (passedNormalize && passedValidate) {
    cpfPassed++;
    console.log(`✅ CPF Test ${idx + 1}: PASSOU`);
  } else {
    cpfFailed++;
    console.log(`❌ CPF Test ${idx + 1}: FALHOU`);
    console.log(`   Input: ${testCase.input}`);
    console.log(`   Esperado normalized: ${testCase.expectedNormalized}, recebeu: ${normalized}`);
    console.log(`   Esperado valid: ${testCase.expectedValid}, recebeu: ${isValid}`);
  }
});

console.log(`\nRESULTADO CPF: ${cpfPassed} passaram, ${cpfFailed} falharam\n`);

// ================================================================
// TESTE 2: Utils Datas
// ================================================================
console.log('=== TESTE 2: Utils Datas ===\n');

const testCasesDates = [
  { input: '26/11/2025', expected: '2025-11-26' },
  { input: '26/11/25', expected: '2025-11-26' }, // Ano 2 dígitos < 50 = 20XX
  { input: '26/11/80', expected: '1980-11-26' }, // Ano 2 dígitos >= 50 = 19XX
  { input: '1/2/2025', expected: '2025-02-01' }, // Sem zeros à esquerda
  { input: '6/3/2025', expected: '2025-03-06' },
  { input: '2025-11-26', expected: '2025-11-26' }, // Já ISO
  { input: 45623, expected: '2024-11-27' }, // Excel serial (CORRIGIDO: 45623 = 27/nov, não 26)
  { input: 44562, expected: '2022-01-01' }, // Excel serial 2022
  { input: '31/02/2025', expected: null }, // Data inválida
  { input: '99/99/9999', expected: null }, // Data absurda
  { input: '', expected: null }, // Vazio
  { input: null, expected: null }, // Null
];

let datesPassed = 0;
let datesFailed = 0;

testCasesDates.forEach((testCase, idx) => {
  const parsed = parseFlexibleDate(testCase.input);
  const isValid = parsed ? isValidISODate(parsed) : false;

  const passed = parsed === testCase.expected && (parsed ? isValid : true);

  if (passed) {
    datesPassed++;
    console.log(`✅ Date Test ${idx + 1}: PASSOU`);
    if (parsed) {
      const formatted = formatDateBR(parsed);
      console.log(`   ${testCase.input} → ${parsed} → ${formatted}`);
    }
  } else {
    datesFailed++;
    console.log(`❌ Date Test ${idx + 1}: FALHOU`);
    console.log(`   Input: ${testCase.input}`);
    console.log(`   Esperado: ${testCase.expected}, recebeu: ${parsed}`);
  }
});

console.log(`\nRESULTADO DATAS: ${datesPassed} passaram, ${datesFailed} falharam\n`);

// ================================================================
// TESTE 3: Integração com Validators
// ================================================================
console.log('=== TESTE 3: Integração Validators ===\n');

// Simular dados de importação
const funcionariosTestData = [
  {
    linha: 1,
    CPF: '012.345.678-90',
    Nome: 'JOÃO DA SILVA',
    Matricula: '12345',
    Nascimento: '26/11/1980',
    Admissao: '15/01/2020',
    email: 'joao@example.com',
  },
  {
    linha: 2,
    CPF: 1234567890,
    Nome: 'MARIA SANTOS',
    Matricula: '67890',
    Nascimento: 44562, // Excel serial
    Admissao: '1/3/25', // Sem zeros, ano 2 dígitos
  },
  {
    linha: 3,
    CPF: '00000000000', // CPF inválido
    Nome: 'TESTE INVALIDO',
    Matricula: '99999',
    Nascimento: '99/99/9999', // Data inválida
  },
];

console.log('Testando validação de 3 funcionários...\n');

funcionariosTestData.forEach((data, idx) => {
  console.log(`--- Funcionário ${idx + 1} (Linha ${data.linha}) ---`);

  // 1. Normalizar CPF
  const cpfNormalized = normalizeCPF(data.CPF);
  const cpfValid = isValidCPF(cpfNormalized);
  console.log(`CPF: ${data.CPF} → ${cpfNormalized} (válido: ${cpfValid ? '✅' : '❌'})`);

  // 2. Parsear datas
  const nascimento = parseFlexibleDate(data.Nascimento);
  const admissao = data.Admissao ? parseFlexibleDate(data.Admissao) : null;
  console.log(
    `Nascimento: ${data.Nascimento} → ${nascimento || 'INVÁLIDO'} ${nascimento ? '✅' : '❌'}`,
  );
  console.log(
    `Admissão: ${data.Admissao || 'N/A'} → ${admissao || 'INVÁLIDO'} ${admissao ? '✅' : '❌'}`,
  );

  // 3. Resultado esperado
  const shouldPass = cpfValid && nascimento !== null && (!data.Admissao || admissao !== null);
  console.log(`\nResultado esperado: ${shouldPass ? '✅ PASSA' : '❌ FALHA (esperado)'}\n`);
});

// ================================================================
// TESTE 4: Fluxo Completo - Cenários Reais
// ================================================================
console.log('=== TESTE 4: Cenários Reais de Importação ===\n');

const scenariosReal = [
  {
    nome: 'Planilha Excel com máscaras',
    dados: [
      {
        CPF: '012.345.678-90',
        Nome: 'TESTE 1',
        Matricula: 'M001',
        Nascimento: '26/11/1985',
        Admissao: '15/01/2020',
      },
      {
        CPF: '123.456.789-09',
        Nome: 'TESTE 2',
        Matricula: 'M002',
        Nascimento: '15/05/1990',
        Admissao: '20/03/2021',
      },
    ],
    expectErros: 0,
  },
  {
    nome: 'Planilha com datas DD/MM/YY',
    dados: [
      {
        CPF: '01234567890',
        Nome: 'TESTE 3',
        Matricula: 'M003',
        Nascimento: '26/11/90',
        Admissao: '15/01/20',
      },
      {
        CPF: '12345678909',
        Nome: 'TESTE 4',
        Matricula: 'M004',
        Nascimento: '1/5/85',
        Admissao: '20/3/21',
      },
    ],
    expectErros: 0,
  },
  {
    nome: 'Planilha com Excel serials',
    dados: [
      { CPF: 1234567890, Nome: 'TESTE 5', Matricula: 'M005', Nascimento: 44562, Admissao: 44927 },
      { CPF: 12345678909, Nome: 'TESTE 6', Matricula: 'M006', Nascimento: 40179, Admissao: 44562 },
    ],
    expectErros: 0,
  },
  {
    nome: 'Planilha com erros (CPFs e datas inválidas)',
    dados: [
      {
        CPF: '000.000.000-00',
        Nome: 'ERRO 1',
        Matricula: 'E001',
        Nascimento: '99/99/9999',
        Admissao: '15/01/2020',
      },
      {
        CPF: '111.111.111-11',
        Nome: 'ERRO 2',
        Matricula: 'E002',
        Nascimento: '26/11/1985',
        Admissao: '40/40/2020',
      },
    ],
    expectErros: 4, // 2 CPFs + 2 datas inválidos
  },
];

scenariosReal.forEach((scenario, idx) => {
  console.log(`\n--- Cenário ${idx + 1}: ${scenario.nome} ---`);

  let errosEncontrados = 0;

  scenario.dados.forEach((row, rowIdx) => {
    const cpf = normalizeCPF(row.CPF);
    const cpfValid = isValidCPF(cpf);
    const nascimento = parseFlexibleDate(row.Nascimento);
    const admissao = parseFlexibleDate(row.Admissao);

    if (!cpfValid) errosEncontrados++;
    if (!nascimento) errosEncontrados++;
    if (!admissao) errosEncontrados++;

    console.log(
      `  Linha ${rowIdx + 1}: CPF ${cpfValid ? '✅' : '❌'} | Nasc ${
        nascimento ? '✅' : '❌'
      } | Adm ${admissao ? '✅' : '❌'}`,
    );
  });

  const passed = errosEncontrados === scenario.expectErros;
  console.log(
    `\nEsperado ${scenario.expectErros} erros, encontrou ${errosEncontrados}: ${
      passed ? '✅ PASSOU' : '❌ FALHOU'
    }`,
  );
});

// ================================================================
// RESULTADO FINAL
// ================================================================
console.log('\n=== RESULTADO GERAL ===\n');

const totalTests = cpfPassed + cpfFailed + datesPassed + datesFailed;
const totalPassed = cpfPassed + datesPassed;
const totalFailed = cpfFailed + datesFailed;

console.log(`Total de testes: ${totalTests}`);
console.log(`✅ Passaram: ${totalPassed}`);
console.log(`❌ Falharam: ${totalFailed}`);
console.log(`📊 Taxa de sucesso: ${((totalPassed / totalTests) * 100).toFixed(1)}%\n`);

if (totalFailed === 0) {
  console.log('🎉 TODOS OS TESTES PASSARAM! Sistema pronto para uso.\n');
} else {
  console.log('⚠️  ALGUNS TESTES FALHARAM. Revisar implementação.\n');
}
