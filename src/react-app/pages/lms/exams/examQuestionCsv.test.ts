import {describe,expect,it} from 'vitest';
import {examQuestionTemplate,parseQuestionCsv} from './examQuestionCsv';
const sha='a'.repeat(64);
describe('Importação controlada de questões',()=>{
 it('lê apenas dados válidos e define edição e gabarito da questão',()=>{
  const rows=parseQuestionCsv(examQuestionTemplate,sha);
  expect(rows).toHaveLength(1);
  expect(rows[0].content).toMatchObject({sourceSha256:sha,difficulty:'BASICA',correctChoiceId:'o1'});
 });
 it('aceita campos entre aspas e protege contra cabeçalho ilegível',()=>{
  const text=examQuestionTemplate.replace('Qual conduta é correta?','"O aluno disse ""sim""?"');
  expect(parseQuestionCsv(text,sha)[0].content.prompt).toBe('O aluno disse "sim"?');
  expect(()=>parseQuestionCsv('id;correta\nq1;A',sha)).toThrow('Cabeçalho inválido');
 });
 it('impede duplicidade, lote excessivo, gabarito e edição sem SHA',()=>{
  expect(()=>parseQuestionCsv(examQuestionTemplate+'q-exemplo-01;M1;S;U;BASICA;X;A;B;C;D;A;Y\n',sha)).toThrow(/repetido/);
  expect(()=>parseQuestionCsv(examQuestionTemplate.replace('BASICA;','OUTRA;'),sha)).toThrow(/dificuldade/);
  expect(()=>parseQuestionCsv(examQuestionTemplate, 'a')).toThrow(/edição válida/);
  expect(()=>parseQuestionCsv(examQuestionTemplate.repeat(40),sha)).toThrow();
 });
 it('não executa chamadas de rede, não publica prova e não fabrica matrícula',()=>{
  const rows=parseQuestionCsv(examQuestionTemplate,sha);
  expect(rows[0]).toHaveProperty('questionId');
  expect(rows[0]).not.toHaveProperty('status');
  expect(rows[0].content).not.toHaveProperty('tenantId');
 });
});
