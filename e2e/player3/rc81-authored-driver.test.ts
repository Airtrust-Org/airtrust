import {describe,expect,it} from 'vitest';
import {resolveAuthoredChoiceIndex} from './rc81-authored-driver';

describe('Front D — original RC8.1 iframe is driven by reviewed visual labels',()=>{
  it('selects the exact author-rendered option, never an answer index from the bank',()=>{
    expect(resolveAuthoredChoiceIndex([
      'Decolagem segura', 'Procedimento de segurança', 'Procedimento',
    ],'Procedimento')).toBe(2);
  });
  it('normalizes author HTML whitespace only',()=>{
    expect(resolveAuthoredChoiceIndex([
      '   Procedimento\n de   segurança  ','Outra alternativa',
    ],'Procedimento de segurança')).toBe(0);
  });
  it('fails closed on missing, partial, or duplicate choice labels',()=>{
    for(const [options,label] of [
      [['Curto','Muito longo'],'Longo'],
      [['Procedimento','Procedimento'],'Procedimento'],
      [['A','B'],''],
    ] as const){
      expect(()=>resolveAuthoredChoiceIndex(options,label))
        .toThrow('PLAYER3_CONTRACT_MISSING:');
    }
  });
  it('never turns a prefabricated correct option into an unreviewed browser click',()=>{
    const labels=['Não realizar','Avaliar antes de prosseguir'];
    expect(()=>resolveAuthoredChoiceIndex(labels,'Resposta certa'))
      .toThrow('RC81_ORIGINAL_OPTION_NOT_UNIQUE');
  });
});
