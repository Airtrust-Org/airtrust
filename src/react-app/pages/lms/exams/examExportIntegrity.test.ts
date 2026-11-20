import {describe,expect,it} from 'vitest';
import {ExamExportIntegrity} from './examExportIntegrity';
const row=(id:string)=>({attemptId:id,examId:'prova',scorePct:80});
const page=(n:number,ids:string[],total=4)=>({
 page:n,limit:2,total,pages:2,items:ids.map(row),
});
describe('CSV completo deve falhar em caso de deriva entre páginas',()=>{
 it('aceita páginas estáveis e valida uma releitura da primeira página',()=>{
  const e=new ExamExportIntegrity(4,2,2);
  e.add(page(1,['a','b']));
  e.add(page(2,['c','d']));
  e.checkFinalPage(page(1,['a','b']));
  expect(e.items().map(x=>x.attemptId)).toEqual(['a','b','c','d']);
 });
 it('interrompe quando nova tentativa desloca paginação e duplica identidade',()=>{
  const e=new ExamExportIntegrity(4,2,2);
  e.add(page(1,['d','c']));
  expect(()=>e.add(page(2,['c','b']))).toThrow('EXAM_EXPORT_DUPLICATE_OR_MISSING_ID');
 });
 it('interrompe quando total de registros muda, sem criar CSV parcial',()=>{
  const e=new ExamExportIntegrity(4,2,2);
  e.add(page(1,['a','b']));
  expect(()=>e.add(page(2,['c','d'],5))).toThrow('EXAM_EXPORT_SCOPE_CHANGED');
 });
 it('interrompe se a primeira página mudar após completar a coleta',()=>{
  const e=new ExamExportIntegrity(4,2,2);
  e.add(page(1,['a','b']));e.add(page(2,['c','d']));
  expect(()=>e.checkFinalPage(page(1,['x','a']))).toThrow('EXAM_EXPORT_DATA_DRIFT');
 });
 it('interrompe se API antiga não fornecer ID, sem confundir ciclos de matrícula',()=>{
  const e=new ExamExportIntegrity(4,2,2);
  expect(()=>e.add({...page(1,['a','b']),items:[{}]})).toThrow('EXAM_EXPORT_DUPLICATE_OR_MISSING_ID');
 });
});
