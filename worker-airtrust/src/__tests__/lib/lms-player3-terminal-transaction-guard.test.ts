import {describe,it,expect} from 'vitest';
import {buildPlayer3TerminalTransactionGuard,Player3TerminalGuardError}
  from '../../services/lms-player3-terminal-transaction-guard';
import type {Player3TerminalAnchor} from '../../services/lms-player3-terminal-transaction-guard';

const sha='a'.repeat(64),bank='b'.repeat(64),policy='c'.repeat(64),source='d'.repeat(64);
const anchor:Player3TerminalAnchor={
  empresaId:6,matriculaId:911,cursoId:80,cicloId:301,
  funcionarioId:51,actorUserId:42,bindingId:900,
  edicaoId:91,politicaId:92,editionHash:sha,
  sourceHash:source,bankHash:bank,policyHash:policy,
  requiredLessonIds:['slide1','slide2'],recordedEventCount:2,
  officialStages:[
    {stageId:'mod1',attemptId:1,attemptNumber:1,answersHash:bank,scorePct:80},
    {stageId:'mod2',attemptId:4,attemptNumber:2,answersHash:source,scorePct:100},
  ],
  gerarQualificacaoAoConcluir:false,
  qualificacaoTipoId:null,qualificacaoCategoriaId:null,
};
describe('Player3 transaction-local, non-routed terminal evidence guard',()=>{
  it('binds exact lesson IDs, per-stage pass receipts and edition identity',()=>{
    const guard=buildPlayer3TerminalTransactionGuard(anchor);
    expect(guard.sql).toContain('lms_native_eventos');
    expect(guard.sql).toContain('lms_player3_tentativas_modulares');
    expect(guard.sql).toContain('t.passed=1');
    expect(guard.sql).toContain('t.answers_sha256');
    expect(guard.sql).toContain('json_each(?)');
    expect(guard.bindings).toContain(JSON.stringify(['slide1','slide2']));
    expect(guard.bindings).toContain(JSON.stringify(anchor.officialStages));
    expect(guard.bindings).toContain(anchor.editionHash);
    expect(guard.bindings).toHaveLength(23);
    expect(guard.sql.match(/\?/g)?.length).toBe(23);
  });
  it('refuses missing lesson coverage, duplicate module ids and unpinned answer hashes',()=>{
    const invalid=[
      {...anchor,requiredLessonIds:[]},
      {...anchor,requiredLessonIds:['slide1','slide1']},
      {...anchor,officialStages:[]},
      {...anchor,officialStages:[anchor.officialStages[0],anchor.officialStages[0]]},
      {...anchor,officialStages:[{...anchor.officialStages[0],answersHash:'not-a-digest'}]},
      {...anchor,recordedEventCount:1},
      {...anchor,editionHash:'wrong'},
      {...anchor,cicloId:0},
    ];
    for(const bad of invalid){
      expect(()=>buildPlayer3TerminalTransactionGuard(bad as Player3TerminalAnchor))
        .toThrow(Player3TerminalGuardError);
    }
  });
  it('requires valid canonical qualification metadata when the course demands it',()=>{
    expect(()=>buildPlayer3TerminalTransactionGuard({
      ...anchor,gerarQualificacaoAoConcluir:true,
    })).toThrow('PLAYER3_TERMINAL_INVALID_QUALIFICATION');
    expect(()=>buildPlayer3TerminalTransactionGuard({
      ...anchor,gerarQualificacaoAoConcluir:false,
      qualificacaoTipoId:7,
    })).toThrow('PLAYER3_TERMINAL_INVALID_QUALIFICATION');
    expect(buildPlayer3TerminalTransactionGuard({
      ...anchor,gerarQualificacaoAoConcluir:true,
      qualificacaoTipoId:7,qualificacaoCategoriaId:8,
    }).bindings).toContain(8);
  });
  it('never performs database writes, and never promises a certificate',()=>{
    const result=buildPlayer3TerminalTransactionGuard(anchor);
    expect(result.sql.trim().startsWith('SELECT json')).toBe(true);
    expect(result.sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/);
    expect(result).not.toHaveProperty('certificate');
  });
});
