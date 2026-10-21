import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {isScormStudyTerminalMessage} from '@/react-app/pages/lms/lmsScormStudyMessages';

/**
 * The original Score SCO may emit legacy completion messages. A Player 3
 * study-only session must ignore these signals rather than display a false
 * certificate/qualification or start the terminal reconciliation flow.
 * The final test also asserts that the authenticated player listener uses it.
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
  it('wires the study-only guard before legacy terminal handlers and progress reconciliation',()=>{
    const source=readFileSync(new URL('../react-app/pages/lms/LmsPlayer.tsx',import.meta.url),'utf8');
    const sourceGuard=source.indexOf('isScormStudyTerminalMessage(event.data)');
    const legacyTerminal=source.indexOf("event.data.type === 'lms:completed' &&");
    expect(sourceGuard).toBeGreaterThan(0);
    expect(legacyTerminal).toBeGreaterThan(sourceGuard);
    expect(source).toMatch(/effectiveReviewMode\\s*\\|\\|\\s*scormStudyOnly/);
    expect(source).toMatch(/shouldVerifyCanonicalProgress\\(event\\.data\\.novo_status\\)\\s*&&\\s*!effectiveReviewMode\\s*&&\\s*!scormStudyOnly/);
  });

});
