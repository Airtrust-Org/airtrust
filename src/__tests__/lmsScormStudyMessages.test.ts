import {describe,expect,it} from 'vitest';
import {isScormStudyTerminalMessage} from '@/react-app/pages/lms/lmsScormStudyMessages';

/**
 * The original Score SCO may emit legacy completion messages. A Player 3
 * study-only session must ignore these signals rather than display a false
 * certificate/qualification or start the terminal reconciliation flow.
 * This verifies the predicate; the iframe listener still must wire it in.
 */
describe('SCORM Player 3 study-only terminal messages',()=>{
  it.each([
    'lms:completed',
    'lms:completion-pending',
    'lms:completion-error',
  ])('classifies %s as terminal, regardless of payload claims',(type)=>{
    expect(isScormStudyTerminalMessage({type,matriculaId:101,
      qualificacao_gerada:true,novo_status:'CONCLUIDO'})).toBe(true);
  });

  it.each([
    null,undefined,'lms:completed',0,false,[],['lms:completed'],
    {},{type:null},{type:0},{type:['lms:completed']},
    {type:'lms:progress',novo_status:'EM_ANDAMENTO'},
    {type:'lms:navigate:ack'},{type:'lms:completion-diagnostics'},
  ])('does not suppress non-terminal payloads (%j)',(value)=>{
    expect(isScormStudyTerminalMessage(value)).toBe(false);
  });

  it('does not trust unrelated terminal-looking strings',()=>{
    expect(isScormStudyTerminalMessage({type:'lms:completed:debug'})).toBe(false);
    expect(isScormStudyTerminalMessage({type:'lms:completion-error-legacy'})).toBe(false);
  });
});
