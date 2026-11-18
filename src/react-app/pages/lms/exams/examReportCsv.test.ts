import {describe,it,expect} from 'vitest';
import {buildExamResultsCsv} from './examReportCsv';
describe('Exportação CSV de avaliações',()=>{
 it('inclui somente as linhas recebidas, inclusive nota zero e estado reprovado',()=>{
  const csv=buildExamResultsCsv([{
   alunoNome:'Ana',matriculaId:1,cursoTitulo:'EAD',cursoId:2,
   examId:'CRM',version:1,attemptNo:2,scorePct:0,
   state:'SUBMITTED',passed:false,submittedAt:'2026-11-18 12:00:00',
  }]);
  expect(csv).toContain('"Ana";"1";"EAD";"2"');
  expect(csv).toContain('"0";"Reprovado"');
  expect(csv.split('\r\n')).toHaveLength(3);
 });
 it('neutraliza fórmula em nome e título e não permite quebra de linha',()=>{
  const csv=buildExamResultsCsv([{
   alunoNome:'=HYPERLINK("evil")',matriculaId:1,cursoTitulo:'-cmd\r\nx',cursoId:2,
   examId:'@unsafe',version:1,attemptNo:1,scorePct:null,
   state:'IN_PROGRESS',passed:null,submittedAt:null,
  }]);
  expect(csv).toContain('"\u0027=HYPERLINK(""evil"")"');
  expect(csv).toContain('"\u0027-cmd  x"');
  expect(csv).toContain('"\u0027@unsafe"');
  expect(csv).not.toContain('"-cmd\r\n');
 });
});
