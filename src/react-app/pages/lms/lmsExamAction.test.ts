import { describe, expect, it } from 'vitest';
import { getLmsExamAction } from './lmsExamAction';

describe('ação de avaliação do curso', () => {
  it('exibe Fazer avaliação somente com prontidão do Worker', () => {
    expect(getLmsExamAction('READY')).toBe('Fazer avaliação');
  });
  it('reconhece aprovação pendente de fechamento canônico', () => {
    expect(getLmsExamAction('PASSED')).toBe('Confirmar conclusão');
  });
  it.each(['STUDY_PENDING', 'NOT_AVAILABLE', 'COMPLETED', 'EXTERNAL_ASSESSMENT_PENDING', '', null, undefined])(
    'não fabrica botão para estado %s', (state) => {
      expect(getLmsExamAction(state)).toBeNull();
    },
  );
});

import {shouldAutoOpenExternalExam} from './lmsExamAction';
describe('encaminhamento após estudo salvo',()=>{
 const ready={savedStudyEvent:true,isScorm:true,reviewMode:false,newEditionRequired:false,
  completed:false,code:'EXTERNAL_ASSESSMENT_PENDING',missing:['verified_external_assessment']};
 it('abre a prova apenas quando o Worker confirma que somente a avaliação falta',()=>{
  expect(shouldAutoOpenExternalExam(ready)).toBe(true);
  expect(shouldAutoOpenExternalExam({...ready,savedStudyEvent:false})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,code:'SCORE_MISSING'})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,missing:['manifest_required_units']})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,missing:['verified_external_assessment','more']})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,reviewMode:true})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,completed:true})).toBe(false);
  expect(shouldAutoOpenExternalExam({...ready,newEditionRequired:true})).toBe(false);
 });
});
