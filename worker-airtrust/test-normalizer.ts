/**
 * TESTES DE NORMALIZAÇÃO DE DADOS
 *
 * Testes unitários para o módulo dataNormalizer.
 * Valida reconhecimento e normalização de diversos formatos.
 */

import { normalizeValue, normalizeRow, isValidCPF, isValidCNPJ } from './src/utils/dataNormalizer';

// ===== TESTES DE DATAS =====

console.log('===== TESTES DE DATAS =====');

// Formato BR: DD/MM/YYYY
console.log(normalizeValue('15/03/2024', 'data_nascimento')); // → '2024-03-15'
console.log(normalizeValue('01/12/2023', 'data_conclusao')); // → '2023-12-01'

// Formato ISO: YYYY-MM-DD
console.log(normalizeValue('2024-03-15', 'data_vencimento')); // → '2024-03-15'

// Formato compacto: DDMMYYYY
console.log(normalizeValue('15032024', 'data_admissao')); // → '2024-03-15'

// Formato Excel (serial date)
console.log(normalizeValue('45383', 'data_obtencao')); // → '2024-03-15' (aprox)

// ===== TESTES DE CPF =====

console.log('\n===== TESTES DE CPF =====');

// CPF com máscara
console.log(normalizeValue('123.456.789-00', 'cpf')); // → '12345678900'
console.log(normalizeValue('123.456.789-00', 'funcionario_cpf')); // → '12345678900'

// CPF sem máscara
console.log(normalizeValue('12345678900', 'cpf')); // → '12345678900'

// CPF inválido (menos de 11 dígitos)
console.log(normalizeValue('123456789', 'cpf')); // → null

// Validação de CPF
console.log('\nValidação CPF:');
console.log(isValidCPF('12345678900')); // → false (inválido)
console.log(isValidCPF('00000000000')); // → false (sequência)

// ===== TESTES DE CNPJ =====

console.log('\n===== TESTES DE CNPJ =====');

// CNPJ com máscara
console.log(normalizeValue('12.345.678/0001-90', 'cnpj')); // → '12345678000190'

// CNPJ sem máscara
console.log(normalizeValue('12345678000190', 'cnpj')); // → '12345678000190'

// ===== TESTES DE TELEFONE =====

console.log('\n===== TESTES DE TELEFONE =====');

// Telefone com máscara
console.log(normalizeValue('(11) 98765-4321', 'telefone')); // → '11987654321'
console.log(normalizeValue('11 98765-4321', 'celular')); // → '11987654321'

// Telefone sem máscara
console.log(normalizeValue('11987654321', 'telefone')); // → '11987654321'

// ===== TESTES DE CEP =====

console.log('\n===== TESTES DE CEP =====');

// CEP com máscara
console.log(normalizeValue('12345-678', 'cep')); // → '12345678'

// CEP sem máscara
console.log(normalizeValue('12345678', 'cep')); // → '12345678'

// ===== TESTES DE EMAIL =====

console.log('\n===== TESTES DE EMAIL =====');

// Email válido
console.log(normalizeValue('JOAO.SILVA@EMPRESA.COM.BR', 'email')); // → 'joao.silva@empresa.com.br'
console.log(normalizeValue('  teste@teste.com  ', 'mail')); // → 'teste@teste.com'

// Email inválido
console.log(normalizeValue('email_invalido', 'email')); // → null

// ===== TESTES DE BOOLEANOS =====

console.log('\n===== TESTES DE BOOLEANOS =====');

// Sim/Não
console.log(normalizeValue('sim', 'ativo')); // → true
console.log(normalizeValue('SIM', 'ativo')); // → true
console.log(normalizeValue('s', 'ativo')); // → true
console.log(normalizeValue('não', 'ativo')); // → false
console.log(normalizeValue('NAO', 'ativo')); // → false
console.log(normalizeValue('n', 'ativo')); // → false

// True/False
console.log(normalizeValue('true', 'aprovado')); // → true
console.log(normalizeValue('false', 'aprovado')); // → false

// 1/0
console.log(normalizeValue('1', 'obrigatorio')); // → true
console.log(normalizeValue('0', 'obrigatorio')); // → false

// ===== TESTES DE NÚMEROS DECIMAIS =====

console.log('\n===== TESTES DE NÚMEROS DECIMAIS =====');

// Vírgula como separador decimal (BR)
console.log(normalizeValue('9,5', 'nota')); // → 9.5
console.log(normalizeValue('1500,00', 'valor')); // → 1500

// Ponto como separador decimal (US)
console.log(normalizeValue('9.5', 'nota')); // → 9.5

// ===== TESTES DE NÚMEROS INTEIROS =====

console.log('\n===== TESTES DE NÚMEROS INTEIROS =====');

// Número puro
console.log(normalizeValue('40', 'carga_horaria')); // → 40
console.log(normalizeValue('25', 'idade')); // → 25

// Número com caracteres não numéricos
console.log(normalizeValue('40 horas', 'carga_horaria')); // → 40

// ===== TESTES DE CÓDIGOS =====

console.log('\n===== TESTES DE CÓDIGOS =====');

// Código com espaços e minúsculas
console.log(normalizeValue('cma 1', 'codigo')); // → 'CMA_1'
console.log(normalizeValue('check pc', 'qualificacao_codigo')); // → 'CHECK_PC'

// Código com acentos
console.log(normalizeValue('código 123', 'codigo')); // → 'CODIGO_123'

// Matrícula
console.log(normalizeValue('mat001', 'matricula')); // → 'MAT001'

// ===== TESTES DE UPPERCASE =====

console.log('\n===== TESTES DE UPPERCASE =====');

// Categoria
console.log(normalizeValue('cma', 'categoria')); // → 'CMA'
console.log(normalizeValue('presencial', 'modalidade')); // → 'PRESENCIAL'

// Status
console.log(normalizeValue('valida', 'status')); // → 'VALIDA'

// ===== TESTE DE OBJETO COMPLETO =====

console.log('\n===== TESTE DE OBJETO COMPLETO =====');

const row = {
  funcionario_cpf: '123.456.789-00',
  data_nascimento: '15/03/1985',
  email: 'JOAO@EMPRESA.COM',
  telefone: '(11) 98765-4321',
  ativo: 'sim',
  nota: '9,5',
  carga_horaria: '40',
  qualificacao_codigo: 'cma 1',
  categoria: 'cma',
  data_conclusao: '01/12/2023',
};

console.log('Antes:', row);
console.log('Depois:', normalizeRow(row));

console.log('\n✅ Testes concluídos!');
